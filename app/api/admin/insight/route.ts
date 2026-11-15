// P3 — POST /api/admin/insight { issueId } (staff only): is this a recurring problem here?
// Same place + problem type in the last 45 days (excluding rejected and itself). < 3 → { recurring:false, count } without AI.
// Else Claude (rule-based fallback), cached in issues.ai_insight for 1 hour.
import { NextResponse } from "next/server";
import { analyzeRecurrence, ruleRecurrence, type Recurrence } from "@/lib/ai";
import { requireAdmin } from "@/lib/admin-server";
import { catInfo } from "@/lib/campus";
import { supabaseAdmin } from "@/lib/supabase-server";

export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86400_000;

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const b = (await req.json().catch(() => null)) as { issueId?: string } | null;
  if (!b?.issueId || !UUID.test(b.issueId)) return NextResponse.json({ error: "issueId (uuid) is required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: i } = await db.from("issues").select("id, category, location_id, ai_insight, locations(name)").eq("id", b.issueId).maybeSingle();
  if (!i) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const cached = i.ai_insight as (Recurrence & { computed_at?: string }) | null;
  if (cached?.computed_at && Date.now() - +new Date(cached.computed_at) < 3600_000) return NextResponse.json({ ...cached, cached: true });

  const { data: similar } = await db
    .from("issues")
    .select("title, status, created_at, resolved_at")
    .eq("location_id", i.location_id)
    .eq("category", i.category)
    .neq("id", i.id)
    .neq("status", "rejected")
    .gte("created_at", new Date(Date.now() - 45 * DAY).toISOString())
    .order("created_at", { ascending: false });
  const rows = similar ?? [];
  const count = rows.length;
  if (count < 3) return NextResponse.json({ recurring: false, count });

  const fixes = rows.filter((r) => r.resolved_at).map((r) => (+new Date(r.resolved_at!) - +new Date(r.created_at)) / DAY).sort((a, b) => a - b);
  const median = fixes.length ? Math.round((fixes.length % 2 ? fixes[(fixes.length - 1) / 2] : (fixes[fixes.length / 2 - 1] + fixes[fixes.length / 2]) / 2) * 10) / 10 : null;
  const loc = (Array.isArray(i.locations) ? i.locations[0] : i.locations) as { name: string } | null;
  const input = {
    location: loc?.name ?? "this building",
    category: catInfo(i.category).label,
    count,
    resolved: fixes.length,
    medianDays: median,
    recent: rows.slice(0, 5).map((r) => ({ title: r.title, date: r.created_at.slice(0, 10), status: r.status })),
  };
  let result: Recurrence;
  let ai = true;
  try {
    result = await analyzeRecurrence(input);
  } catch (err) {
    console.warn("[api/admin/insight] AI unavailable, rules:", (err as Error).message);
    result = ruleRecurrence(input);
    ai = false;
  }
  const insight = { ...result, count, resolved: fixes.length, median_days: median, computed_at: new Date().toISOString(), ai };
  await db.from("issues").update({ ai_insight: insight }).eq("id", i.id);
  return NextResponse.json(insight);
}
