// P3 — POST /api/admin/brief { window: "today" | "week" } (staff only).
// Server computes the stats from issues + issue_events FIRST; Claude only words them (template fallback).
import { NextResponse } from "next/server";
import { templateBrief, writeBrief, type Brief, type BriefStats } from "@/lib/ai";
import { requireAdmin } from "@/lib/admin-server";
import { catInfo } from "@/lib/campus";
import { isOverdue } from "@/lib/sla";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Priority } from "@/lib/types";

export const maxDuration = 30;
const H = 3600_000;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const b = (await req.json().catch(() => null)) as { window?: string } | null;
  const window: "today" | "week" = b?.window === "week" ? "week" : "today";
  const db = supabaseAdmin();
  const [{ data: issues, error }, { data: events }] = await Promise.all([
    db.from("issues").select("id, status, priority, category, location_id, reporter_count, assigned_team, assigned_at, first_response_at, created_at, resolved_at, locations(name)").neq("status", "rejected"),
    db.from("issue_events").select("issue_id, type, text, actor_name, created_at"),
  ]);
  if (error) return NextResponse.json({ error: "Couldn't load issues" }, { status: 500 });
  const now = Date.now();
  const since = now - (window === "today" ? 24 : 24 * 7) * H;
  const evBy = new Map<string, { type: string; text: string; by: string; at: string }[]>();
  (events ?? []).forEach((e) => evBy.set(e.issue_id, [...(evBy.get(e.issue_id) ?? []), { type: e.type, text: e.text, by: e.actor_name, at: e.created_at }]));
  const name = (i: { locations: unknown }) => ((Array.isArray(i.locations) ? i.locations[0] : i.locations) as { name: string } | null)?.name ?? "USC campus";

  const all = issues ?? [];
  const created = all.filter((i) => +new Date(i.created_at) >= since);
  const active = all.filter((i) => i.status === "open" || i.status === "assigned");
  const resolved = all.filter((i) => i.resolved_at && +new Date(i.resolved_at) >= since);
  const overdue = new Map<string, number>();
  active.forEach((i) => {
    if (isOverdue({ status: i.status, priority: i.priority as Priority, assigned_at: i.assigned_at, events: (evBy.get(i.id) ?? []) as never }, now)) overdue.set(i.assigned_team ?? "Unassigned", (overdue.get(i.assigned_team ?? "Unassigned") ?? 0) + 1);
  });
  const recur = new Map<string, { place: string; problem: string; count: number }>();
  all.filter((i) => +new Date(i.created_at) >= now - 45 * 24 * H).forEach((i) => {
    const k = `${i.location_id}|${i.category}`;
    const r = recur.get(k) ?? { place: name(i), problem: catInfo(i.category).label, count: 0 };
    r.count++;
    recur.set(k, r);
  });
  const ackBy = new Map<string, number[]>();
  all.filter((i) => i.assigned_at && i.first_response_at && i.assigned_team).forEach((i) => {
    const h = (+new Date(i.first_response_at!) - +new Date(i.assigned_at!)) / H;
    if (h >= 0) ackBy.set(i.assigned_team!, [...(ackBy.get(i.assigned_team!) ?? []), h]);
  });
  const slow = [...ackBy.entries()].filter(([, xs]) => xs.length >= 2).map(([office, xs]) => ({ office, median_hours_to_acknowledge: median(xs)! })).sort((a, b) => b.median_hours_to_acknowledge - a.median_hours_to_acknowledge)[0] ?? null;

  const stats: BriefStats = {
    window,
    new_issues: created.length,
    new_reporters: created.reduce((n, i) => n + (i.reporter_count ?? 0), 0),
    open_by_priority: Object.fromEntries(["urgent", "high", "medium", "low"].map((p) => [p, active.filter((i) => i.priority === p).length])),
    resolved_in_window: resolved.length,
    median_hours_to_fix: median(resolved.map((i) => (+new Date(i.resolved_at!) - +new Date(i.created_at)) / H)),
    overdue_by_office: [...overdue.entries()].map(([office, count]) => ({ office, count })).sort((a, b) => b.count - a.count),
    top_recurring: [...recur.values()].filter((r) => r.count >= 3).sort((a, b) => b.count - a.count).slice(0, 3),
    open_accessibility: active.filter((i) => i.category === "elevator_access").length,
    slowest_office: slow,
  };
  let brief: Brief;
  let ai = true;
  try {
    brief = await writeBrief(stats);
  } catch (err) {
    console.warn("[api/admin/brief] AI unavailable, template:", (err as Error).message);
    brief = templateBrief(stats);
    ai = false;
  }
  return NextResponse.json({ ...brief, stats, ai });
}
