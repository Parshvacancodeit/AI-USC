"use client";
import { CheckCircle2, ChevronRight, Layers, Moon, RotateCcw, Sun } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryIcon, RippleLogo, Wordmark } from "@/components/Icon";
import { Thumb } from "@/components/IssueCard";
import Sheet from "@/components/Sheet";
import StatusBadge from "@/components/StatusBadge";
import TabBar from "@/components/TabBar";
import { MOCK, describeLocation, ensureSession, listIssues, mockReset, preloadFaceDetector, subscribeIssues } from "@/lib/api";
import { CATEGORIES, STATUS, floorLabel, getLocation, timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { setTheme, useTheme } from "@/lib/theme";
import type { Category, Issue } from "@/lib/types";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="shimmer absolute inset-0" />,
});

const DAY = 24 * 3600 * 1000;
const RANK = { open: 0, assigned: 1, resolved: 2, rejected: 3 } as const;

export default function Live() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const fromScroll = useRef(false);
  const theme = useTheme();

  useEffect(() => {
    ensureSession().catch(() => {});
    preloadFaceDetector();
    listIssues()
      .then(setIssues)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
    return subscribeIssues((issue) => {
      setIssues((list) => [issue, ...list.filter((i) => i.id !== issue.id)]);
      haptic(issue.status === "resolved" ? "success" : "light");
    });
  }, []);

  const recent = useMemo(() => issues.filter((i) => i.status !== "rejected").filter((i) => i.status !== "resolved" || Date.now() - +new Date(i.resolved_at ?? i.updated_at) < DAY), [issues]);
  const visible = useMemo(
    () => (filter ? recent.filter((i) => i.category === filter) : recent).sort((a, b) => RANK[a.status] - RANK[b.status] || +new Date(b.updated_at) - +new Date(a.updated_at)),
    [recent, filter],
  );
  const counts = useMemo(
    () => ({
      open: recent.filter((i) => i.status === "open").length,
      assigned: recent.filter((i) => i.status === "assigned").length,
      resolved: recent.filter((i) => i.status === "resolved").length,
    }),
    [recent],
  );
  const bldg = building ? getLocation(building) : null;
  const types = useMemo(() => [...new Set(recent.map((i) => i.category))], [recent]);

  // Pin tapped → bring its card into view
  function selectPin(issue: Issue) {
    haptic();
    setFocus(issue.id);
    const el = rail.current?.querySelector<HTMLElement>(`[data-id="${issue.id}"]`);
    if (el && rail.current) {
      fromScroll.current = true;
      rail.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
    }
  }

  // Card swiped → fly map to that pin
  function onRailScroll() {
    const r = rail.current;
    if (!r) return;
    window.clearTimeout((r as unknown as { _t?: number })._t);
    (r as unknown as { _t?: number })._t = window.setTimeout(() => {
      if (fromScroll.current) {
        fromScroll.current = false;
        return;
      }
      const cards = [...r.querySelectorAll<HTMLElement>("[data-id]")];
      const idx = cards.findIndex((c) => c.offsetLeft - 16 >= r.scrollLeft - 40);
      const id = cards[Math.max(0, idx)]?.dataset.id;
      if (id && id !== focus) {
        haptic();
        setFocus(id);
      }
    }, 140);
  }

  return (
    <main className="relative h-dvh overflow-hidden bg-canvas">
      <CampusMap key={theme} theme={theme} issues={visible} onSelect={selectPin} onBuilding={setBuilding} focusId={focus} focusBuilding={building} />

      {/* top gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-40 scrim-top" />

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="panel pointer-events-auto flex items-center gap-3 rounded-2xl px-3 py-2 shadow-lg animate-fade-up">
          <RippleLogo size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Wordmark className="!text-[20px]" />
              <span className="flex items-center gap-1 rounded-full bg-cardinal px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.14em] text-white">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-gold" /> USC LIVE
              </span>
            </div>
            <p className="truncate text-[12px] text-muted">
              <b className="text-ink">{counts.open}</b> open · <b className="text-ink">{counts.assigned}</b> in progress · <b className="text-resolved">{counts.resolved}</b> fixed today
            </p>
          </div>
          <button
            onClick={() => {
              haptic();
              setTheme(theme === "dark" ? "light" : "dark");
            }}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {MOCK && (
            <button onClick={mockReset} className="grid h-9 w-9 place-items-center rounded-full bg-gold/15 text-gold" aria-label="Reset demo data" title="Demo data: reset">
              <RotateCcw size={15} strokeWidth={2.6} />
            </button>
          )}
        </div>

        <div className="pointer-events-auto mt-2 flex gap-1.5 overflow-x-auto pb-1 animate-fade-up" style={{ animationDelay: "90ms" }}>
          <Chip active={!filter} onClick={() => setFilter(null)}>
            <Layers size={13} /> All
          </Chip>
          {types.map((c) => (
            <Chip key={c} active={filter === c} onClick={() => setFilter(filter === c ? null : c)}>
              <CategoryIcon category={c} size={13} /> {CATEGORIES[c].label}
            </Chip>
          ))}
        </div>
        {error && <p className="pointer-events-auto mt-2 rounded-xl bg-open/15 p-2 text-xs text-open">Couldn&apos;t load issues: {error}</p>}
      </header>

      {/* Incident carousel */}
      <div className="absolute inset-x-0 z-10" style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}>
        <div ref={rail} onScroll={onRailScroll} className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1">
          {!loaded &&
            [0, 1].map((n) => <div key={n} className="shimmer h-[114px] w-[84%] shrink-0 rounded-[18px]" />)}
          {loaded && visible.length === 0 && (
            <div className="panel flex h-[114px] w-full shrink-0 items-center gap-4 rounded-[18px] px-5 animate-fade-up">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-resolved/15 text-resolved">
                <CheckCircle2 size={26} />
              </div>
              <div>
                <p className="text-[17px] font-semibold">All clear on campus</p>
                <p className="text-sm text-muted">Spot something broken? Tap the camera.</p>
              </div>
            </div>
          )}
          {visible.map((i, n) => (
            <Link
              key={i.id}
              data-id={i.id}
              href={`/issue/${i.id}`}
              onClick={() => haptic()}
              className={`panel flex h-[114px] w-[84%] shrink-0 snap-start gap-3 rounded-[18px] p-3 transition animate-fade-up ${focus === i.id ? "ring-2 ring-cardinal" : ""}`}
              style={{ animationDelay: `${Math.min(n, 4) * 60 + 150}ms` }}
            >
              <Thumb issue={i} size={84} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={i.status} />
                  <span className="text-[11px] text-muted">{timeAgo(i.updated_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug">{i.title}</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="truncate text-xs text-muted">{describeLocation(i)}</span>
                  <Reporters n={i.reporter_count} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <TabBar />

      {/* Building x-ray sheet */}
      {bldg && (
        <Sheet onClose={() => setBuilding(null)} title={bldg.name} subtitle={`${bldg.floors.length} floors · live status`}>
          <div className="max-h-[52dvh] space-y-1.5 overflow-y-auto pb-24">
            {[...bldg.floors].reverse().map((f, n) => {
              const here = recent.filter((i) => i.location_id === bldg.id && i.floor === f && i.status !== "resolved");
              const worst = here.find((i) => i.status === "open") ?? here[0];
              return (
                <div key={f} className="rounded-2xl bg-surface-2 p-3 animate-fade-up" style={{ animationDelay: `${n * 50}ms` }}>
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold" style={{ background: worst ? STATUS[worst.status].bg : "rgba(255,255,255,0.06)", color: worst ? STATUS[worst.status].color : "#8e8e98" }}>
                      {f}
                    </div>
                    <p className="flex-1 text-[15px] font-semibold">{floorLabel(f)}</p>
                    {here.length === 0 && <span className="text-xs font-semibold text-resolved">All clear</span>}
                  </div>
                  {here.map((i) => (
                    <Link key={i.id} href={`/issue/${i.id}`} onClick={() => haptic()} className="mt-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm">
                      <CategoryIcon category={i.category} size={15} className="text-accent" />
                      <span className="flex-1 truncate">{i.title}</span>
                      <ChevronRight size={16} className="text-muted" />
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
    </main>
  );
}

function Reporters({ n }: { n: number }) {
  const shown = Math.min(n, 3);
  const tints = ["#ff453a", "#ffcc00", "#0a84ff"];
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
      <span className="flex -space-x-1.5">
        {Array.from({ length: shown }).map((_, k) => (
          <span key={k} className="h-4 w-4 rounded-full border-2 border-surface" style={{ background: tints[k] }} />
        ))}
      </span>
      {n}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        haptic();
        onClick();
      }}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${active ? "bg-ink text-canvas" : "panel text-ink"}`}
    >
      {children}
    </button>
  );
}
