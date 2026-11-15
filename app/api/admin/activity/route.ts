// GET /api/admin/activity — audit events + internal notes for the console (staff only).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const db = supabaseAdmin();
  const [events, notes] = await Promise.all([
    db.from("issue_events").select("issue_id, actor_name, type, text, created_at").order("created_at", { ascending: true }).limit(2000),
    db.from("issue_notes").select("issue_id, author_name, text, created_at").order("created_at", { ascending: true }).limit(2000),
  ]);
  if (events.error || notes.error) return NextResponse.json({ error: (events.error ?? notes.error)!.message }, { status: 500 });
  return NextResponse.json({ events: events.data, notes: notes.data });
}
