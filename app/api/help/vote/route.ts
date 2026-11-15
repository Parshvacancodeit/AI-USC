// POST /api/help/vote { postId, value: 1 | 0 | -1 } — upvote, downvote or clear (signed-in students).
// help_votes trigger keeps help_posts.score current. Schema: supabase/help_votes.sql.
import { NextResponse } from "next/server";
import { authed, bad } from "@/lib/help-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  const { db, userId } = a;
  const b = (await req.json().catch(() => null)) as { postId?: string; value?: number } | null;
  if (!b?.postId || !UUID.test(b.postId) || ![1, 0, -1].includes(b.value as number)) return bad(400, "postId and value (1, 0, -1) are required");

  const q = b.value === 0 ? db.from("help_votes").delete().eq("post_id", b.postId).eq("user_id", userId) : db.from("help_votes").upsert({ post_id: b.postId, user_id: userId, value: b.value }, { onConflict: "post_id,user_id" });
  const { error } = await q;
  if (error) return bad(/help_votes/.test(error.message) ? 503 : 500, /help_votes/.test(error.message) ? "Voting isn't set up yet" : error.message);
  const { data } = await db.from("help_posts").select("score").eq("id", b.postId).maybeSingle();
  return NextResponse.json({ score: (data as { score?: number } | null)?.score ?? 0 });
}
