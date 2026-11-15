// Server only. Admin auth (passcode for now; staff roles later) + audit logging.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase-server";

/** Returns the admin's display name, or a 401 response. */
export function requireAdmin(req: Request): { name: string } | NextResponse {
  const expected = process.env.ADMIN_PASSCODE;
  const given = req.headers.get("x-admin-passcode") ?? "";
  // Locked by default in production: no passcode configured = no staff access.
  if (!expected && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Staff access isn't configured (set ADMIN_PASSCODE)" }, { status: 503 });
  if (expected && given !== expected) return NextResponse.json({ error: "Not signed in as staff" }, { status: 401 });
  const name = decodeURIComponent(req.headers.get("x-admin-name") ?? "").trim().slice(0, 60) || "Office admin";
  return { name };
}

export async function logEvent(issueId: string, actorName: string, type: string, text: string, data?: object) {
  await supabaseAdmin().from("issue_events").insert({ issue_id: issueId, actor_name: actorName, type, text: text.slice(0, 300), data: data ?? null });
}
