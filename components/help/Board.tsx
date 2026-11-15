"use client";
// Ask SC / Favors board: Reddit-style list (votes, replies, Hot/New/Near), search, building filter.
import { ArrowBigDown, ArrowBigUp, CheckCircle2, Clock, MapPin, MessageCircle, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BuildingPicker, { type PickedPlace } from "@/components/help/BuildingPicker";
import NewPost from "@/components/help/NewPost";
import TabBar from "@/components/TabBar";
import { timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { currentSpot, distanceM, fmtDistance, helpPhotoUrl, hot, listPosts, myVotes, scoreOf, shortPlace, subscribeHelp, timeLeft, votePost } from "@/lib/help";
import type { HelpPost } from "@/lib/help-types";
import { handle } from "@/lib/karma";

type Sort = "hot" | "new" | "near";
const META = {
  ask: { title: "Ask SC", sub: "Live answers from Trojans on campus", cta: "Ask", empty: "No questions right now. Be the first to ask." },
  favor: { title: "Favors", sub: "Small help between Trojans nearby", cta: "Ask a favor", empty: "No favors open. Need a charger or a hand?" },
};

export default function Board({ kind }: { kind: "ask" | "favor" }) {
  const m = META[kind];
  const router = useRouter();
  const [posts, setPosts] = useState<HelpPost[] | null>(null);
  const [sort, setSort] = useState<Sort>("hot");
  const [q, setQ] = useState("");
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [picking, setPicking] = useState(false);
  const [composing, setComposing] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});

  useEffect(() => {
    setVotes(myVotes());
    listPosts().then(setPosts).catch(() => setPosts([]));
    currentSpot().then((s) => s && setHere({ lat: s.location.lat, lng: s.location.lng }));
    return subscribeHelp({ post: (p) => setPosts((l) => [p, ...(l ?? []).filter((x) => x.id !== p.id)]) });
  }, []);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const now = Date.now();
    const rows = (posts ?? [])
      .filter((p) => p.kind === kind && p.status !== "closed" && +new Date(p.expires_at) > now)
      .filter((p) => !place || p.location_id === place.id)
      .filter((p) => !t || `${p.title} ${p.body ?? ""} ${p.location_name}`.toLowerCase().includes(t));
    if (sort === "new") return rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (sort === "near" && here) return rows.sort((a, b) => distanceM(here, a) - distanceM(here, b));
    return rows.sort((a, b) => hot(b) - hot(a));
  }, [posts, kind, place, q, sort, here]);

  async function vote(p: HelpPost, dir: 1 | -1) {
    haptic();
    const cur = votes[p.id] ?? 0;
    const next = (cur === dir ? 0 : dir) as 1 | 0 | -1;
    const delta = next - cur;
    setVotes((v) => {
      const n = { ...v };
      if (next === 0) delete n[p.id];
      else n[p.id] = next;
      return n;
    });
    setPosts((l) => (l ?? []).map((x) => (x.id === p.id ? ({ ...x, score: (scoreOf(x) ?? 0) + delta } as HelpPost) : x)));
    votePost(p.id, next).catch(() => {});
  }

  const votingOn = (posts ?? []).some((p) => scoreOf(p) !== null);

  return (
    <main className="pb-tabbar min-h-dvh bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-canvas/95 px-4 pb-2 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[30px] font-black leading-none tracking-[-0.03em]">
              {m.title}
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-gold align-top" />
            </h1>
            <p className="mt-1 text-[13px] text-muted">{m.sub}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-cardinal/10 px-2.5 py-1 text-[11px] font-bold text-accent">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" /> LIVE
          </span>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3">
          <Search size={16} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${m.title}`} className="flex-1 bg-transparent text-[15px] outline-none" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search">
              <X size={15} className="text-muted" />
            </button>
          )}
        </label>
        <div className="mt-2 flex items-center gap-4 text-[14px] font-semibold">
          {(["hot", "new", "near"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                haptic();
                setSort(s);
              }}
              disabled={s === "near" && !here}
              className={`relative pb-1.5 capitalize transition disabled:opacity-30 ${sort === s ? "text-ink" : "text-muted"}`}
            >
              {s === "near" ? "Near me" : s}
              <span className={`absolute inset-x-0 -bottom-px h-[2.5px] rounded-full bg-cardinal transition-transform ${sort === s ? "scale-x-100" : "scale-x-0"}`} />
            </button>
          ))}
          <button onClick={() => (place ? setPlace(null) : setPicking(true))} className={`ml-auto flex max-w-[45%] items-center gap-1 rounded-full px-2.5 py-1 text-[12px] ${place ? "bg-cardinal text-white" : "bg-surface-2 text-muted"}`}>
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{place ? shortPlace(place.name) : "All of campus"}</span>
            {place && <X size={12} className="shrink-0" />}
          </button>
        </div>
      </header>
      <div className="gold-rule opacity-60" />

      {/* List */}
      {posts === null &&
        [0, 1, 2, 3].map((n) => (
          <div key={n} className="border-b hairline px-4 py-4">
            <div className="shimmer h-3 w-1/3 rounded" />
            <div className="shimmer mt-2 h-4 w-4/5 rounded" />
          </div>
        ))}
      {posts !== null && list.length === 0 && (
        <div className="px-8 py-20 text-center">
          <p className="text-[15px] font-semibold">{q || place ? "Nothing matches." : m.empty}</p>
          {!q && !place && (
            <button onClick={() => setComposing(true)} className="press mt-4 h-10 rounded-full bg-cardinal px-5 text-sm font-semibold text-white">
              {m.cta}
            </button>
          )}
        </div>
      )}
      {list.map((p, n) => {
        const score = scoreOf(p);
        const v = votes[p.id] ?? 0;
        const photo = helpPhotoUrl(p.photo_path);
        const done = p.status === "resolved";
        return (
          <article key={p.id} className="rise flex gap-3 border-b hairline px-4 py-3.5" style={{ animationDelay: `${Math.min(n, 8) * 35}ms` }}>
            {votingOn && (
              <div className="flex w-8 shrink-0 flex-col items-center pt-0.5">
                <button onClick={() => vote(p, 1)} aria-label="Upvote" className={v === 1 ? "animate-pop text-accent" : "text-muted"}>
                  <ArrowBigUp size={24} fill={v === 1 ? "currentColor" : "none"} strokeWidth={1.6} />
                </button>
                <span className={`text-[13px] font-bold tabular-nums ${v === 1 ? "text-accent" : v === -1 ? "text-[#0a84ff]" : ""}`}>{score ?? 0}</span>
                <button onClick={() => vote(p, -1)} aria-label="Downvote" className={v === -1 ? "animate-pop text-[#0a84ff]" : "text-muted"}>
                  <ArrowBigDown size={24} fill={v === -1 ? "currentColor" : "none"} strokeWidth={1.6} />
                </button>
              </div>
            )}
            <Link href={`/help/post/${p.id}`} onClick={() => haptic()} className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-[12px] text-muted">
                <MapPin size={11} className="shrink-0 text-accent" />
                <span className="truncate font-semibold text-ink/80">{shortPlace(p.location_name)}</span>
                <span>· {timeAgo(p.created_at)}</span>
                {here && <span>· {fmtDistance(distanceM(here, p))}</span>}
              </p>
              <div className="mt-1 flex gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold leading-snug">{p.title}</h3>
                  {p.body && <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-muted">{p.body}</p>}
                </div>
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                )}
              </div>
              <p className="mt-2 flex items-center gap-3 text-[12px] text-muted">
                <span className="flex items-center gap-1">
                  <MessageCircle size={13} /> {p.reply_count} {kind === "ask" ? (p.reply_count === 1 ? "answer" : "answers") : p.reply_count === 1 ? "offer" : "offers"}
                </span>
                {done ? (
                  <span className="flex items-center gap-1 font-semibold text-resolved">
                    <CheckCircle2 size={13} /> {kind === "ask" ? "Answered" : "Helped"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {timeLeft(p.expires_at)}
                  </span>
                )}
                <span className="ml-auto truncate">{handle(p.author_id)}</span>
              </p>
            </Link>
          </article>
        );
      })}

      {/* New post */}
      <button
        onClick={() => {
          haptic("medium");
          setComposing(true);
        }}
        className="press fixed z-30 flex h-12 items-center gap-1.5 rounded-full bg-cardinal pl-4 pr-5 text-[15px] font-semibold text-white shadow-[0_10px_28px_rgba(153,0,0,0.35)]"
        style={{ bottom: "calc(76px + env(safe-area-inset-bottom))", right: "max(16px, calc(50vw - 224px))" }}
      >
        <Plus size={19} strokeWidth={2.6} /> {m.cta}
      </button>

      {composing && (
        <NewPost
          kind={kind}
          onClose={() => setComposing(false)}
          onPosted={(id) => {
            setComposing(false);
            router.push(`/help/post/${id}`);
          }}
        />
      )}
      {picking && (
        <BuildingPicker
          title="Filter by building"
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPlace(p);
            setPicking(false);
          }}
        />
      )}
      <TabBar />
    </main>
  );
}
