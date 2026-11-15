// POST /api/help/related { postId } → { items } — AI-picked recent posts/replies that help with this post.
// Text-only Claude call over the last 3 h of the same section; cached 3 min per post; [] when AI is down.
import { NextResponse } from "next/server";
import { relatedHelp, type RelatedCandidate } from "@/lib/ai";
import type { HelpKind, HelpPost, HelpReply } from "@/lib/help-types";
import { authed, bad, UUID } from "@/lib/help-server";

export const maxDuration = 30;
export type RelatedItem = { postId: string; replyId: string | null; text: string; place: string; created_at: string; why: string };

const cache = new Map<string, { at: number; items: RelatedItem[] }>();
const TTL = 3 * 60_000;
const sameSection = (k: HelpKind): HelpKind[] => (k === "ask" ? ["ask"] : k === "favor" ? ["favor"] : ["lost", "found"]);

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  const { db } = a;
  const b = (await req.json().catch(() => null)) as { postId?: string } | null;
  if (!b?.postId || !UUID.test(b.postId)) return bad(400, "postId (uuid) is required");

  const hit = cache.get(b.postId);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ items: hit.items });

  const { data: post } = await db.from("help_posts").select("*").eq("id", b.postId).maybeSingle<HelpPost>();
  if (!post) return bad(404, "Post not found");

  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data: posts } = await db
    .from("help_posts")
    .select("id, title, body, location_name, created_at")
    .in("kind", sameSection(post.kind))
    .neq("id", post.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);
  const postIds = (posts ?? []).map((p) => p.id);
  const { data: replies } = await db
    .from("help_replies")
    .select("id, post_id, body, created_at")
    .gte("created_at", since)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  const placeOf = new Map((posts ?? []).map((p) => [p.id, p.location_name as string]));
  const mins = (iso: string) => Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000));
  const byId = new Map<string, RelatedItem>();
  const candidates: RelatedCandidate[] = [];
  for (const p of posts ?? []) {
    const text = [p.title, p.body].filter(Boolean).join(" — ");
    byId.set(`p:${p.id}`, { postId: p.id, replyId: null, text, place: p.location_name, created_at: p.created_at, why: "" });
    candidates.push({ id: `p:${p.id}`, text, place: p.location_name, minutesAgo: mins(p.created_at) });
  }
  for (const r of (replies ?? []) as Pick<HelpReply, "id" | "post_id" | "body" | "created_at">[]) {
    if (r.post_id !== post.id && !placeOf.has(r.post_id)) continue; // only this section's threads
    if (r.post_id === post.id) continue; // replies here are already on screen
    const place = placeOf.get(r.post_id) ?? "USC";
    byId.set(`r:${r.id}`, { postId: r.post_id, replyId: r.id, text: r.body!, place, created_at: r.created_at, why: "" });
    candidates.push({ id: `r:${r.id}`, text: r.body!, place, minutesAgo: mins(r.created_at) });
  }
  if (!postIds.length && !candidates.length) return NextResponse.json({ items: [] });

  let items: RelatedItem[] = [];
  try {
    const picks = await relatedHelp({ text: [post.title, post.body].filter(Boolean).join(" — "), place: post.location_name, candidates });
    items = picks.map((p) => ({ ...byId.get(p.id)!, why: p.why }));
  } catch (err) {
    console.warn("[api/help/related] AI unavailable:", (err as Error).message);
  }
  cache.set(post.id, { at: Date.now(), items });
  return NextResponse.json({ items });
}
