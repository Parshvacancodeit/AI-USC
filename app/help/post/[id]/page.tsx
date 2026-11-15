"use client";
// Help SC thread: the post, AI "Related right now", replies (live), composer at the bottom.
import { ArrowBigDown, ArrowBigUp, Check, Clock, MapPin, MessageCircle, Navigation, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Composer from "@/components/help/Composer";
import StepHeader from "@/components/StepHeader";
import { ApiError, myUserId } from "@/lib/api";
import { timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { fetchRelated, getPost, helpPhotoUrl, KIND, myVotes, resolvePost, scoreOf, shortPlace, subscribeHelp, timeLeft, votePost, type RelatedItem } from "@/lib/help";
import { HELP_KARMA, type HelpPost, type HelpReply } from "@/lib/help-types";
import { handle } from "@/lib/karma";

export default function Thread() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<HelpPost | null | undefined>(undefined);
  const [replies, setReplies] = useState<HelpReply[]>([]);
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [vote, setVote] = useState<1 | -1 | 0>(0);
  useEffect(() => setVote(myVotes()[id] ?? 0), [id]);

  useEffect(() => {
    getPost(id)
      .then(({ post, replies }) => {
        setPost(post);
        setReplies(replies);
      })
      .catch(() => setPost(null));
    myUserId().then(setMe);
    fetchRelated(id).then(setRelated);
    return subscribeHelp({ post: setPost, reply: (r) => setReplies((l) => (l.some((x) => x.id === r.id) ? l : [...l, r])) }, id);
  }, [id]);

  if (post === undefined)
    return (
      <Frame title="">
        <div className="space-y-3 rounded-2xl bg-surface p-4">
          <div className="shimmer h-5 w-4/5 rounded" />
          <div className="shimmer h-3 w-1/2 rounded" />
        </div>
      </Frame>
    );
  if (post === null)
    return (
      <Frame title="Help SC">
        <p className="py-20 text-center text-[15px] text-muted">This post expired or was removed.</p>
      </Frame>
    );

  const m = KIND[post.kind];
  const mine = !!me && me === post.author_id;
  const live = post.status === "open" && +new Date(post.expires_at) > Date.now();
  const resolvable = post.kind !== "ask"; // Ask is a live feed: questions simply expire
  const photo = helpPhotoUrl(post.photo_path);

  async function act(action: "resolve" | "reopen", replyId?: string) {
    haptic("medium");
    setBusy(true);
    setErr(null);
    try {
      await resolvePost({ postId: post!.id, action, replyId });
      setPost((await getPost(post!.id)).post);
      haptic(action === "resolve" ? "success" : "light");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title={post.kind === "ask" ? "Ask SC" : post.kind === "favor" ? "Favors" : "Help SC"} composer={live}>
      {/* The post */}
      <article className="animate-fade-up">
        {post.kind !== "ask" && (
          <p className="mb-1 text-[13px] font-semibold" style={{ color: post.status === "resolved" ? "var(--color-resolved)" : m.tint }}>
            {post.status === "resolved" ? m.doneLabel : m.label}
          </p>
        )}
        <h1 className="text-[22px] font-semibold leading-snug">{post.title}</h1>
        {post.body && <p className="mt-2 whitespace-pre-wrap text-[16px] text-muted">{post.body}</p>}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="mt-3 max-h-80 w-full rounded-2xl object-cover" />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <a href={`https://maps.google.com/?q=${post.lat},${post.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent">
            <MapPin size={13} /> {shortPlace(post.location_name)}
          </a>
          <span>
            {mine ? "You" : handle(post.author_id)} · {timeAgo(post.created_at)}
          </span>
          {live && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> {timeLeft(post.expires_at)}
            </span>
          )}
        </div>

        {/* Action bar: votes · replies · directions */}
        <div className="mt-4 flex items-center gap-2 border-y hairline py-2">
          {scoreOf(post) !== null && (
            <div className="flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-1">
              {([1, -1] as const).map((d) => (
                <button
                  key={d}
                  aria-label={d === 1 ? "Upvote" : "Downvote"}
                  onClick={() => {
                    haptic();
                    const next = (vote === d ? 0 : d) as 1 | -1 | 0;
                    setPost({ ...post, score: (scoreOf(post) ?? 0) + (next - vote) } as HelpPost);
                    setVote(next);
                    votePost(post.id, next).catch(() => {});
                  }}
                  className={`${vote === d ? (d === 1 ? "animate-pop text-accent" : "animate-pop text-[#0a84ff]") : "text-muted"} ${d === -1 ? "order-3" : ""}`}
                >
                  {d === 1 ? <ArrowBigUp size={22} fill={vote === 1 ? "currentColor" : "none"} strokeWidth={1.6} /> : <ArrowBigDown size={22} fill={vote === -1 ? "currentColor" : "none"} strokeWidth={1.6} />}
                </button>
              ))}
              <span className="order-2 min-w-5 text-center text-[13px] font-bold tabular-nums">{scoreOf(post)}</span>
            </div>
          )}
          <span className="flex items-center gap-1 px-2 text-[13px] text-muted">
            <MessageCircle size={15} /> {replies.length}
          </span>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${post.lat},${post.lng}&travelmode=walking`}
            target="_blank"
            rel="noreferrer"
            onClick={() => haptic()}
            className="press ml-auto flex h-9 items-center gap-1.5 rounded-full bg-cardinal px-3.5 text-[13px] font-semibold text-white"
          >
            <Navigation size={14} /> Directions
          </a>
        </div>
        {mine && resolvable && (
          <button
            disabled={busy}
            onClick={() => act(post.status === "open" ? "resolve" : "reopen")}
            className={`mt-4 h-11 w-full rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50 ${post.status === "open" ? "bg-resolved text-white" : "bg-surface text-ink"}`}
          >
            {post.status === "open" ? `Mark ${m.doneLabel.toLowerCase()}` : "Reopen"}
          </button>
        )}
        {err && <p className="mt-2 text-[13px] text-open">{err}</p>}
      </article>

      {/* AI: related right now */}
      {related.length > 0 && (
        <section className="border-l-2 border-gold pl-3 animate-fade-up">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-accent">
            <Sparkles size={14} /> Related right now
          </p>
          <div className="divide-y divide-line">
            {related.map((r) => (
              <Link key={r.replyId ?? r.postId} href={`/help/post/${r.postId}`} className="block py-2.5 first:pt-0 last:pb-0">
                <p className="text-[15px] leading-snug">{r.text}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {r.why} · {shortPlace(r.place)} · {timeAgo(r.created_at)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Replies */}
      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{replies.length ? `${replies.length} repl${replies.length === 1 ? "y" : "ies"}` : "No replies yet"}</h2>
        {replies.length > 0 && (
          <div className="divide-y divide-line border-y hairline">
            {replies.map((r) => {
              const credited = post.resolved_reply_id === r.id;
              const rp = helpPhotoUrl(r.photo_path);
              return (
                <div key={r.id} className={`rise py-3 ${credited ? "-mx-4 bg-resolved/[0.08] px-4" : ""}`}>
                  <div className="flex items-center gap-2 text-[13px] text-muted">
                    <span className="font-medium text-ink/80">{me === r.author_id ? "You" : handle(r.author_id)}</span>
                    <span>· {timeAgo(r.created_at)}</span>
                    {credited && (
                      <span className="ml-auto flex items-center gap-1 font-semibold text-resolved">
                        <Check size={13} /> {m.creditLabel} · +{HELP_KARMA[post.kind]}
                      </span>
                    )}
                    {!credited && mine && resolvable && post.status === "open" && r.author_id !== me && (
                      <button disabled={busy} onClick={() => act("resolve", r.id)} className="ml-auto font-semibold text-resolved">
                        {m.creditLabel}
                      </button>
                    )}
                  </div>
                  {r.body && <p className="mt-1 whitespace-pre-wrap text-[16px] leading-snug">{r.body}</p>}
                  {rp && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={rp} alt="" className="mt-2 max-h-64 w-full rounded-xl object-cover" />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!live && <p className="mt-3 text-center text-[13px] text-muted">{post.status === "resolved" ? `${m.doneLabel}. Replies are closed.` : "This post is closed."}</p>}
      </section>

      {live && <Composer mode="reply" post={post} onSent={(rid, body) => setReplies((l) => (l.some((x) => x.id === rid) ? l : [...l, { id: rid, post_id: post.id, author_id: me ?? "", body, photo_path: null, created_at: new Date().toISOString() }]))} />}
    </Frame>
  );
}

function Frame({ title, children, composer }: { title: string; children: React.ReactNode; composer?: boolean }) {
  return (
    <main className="min-h-dvh" style={{ paddingBottom: composer ? "calc(env(safe-area-inset-bottom) + 96px)" : 40 }}>
      <StepHeader title={title} />
      <div className="space-y-5 px-4 pt-4">{children}</div>
    </main>
  );
}
