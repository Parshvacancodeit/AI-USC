"use client";
import { BadgeCheck, Bell, BellRing, Footprints, MessageSquare, Moon, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LargeTitle from "@/components/LargeTitle";
import TabBar from "@/components/TabBar";
import { timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { distanceM, fmtDistance, getPosition, KIND, listPosts, subscribeHelp } from "@/lib/help";
import { HELP_KINDS, type HelpKind, type HelpPost } from "@/lib/help-types";

type Filter = "all" | "ask" | "favor" | "lostfound";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ask", label: "Ask" },
  { key: "favor", label: "Favors" },
  { key: "lostfound", label: "Lost & Found" },
];
const matches = (f: Filter, k: HelpKind) => f === "all" || (f === "lostfound" ? k === "lost" || k === "found" : k === f);

export default function Help() {
  const [posts, setPosts] = useState<HelpPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    listPosts()
      .then(setPosts)
      .catch(() => {
        setPosts([]);
        setErr("Couldn't load Help SC right now.");
      });
    getPosition().then(setMe);
    return subscribeHelp({
      post: (p) => {
        setPosts((l) => [p, ...(l ?? []).filter((x) => x.id !== p.id)]);
        setFresh(p.id);
      },
    });
  }, []);

  const rows = useMemo(() => {
    const now = Date.now();
    return (posts ?? [])
      .filter((p) => +new Date(p.expires_at) > now && p.status !== "closed" && matches(filter, p.kind))
      .map((p) => ({ p, d: me ? distanceM(me, p) : null }))
      .sort((a, b) => {
        // open first, then nearest (if we know where you are), then newest
        if ((a.p.status === "open") !== (b.p.status === "open")) return a.p.status === "open" ? -1 : 1;
        if (a.d !== null && b.d !== null && Math.abs(a.d - b.d) > 150) return a.d - b.d;
        return +new Date(b.p.created_at) - +new Date(a.p.created_at);
      });
  }, [posts, filter, me]);

  return (
    <main className="pb-tabbar min-h-dvh">
      <LargeTitle
        title="Help SC"
        subtitle={
          <span className="flex items-center gap-1.5">
            <span className="live-dot h-2 w-2 rounded-full bg-resolved" /> Trojans helping Trojans, live
          </span>
        }
      />

      <div className="space-y-4 px-4">
        {/* Start something */}
        <div className="grid grid-cols-4 gap-2 animate-fade-up">
          {HELP_KINDS.map((k) => {
            const m = KIND[k];
            return (
              <Link key={k} href={`/help/new?kind=${k}`} onClick={() => haptic("medium")} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 transition active:scale-95">
                <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: `${m.tint}26`, color: m.tint }}>
                  <m.Icon size={20} />
                </span>
                <span className="text-[12px] font-semibold">{m.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Filter */}
        <div className="sticky top-0 z-10 -mx-4 bg-canvas/90 px-4 py-1 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  haptic();
                  setFilter(f.key);
                }}
                className={`h-8 rounded-lg text-[12px] font-semibold transition ${filter === f.key ? "bg-surface-2 text-ink shadow" : "text-muted"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live list */}
        {posts === null && [0, 1, 2].map((n) => <div key={n} className="shimmer h-20 rounded-2xl" />)}
        {err && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{err}</p>}
        {posts !== null && !err && rows.length === 0 && (
          <div className="rounded-3xl bg-surface p-6 text-center animate-fade-up">
            <p className="text-[17px] font-bold">Quiet right now</p>
            <p className="mt-1 text-sm text-muted">Ask how busy a place is, ask a small favor, or post something you lost or found.</p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-hidden rounded-2xl bg-surface">
            {rows.map(({ p, d }, n) => {
              const m = KIND[p.kind];
              const done = p.status === "resolved";
              return (
                <Link
                  key={p.id}
                  href={`/help/${p.id}`}
                  onClick={() => haptic()}
                  className={`flex items-center gap-3 px-3 py-3 transition animate-fade-up ${n ? "border-t hairline" : ""} ${fresh === p.id ? "bg-gold/10" : ""} ${done ? "opacity-60" : ""}`}
                  style={{ animationDelay: `${Math.min(n, 8) * 35}ms` }}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: `${m.tint}26`, color: m.tint }}>
                    <m.Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{p.title}</p>
                    <p className="truncate text-[13px] text-muted">
                      <span style={{ color: m.tint }}>{m.label}</span> · {p.location_name}
                      {p.floor ? ` · Fl ${p.floor}` : ""}
                      {d !== null ? ` · ${fmtDistance(d)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {done ? (
                      <span className="rounded-full bg-resolved/15 px-2 py-0.5 text-[11px] font-bold text-resolved">{m.doneLabel}</span>
                    ) : (
                      p.reply_count > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
                          <MessageSquare size={11} /> {p.reply_count}
                        </span>
                      )
                    )}
                    <span className="text-[11px] text-muted">{timeAgo(p.created_at)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <ComingNext />
      </div>
      <TabBar />
    </main>
  );
}

// ---------- Still-to-come features (previews) ----------
const SOON = [
  {
    id: "lantern",
    name: "Lantern",
    tagline: "Walk together after night classes. Never walk home alone.",
    Icon: Footprints,
    tint: "#ffb020",
    preview: (
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <Moon size={18} className="text-[#ffb020]" />
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold">3 Trojans walking to Parkside</p>
          <p className="text-muted">Leaving Ginsburg · 9:40 PM</p>
        </div>
      </div>
    ),
  },
  {
    id: "pass",
    name: "Trojan Pass",
    tagline: "Verified USC identity, karma and badges. Trust built in.",
    Icon: BadgeCheck,
    tint: "#ffcc00",
    preview: (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cardinal via-[#5a0008] to-black p-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">Trojan Pass</p>
        <p className="mt-1 text-[15px] font-bold text-white">Tommy Trojan</p>
        <p className="text-[11px] text-white/60">Verified student · 340 karma</p>
      </div>
    ),
  },
];

function ComingNext() {
  const [subs, setSubs] = useState<string[]>([]);
  useEffect(() => {
    try {
      setSubs(JSON.parse(localStorage.getItem("help-notify") ?? "[]"));
    } catch {}
  }, []);
  const toggle = (id: string) => {
    haptic("medium");
    const next = subs.includes(id) ? subs.filter((s) => s !== id) : [...subs, id];
    setSubs(next);
    try {
      localStorage.setItem("help-notify", JSON.stringify(next));
    } catch {}
  };
  return (
    <section className="space-y-3 pt-4">
      <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        <Sparkles size={13} /> Coming next
      </h2>
      {SOON.map((f) => {
        const on = subs.includes(f.id);
        return (
          <div key={f.id} className="rounded-3xl bg-surface p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: `${f.tint}26`, color: f.tint }}>
                <f.Icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold">{f.name}</p>
                <p className="text-[13px] leading-snug text-muted">{f.tagline}</p>
              </div>
              <button
                onClick={() => toggle(f.id)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${on ? "bg-gold text-black" : "bg-surface-2 text-muted"}`}
                aria-label={on ? `Stop notifying about ${f.name}` : `Notify me about ${f.name}`}
              >
                {on ? <BellRing size={17} /> : <Bell size={17} />}
              </button>
            </div>
            <div className="pointer-events-none select-none opacity-90">{f.preview}</div>
          </div>
        );
      })}
    </section>
  );
}
