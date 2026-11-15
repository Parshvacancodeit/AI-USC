// P3 — POST /api/admin/draft-reminder { issueId } (staff only) → { subject, body, ai }.
// Claude drafts a polite, firm follow-up for an office that hasn't acknowledged; template if AI is unavailable.
import { NextResponse } from "next/server";
import { templateReminder, writeReminder, type Reminder, type ReminderInput } from "@/lib/ai";
import { requireAdmin } from "@/lib/admin-server";
import { deadlineHours } from "@/lib/sla";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Priority } from "@/lib/types";

export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const b = (await req.json().catch(() => null)) as { issueId?: string } | null;
  if (!b?.issueId || !UUID.test(b.issueId)) return NextResponse.json({ error: "issueId (uuid) is required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: i } = await db.from("issues").select("id, title, floor, priority, category, reporter_count, assigned_team, assigned_at, locations(name)").eq("id", b.issueId).maybeSingle();
  if (!i) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const { data: events } = await db.from("issue_events").select("type, created_at").eq("issue_id", i.id);
  const sent = (events ?? []).filter((e) => e.type === "work_order").map((e) => +new Date(e.created_at));
  const since = sent.length ? Math.min(...sent) : i.assigned_at ? +new Date(i.assigned_at) : Date.now();
  const loc = (Array.isArray(i.locations) ? i.locations[0] : i.locations) as { name: string } | null;

  const input: ReminderInput = {
    title: i.title,
    location: loc?.name ?? "USC campus",
    floor: i.floor,
    office: i.assigned_team ?? "the office",
    priority: i.priority as Priority,
    reporterCount: i.reporter_count,
    hoursWaiting: (Date.now() - since) / 3600_000,
    deadlineHours: deadlineHours(i.priority as Priority),
    accessibility: i.category === "elevator_access",
    previousReminders: (events ?? []).filter((e) => e.type === "reminder").length, // (fallback-typed reminders aren't counted; minor)
  };
  let r: Reminder;
  let ai = true;
  try {
    r = await writeReminder(input);
  } catch (err) {
    console.warn("[draft-reminder] AI unavailable, template:", (err as Error).message);
    r = templateReminder(input);
    ai = false;
  }
  return NextResponse.json({ ...r, ai });
}
