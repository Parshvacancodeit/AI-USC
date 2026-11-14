// POST /api/help/replies — answer a question, offer a favor, or reply about a lost/found item.
import { NextResponse } from "next/server";
import { moderateHelp } from "@/lib/ai";
import type { CreateReplyRequest, HelpPost } from "@/lib/help-types";
import { authed, bad, blocked, cleanText, decodePhoto, recentCount, UUID } from "@/lib/help-server";

export const maxDuration = 30;
const MAX_REPLIES_PER_HOUR = 20;

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  const { db, userId } = a;

  const b = (await req.json().catch(() => null)) as Partial<CreateReplyRequest> | null;
  if (!b?.postId || !UUID.test(b.postId)) return bad(400, "postId (uuid) is required");
  const body = cleanText(b.body, 400) || null;
  const photo = decodePhoto(b.imageBase64);
  if (photo instanceof NextResponse) return photo;
  if (!body && !photo) return bad(400, "Write a reply or add a photo");

  const { data: post } = await db.from("help_posts").select("id, kind, title, status, expires_at").eq("id", b.postId).maybeSingle<Pick<HelpPost, "id" | "kind" | "title" | "status" | "expires_at">>();
  if (!post) return bad(404, "Post not found");
  if (post.status !== "open" || new Date(post.expires_at) < new Date()) return bad(409, "This post is closed");
  if ((await recentCount(db, "help_replies", userId)) >= MAX_REPLIES_PER_HOUR) return bad(429, "Slow down a little. Try again later.");

  const verdict = await moderateHelp({ kind: post.kind, context: "reply", body: body ?? undefined, postTitle: post.title, imageBase64: photo ? photo.toString("base64") : undefined });
  if (!verdict.allowed) return blocked(verdict.reason, verdict.emergency);

  const id = crypto.randomUUID();
  let photo_path: string | null = null;
  if (photo) {
    photo_path = `${post.id}/${id}.jpg`;
    const up = await db.storage.from("help-photos").upload(photo_path, photo, { contentType: "image/jpeg", upsert: false });
    if (up.error) return bad(502, `Photo upload failed: ${up.error.message}`);
  }
  const { error } = await db.from("help_replies").insert({ id, post_id: post.id, author_id: userId, body, photo_path });
  if (error) {
    if (photo_path) await db.storage.from("help-photos").remove([photo_path]);
    console.error("[api/help/replies]", error);
    return bad(500, "Could not save your reply");
  }
  return NextResponse.json({ id });
}
