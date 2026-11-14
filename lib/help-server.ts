// Help SC server helpers (service role). Used only by app/api/help/*.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFromRequest, supabaseAdmin } from "./supabase-server";
import type { HelpBlocked } from "./help-types";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_PHOTO_BYTES = 1_500_000;
export const ON_CAMPUS = (lat: number, lng: number) => lat > 34.012 && lat < 34.03 && lng > -118.3 && lng < -118.275;

export const bad = (status: number, error: string) => NextResponse.json({ error }, { status });
export const blocked = (reason: string, emergency: boolean) =>
  NextResponse.json({ error: reason, blocked: true, emergency } satisfies HelpBlocked, { status: 422 });

/** Signed-in (anonymous) user + service-role client, or an error response. */
export async function authed(req: Request): Promise<{ db: SupabaseClient; userId: string } | NextResponse> {
  let db: SupabaseClient;
  try {
    db = supabaseAdmin();
  } catch {
    return bad(503, "Server is not configured");
  }
  const userId = await getUserFromRequest(req).catch(() => null);
  if (!userId) return bad(401, "Sign-in required");
  return { db, userId };
}

/** Decode + size-check a base64 JPEG. Returns null if absent, or an error response. */
export function decodePhoto(b64: unknown): Buffer | null | NextResponse {
  if (b64 === undefined || b64 === null || b64 === "") return null;
  if (typeof b64 !== "string") return bad(400, "imageBase64 must be a string");
  const buf = Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64");
  if (buf.length < 100 || buf.length > MAX_PHOTO_BYTES) return bad(413, "Photo is empty or too large");
  return buf;
}

/** Count rows by this author in the last hour (simple abuse limit). */
export async function recentCount(db: SupabaseClient, table: "help_posts" | "help_replies", userId: string) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("author_id", userId).gte("created_at", since);
  return count ?? 0;
}

export const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
