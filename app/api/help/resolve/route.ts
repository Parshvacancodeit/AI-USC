// POST /api/help/resolve — the post's author marks it answered/helped (optionally crediting a reply), closes or reopens it.
import { NextResponse } from "next/server";
import type { ResolveRequest } from "@/lib/help-types";
import { authed, bad, UUID } from "@/lib/help-server";

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  const { db, userId } = a;

  const b = (await req.json().catch(() => null)) as Partial<ResolveRequest> | null;
  if (!b?.postId || !UUID.test(b.postId) || !["resolve", "close", "reopen"].includes(b.action ?? "")) return bad(400, "postId and action (resolve | close | reopen) are required");

  const { data: post } = await db.from("help_posts").select("id, author_id, status").eq("id", b.postId).maybeSingle();
  if (!post) return bad(404, "Post not found");
  if (post.author_id !== userId) return bad(403, "Only the person who posted can change this");

  let patch: Record<string, unknown>;
  if (b.action === "resolve") {
    let helper_id: string | null = null;
    if (b.replyId) {
      if (!UUID.test(b.replyId)) return bad(400, "replyId must be a uuid");
      const { data: reply } = await db.from("help_replies").select("id, author_id").eq("id", b.replyId).eq("post_id", post.id).maybeSingle();
      if (!reply) return bad(404, "Reply not found on this post");
      helper_id = reply.author_id === userId ? null : reply.author_id; // no self-karma
    }
    patch = { status: "resolved", resolved_reply_id: b.replyId ?? null, helper_id };
  } else if (b.action === "close") {
    patch = { status: "closed" };
  } else {
    patch = { status: "open", resolved_reply_id: null, helper_id: null };
  }
  const { error } = await db.from("help_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", post.id);
  if (error) {
    console.error("[api/help/resolve]", error);
    return bad(500, "Could not update the post");
  }
  return NextResponse.json({ status: patch.status });
}
