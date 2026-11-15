// P3 — office page API (no login; the one-time token is the credential).
// GET  → issue summary for the office.
// POST { action: "acknowledge" } → office has seen it (student page already shows "In progress").
// POST { action: "submit_fix", imageBase64 } → after photo + Claude before/after verdict. Does NOT resolve:
//      the supervisor confirms in /admin.
import { NextResponse } from "next/server";
import { logEvent } from "@/lib/admin-server";
import { logEventSafe } from "@/lib/events";
import { departmentFor } from "@/lib/departments";
import { saveAndCheckFix } from "@/lib/fix-check";
import { hashToken, looksLikeToken } from "@/lib/fix-tokens";
import { supabaseAdmin } from "@/lib/supabase-server";

export const maxDuration = 30;
type Ctx = { params: Promise<{ token: string }> };
const bad = (status: number, error: string, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

async function load(token: string) {
  if (!looksLikeToken(token)) return { err: bad(404, "This link isn't valid.", "invalid") };
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return { err: bad(503, "Ripple isn't configured.") };
  }
  const { data: t, error } = await db.from("fix_tokens").select("token_hash, issue_id, office, expires_at, acknowledged_at, fix_submitted_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) return { err: bad(500, "Couldn't check this link. Try again.") };
  if (!t) return { err: bad(404, "This link isn't valid.", "invalid") };
  if (new Date(t.expires_at) < new Date()) return { err: bad(410, "This link has expired. Ask the Ripple supervisor to resend the work order.", "expired") };
  const { data: issue } = await db
    .from("issues")
    .select("id, title, description, priority, status, floor, category, before_photo_path, after_photo_path, ai_fix_verdict, locations(name, lat, lng)")
    .eq("id", t.issue_id)
    .maybeSingle();
  if (!issue) return { err: bad(404, "This issue no longer exists.", "invalid") };
  return { db, t, issue };
}

function summary(db: ReturnType<typeof supabaseAdmin>, t: { office: string; acknowledged_at: string | null; fix_submitted_at: string | null }, i: Record<string, unknown>) {
  const loc = (Array.isArray(i.locations) ? i.locations[0] : i.locations) as { name: string; lat: number; lng: number } | null;
  const pub = (bucket: string, p: unknown) => (typeof p === "string" ? db.storage.from(bucket).getPublicUrl(p).data.publicUrl : null);
  return {
    office: t.office,
    department: departmentFor(t.office).name,
    acknowledged_at: t.acknowledged_at,
    fix_submitted_at: t.fix_submitted_at,
    issue: {
      title: i.title,
      description: i.description,
      priority: i.priority,
      status: i.status,
      floor: i.floor,
      location: loc?.name ?? "USC campus",
      map: loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : null,
      photo_url: pub("report-photos", i.before_photo_path),
      after_photo_url: i.after_photo_path ? `${pub("resolution-photos", i.after_photo_path)}?v=${Date.now()}` : null,
      verdict: i.ai_fix_verdict ?? null,
    },
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const r = await load((await params).token);
  if ("err" in r) return r.err;
  return NextResponse.json(summary(r.db, r.t, r.issue));
}

export async function POST(req: Request, { params }: Ctx) {
  const r = await load((await params).token);
  if ("err" in r) return r.err;
  const { db, t, issue } = r;
  const b = (await req.json().catch(() => null)) as { action?: string; imageBase64?: string } | null;
  if (issue.status === "resolved" || issue.status === "rejected") return bad(409, `This issue is already ${issue.status}.`);
  const now = new Date().toISOString();
  const actor = `${t.office} (office link)`;

  async function acknowledge() {
    if (t.acknowledged_at) return;
    await db.from("fix_tokens").update({ acknowledged_at: now }).eq("token_hash", t.token_hash);
    t.acknowledged_at = now;
    // Student page shows "In progress" for assigned issues
    await db.from("issues").update({ status: "assigned", updated_at: now }).eq("id", issue.id).eq("status", "open");
    await logEventSafe(issue.id, actor, "acknowledged", `${t.office} acknowledged`, undefined, { type: "status", text: `Acknowledged by ${t.office}` });
  }

  if (b?.action === "acknowledge") {
    await acknowledge();
    return NextResponse.json(summary(db, t, issue));
  }

  if (b?.action === "submit_fix") {
    const img = typeof b.imageBase64 === "string" ? b.imageBase64.replace(/^data:[^,]+,/, "") : "";
    if (img.length < 100) return bad(400, "Add an after photo.");
    if (img.length > 4_000_000) return bad(413, "That photo is too large.");
    await acknowledge();
    try {
      const v = await saveAndCheckFix(db, { id: issue.id as string, title: issue.title as string, description: (issue.description as string) ?? null, before_photo_path: (issue.before_photo_path as string) ?? null }, img);
      await db.from("fix_tokens").update({ fix_submitted_at: now }).eq("token_hash", t.token_hash);
      t.fix_submitted_at = now;
      const label = v.resolved ? `looks fixed (${Math.round(v.confidence * 100)}%)` : "not confirmed";
      await logEvent(issue.id, actor, "after_photo", `Fix submitted by ${t.office}. AI: ${label}. ${v.reason}`.slice(0, 300), { verdict: v }).catch(() => {});
      const { data: fresh } = await db.from("issues").select("id, title, description, priority, status, floor, category, before_photo_path, after_photo_path, ai_fix_verdict, locations(name, lat, lng)").eq("id", issue.id).maybeSingle();
      return NextResponse.json(summary(db, t, fresh ?? issue));
    } catch (err) {
      console.error("[api/fix] submit_fix:", err);
      return bad(500, "Couldn't save the photo. Try again.");
    }
  }
  return bad(400, "Unknown action");
}
