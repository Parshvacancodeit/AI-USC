// P3 — POST /api/admin/fix-review { issueId, note? } (staff only): "Send back" a submitted fix.
// Clears the after photo + AI verdict so the office can submit again through the same link. Status stays assigned.
// (Confirm resolved uses the existing /api/admin/action resolve.)
import { NextResponse } from "next/server";
import { logEvent, requireAdmin } from "@/lib/admin-server";
import { supabaseAdmin } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const b = (await req.json().catch(() => null)) as { issueId?: string; note?: string } | null;
  if (!b?.issueId || !UUID.test(b.issueId)) return NextResponse.json({ error: "issueId (uuid) is required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: issue } = await db.from("issues").select("id, status, assigned_team").eq("id", b.issueId).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (issue.status !== "assigned") return NextResponse.json({ error: "Only an in-progress issue can be sent back" }, { status: 409 });

  const now = new Date().toISOString();
  const upd = await db.from("issues").update({ after_photo_path: null, ai_fix_verdict: null, updated_at: now }).eq("id", issue.id);
  if (upd.error) return NextResponse.json({ error: `Could not update: ${upd.error.message}` }, { status: 500 });
  await db.from("fix_tokens").update({ fix_submitted_at: null }).eq("issue_id", issue.id);
  const note = (b.note ?? "").trim().slice(0, 200);
  await logEvent(issue.id, admin.name, "status", `Sent back to ${issue.assigned_team ?? "the office"}${note ? `: ${note}` : ""}`).catch(() => {});
  return NextResponse.json({ ok: true });
}
