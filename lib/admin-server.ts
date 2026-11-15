// Server only. Admin auth (passcode for now; staff roles later) + audit logging.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase-server";

/** Returns the admin's display name. (Kept the NextResponse branch in the type so callers stay unchanged.) */
export function requireAdmin(req: Request): { name: string } | NextResponse {
  // Open access for the hackathon demo: no passcode. Production: USC SSO + staff roles (docs/ADMIN_BACKEND_REQUIREMENTS.md).
  const name = decodeURIComponent(req.headers.get("x-admin-name") ?? "").trim().slice(0, 60) || "Office admin";
  return { name };
}

export async function logEvent(issueId: string, actorName: string, type: string, text: string, data?: object) {
  await supabaseAdmin().from("issue_events").insert({ issue_id: issueId, actor_name: actorName, type, text: text.slice(0, 300), data: data ?? null });
}
