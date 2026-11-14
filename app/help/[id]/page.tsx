"use client";
import { Camera, Check, Clock, ExternalLink, MapPin, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import StepHeader from "@/components/StepHeader";
import { ApiError, blurFaces, myUserId, prepareImage } from "@/lib/api";
import { floorLabel, timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { createReply, getPost, helpPhotoUrl, HelpBlockedError, KIND, resolvePost, subscribeHelp, timeLeft } from "@/lib/help";
import type { HelpPost, HelpReply } from "@/lib/help-types";
import { HELP_KARMA } from "@/lib/help-types";
import { handle } from "@/lib/karma";
import EmergencyScreen from "@/components/EmergencyScreen";

export default function HelpPostPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<HelpPost | null | undefined>(undefined);
  const [replies, setReplies] = useState<HelpReply[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPost(id)
      .then(({ post, replies }) => {
        setPost(post);
        setReplies(replies);
      })
      .catch(() => setPost(null));
    myUserId().then(setMe);
    return subscribeHelp(
      {
        post: (p) => setPost(p),
        reply: (r) => setReplies((l) => (l.some((x) => x.id === r.id) ? l : [...l, r])),
      },
      id,
    );
  }, [id]);

  if (post === undefined) return <Shell>{[0, 1].map((n) => <div key={n} className="shimmer h-24 rounded-2xl" />)}</Shell>;
  if (post === null) return <Shell><p className="py-16 text-center text-muted">This post is gone or expired.</p></Shell>;

  const m = KIND[post.kind];
  const mine = !!me && me === post.author_id;
  const live = post.status === "open" && +new Date(post.expires_at) > Date.now();
  const photo = helpPhotoUrl(post.photo_path);

  async function act(action: "resolve" | "close" | "reopen", replyId?: string) {
    haptic("medium");
    setBusy(action);
    setErr(null);
    try {
      await resolvePost({ postId: post!.id, action, replyId });
      haptic(action === "resolve" ? "success" : "light");
      const fresh = await getPost(post!.id);
      setPost(fresh.post);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't update. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell title={m.label} padBottom={live && !mine}>
      {/* Post */}
      <article className="overflow-hidden rounded-3xl bg-surface animate-fade-up">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="max-h-80 w-full object-cover" />
        )}
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: `${m.tint}26`, color: m.tint }}>
              <m.Icon size={13} /> {m.label}
            </span>
            {post.status === "resolved" && <span className="rounded-full bg-resolved/15 px-2 py-0.5 text-[12px] font-bold text-resolved">{m.doneLabel}</span>}
            {post.status === "closed" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-bold text-muted">Closed</span>}
            {live && (
              <span className="flex items-center gap-1 text-[12px] text-muted">
                <Clock size={12} /> {timeLeft(post.expires_at)}
              </span>
            )}
          </div>
          <h1 className="text-[22px] font-extrabold leading-snug">{post.title}</h1>
          {post.body && <p className="whitespace-pre-wrap text-[15px] text-muted">{post.body}</p>}
          <p className="flex items-center gap-1.5 text-[13px]">
            <MapPin size={14} className="shrink-0 text-accent" />
            <span className="truncate">
              {post.location_name}
              {post.floor ? ` · ${floorLabel(post.floor)}` : ""}
            </span>
            <a href={`https://maps.google.com/?q=${post.lat},${post.lng}`} target="_blank" rel="noreferrer" className="ml-auto flex shrink-0 items-center gap-0.5 font-semibold text-accent">
              Map <ExternalLink size={12} />
            </a>
          </p>
          <p className="text-[12px] text-muted">
            {mine ? "You" : handle(post.author_id)} · {timeAgo(post.created_at)}
          </p>
        </div>

        {mine && (
          <div className="flex gap-2 border-t hairline p-3">
            {post.status === "open" ? (
              <>
                <button disabled={!!busy} onClick={() => act("resolve")} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-resolved text-[14px] font-semibold text-white disabled:opacity-50">
                  <Check size={16} /> Mark {m.doneLabel.toLowerCase()}
                </button>
                <button disabled={!!busy} onClick={() => act("close")} className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-4 text-[14px] font-semibold disabled:opacity-50">
                  <X size={16} /> Close
                </button>
              </>
            ) : (
              <button disabled={!!busy} onClick={() => act("reopen")} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[14px] font-semibold disabled:opacity-50">
                <RotateCcw size={16} /> Reopen
              </button>
            )}
          </div>
        )}
      </article>
      {err && <p className="rounded-xl bg-open/10 p-3 text-[13px] font-medium text-open">{err}</p>}

      {/* Replies */}
      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
          {replies.length ? `${replies.length} repl${replies.length === 1 ? "y" : "ies"}` : "No replies yet"}
        </h2>
        {replies.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{mine ? "Trojans nearby will see this. You'll see replies here live." : m.replyHint}</p>}
        <div className="space-y-2">
          {replies.map((r) => {
            const best = post.resolved_reply_id === r.id;
            const rp = helpPhotoUrl(r.photo_path);
            return (
              <div key={r.id} className={`overflow-hidden rounded-2xl bg-surface animate-fade-up ${best ? "ring-2 ring-resolved" : ""}`}>
                {rp && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rp} alt="" className="max-h-64 w-full object-cover" />
                )}
                <div className="space-y-1 p-3">
                  {best && (
                    <p className="flex items-center gap-1 text-[12px] font-bold text-resolved">
                      <Check size={13} /> {m.creditLabel} · +{HELP_KARMA[post.kind]} karma
                    </p>
                  )}
                  {r.body && <p className="whitespace-pre-wrap text-[15px]">{r.body}</p>}
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[12px] text-muted">
                      {me === r.author_id ? "You" : handle(r.author_id)} · {timeAgo(r.created_at)}
                    </p>
                    {mine && post.status === "open" && r.author_id !== me && (
                      <button disabled={!!busy} onClick={() => act("resolve", r.id)} className="rounded-full bg-resolved/15 px-3 py-1 text-[12px] font-bold text-resolved disabled:opacity-50">
                        {m.creditLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {live && !mine && <Composer post={post} onSent={(r) => setReplies((l) => (l.some((x) => x.id === r.id) ? l : [...l, r]))} />}
    </Shell>
  );
}

function Shell({ children, title = "Help SC", padBottom }: { children: React.ReactNode; title?: string; padBottom?: boolean }) {
  return (
    <main className={`min-h-dvh ${padBottom ? "pb-44" : "pb-10"}`}>
      <StepHeader title={title} />
      <div className="space-y-4 px-4 pt-4">{children}</div>
    </main>
  );
}

function Composer({ post, onSent }: { post: HelpPost; onSent: (r: HelpReply) => void }) {
  const m = KIND[post.kind];
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string; faces: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);

  async function onFile(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const img = await prepareImage(f);
      const b = await blurFaces(img.dataUrl);
      setPhoto({ dataUrl: b.dataUrl, base64: b.dataUrl.split(",")[1], faces: b.facesBlurred });
    } catch {
      setErr("Couldn't read that photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send() {
    if (!text.trim() && !photo) return;
    haptic("medium");
    setBusy(true);
    setErr(null);
    try {
      const { id } = await createReply({ postId: post.id, body: text.trim() || undefined, imageBase64: photo?.base64 });
      const me = await myUserId();
      onSent({ id, post_id: post.id, author_id: me ?? "", body: text.trim() || null, photo_path: null, created_at: new Date().toISOString() });
      setText("");
      setPhoto(null);
      haptic("success");
    } catch (e) {
      if (e instanceof HelpBlockedError && e.emergency) setEmergency(true);
      else setErr(e instanceof ApiError ? e.message : "Couldn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (emergency) return <div className="fixed inset-0 z-50"><EmergencyScreen onBack={() => setEmergency(false)} /></div>;

  return (
    <div className="glass-strong fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] space-y-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      {err && <p className="rounded-lg bg-open/10 px-3 py-2 text-[12px] font-medium text-open">{err}</p>}
      {photo && (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="" className="h-16 rounded-lg object-cover" />
          <button onClick={() => setPhoto(null)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-surface-2" aria-label="Remove photo">
            <X size={12} />
          </button>
          <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted">
            <ShieldCheck size={10} /> {photo.faces > 0 ? "faces blurred" : "no faces"}
          </span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Add photo">
          <Camera size={19} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 400))}
          placeholder={m.replyHint}
          rows={1}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-surface-2 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-cardinal"
        />
        <button
          onClick={send}
          disabled={busy || (!text.trim() && !photo)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
          style={{ background: m.tint }}
          aria-label={m.replyVerb}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
