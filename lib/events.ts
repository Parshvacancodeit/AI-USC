// P3: issue_events insert with a fallback type. If the DB's type check doesn't allow a newer type yet
// (supabase/copilot.sql not run), the event is saved as `fallback` instead of being silently lost.
import { supabaseAdmin } from "./supabase-server";

export async function logEventSafe(issueId: string, actor: string, type: string, text: string, data?: object, fallback?: { type: string; text: string }) {
  const db = supabaseAdmin();
  const row = { issue_id: issueId, actor_name: actor, data: data ?? null };
  const { error } = await db.from("issue_events").insert({ ...row, type, text: text.slice(0, 300) });
  if (!error) return;
  if (fallback && error.code === "23514") {
    const r = await db.from("issue_events").insert({ ...row, type: fallback.type, text: fallback.text.slice(0, 300) });
    if (!r.error) return;
  }
  console.warn(`[events] couldn't log ${type}:`, error.message);
}
