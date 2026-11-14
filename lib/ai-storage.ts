// P3 — server only. Supabase helpers for the AI routes, on top of P2's lib/supabase-server.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryDef, DEFAULT_CATEGORIES, type CategoryDef } from "./ai";
import { supabaseAdmin as serverClient } from "./supabase-server";

/** Returns null when Supabase isn't configured (routes then degrade gracefully). */
export function supabaseAdmin(): SupabaseClient | null {
  try {
    return serverClient();
  } catch {
    return null;
  }
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

// ---------- Dynamic categories ----------
// Source of truth = `routing` table: one row per category (category, team_name, team_email,
// optional label + description). Cached 60 s per server instance.
const TTL_MS = 60_000;
let cache: { at: number; list: CategoryDef[] } | null = null;

export async function loadCategories(): Promise<CategoryDef[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  const sb = supabaseAdmin();
  if (!sb) return DEFAULT_CATEGORIES;
  // select("*") so it works before and after P2 adds the optional label/description columns
  const { data, error } = await sb.from("routing").select("*").order("category");
  if (error || !data?.length) {
    if (error) console.warn("[ai-storage] routing unavailable, using default categories:", error.message);
    return cache?.list ?? DEFAULT_CATEGORIES;
  }
  const list = data.filter((r) => typeof r.category === "string" && r.category).map(categoryDef);
  cache = { at: Date.now(), list };
  return list;
}
