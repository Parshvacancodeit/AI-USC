// P3 — server only. Minimal service-role Supabase helpers for the AI routes.
// TODO(P2): swap the client for lib/supabase-server.ts when it lands.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/** Returns null when Supabase isn't configured yet (routes then degrade gracefully). */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin ??= createClient(url, key, { auth: { persistSession: false } });
  return admin;
}

/** Downloads a stored photo and returns base64, or null. */
export async function photoBase64(sb: SupabaseClient, bucket: string, path: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer()).toString("base64");
}

export function publicUrl(sb: SupabaseClient, bucket: string, path: string): string {
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
