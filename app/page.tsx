"use client";
import { Activity, Building2, Camera, ChevronRight, Inbox, Layers, RotateCcw, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CategoryIcon, RippleLogo } from "@/components/Icon";
import IssueCard, { Thumb } from "@/components/IssueCard";
import Sheet from "@/components/Sheet";
import StatusBadge from "@/components/StatusBadge";
import { MOCK, describeLocation, ensureSession, listIssues, mockReset, myIssueIds, preloadFaceDetector, subscribeIssues } from "@/lib/api";
import { CATEGORIES, LOCATIONS, STATUS, floorLabel, timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import type { Category, Issue } from "@/lib/types";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-[#e9e4e4]" />,
});

const DAY = 24 * 3600 * 1000;
type Panel = "mine" | "feed" | null;

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    setMine(myIssueIds());
    ensureSession().catch(() => {});
    preloadFaceDetector();
    listIssues().then(setIssues).catch((e) => setError(e.message));
    return subscribeIssues((issue) => {
      setIssues((list) => [issue, ...list.filter((i) => i.id !== issue.id)]);
      setSelected((s) => (s?.id === issue.id ? issue : s));
      setMine(myIssueIds());
      setFresh(issue.id);
      haptic(issue.status === "resolved" ? "success" : "light");
    });
  }, []);

  const recent = useMemo(() => issues.filter((i) => i.status !== "resolved" || Date.now() - +new Date(i.resolved_at ?? i.updated_at) < DAY), [issues]);
  const visible = useMemo(() => (filter ? recent.filter((i) => i.category === filter) : recent), [recent, filter]);
  const counts = useMemo(
    () => ({
      open: recent.filter((i) => i.status === "open").length,
      assigned: recent.filter((i) => i.status === "assigned").length,
      resolved: recent.filter((i) => i.status === "resolved").length,
    }),
    [recent],
  );
  const myIssues = issues.filter((i) => mine.includes(i.id));
  const feed = useMemo(() => [...issues].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, 25), [issues]);
  const bldg = LOCATIONS.find((l) => l.id === building) ?? null;

  return (
    <main className="relative h-dvh overflow-hidden bg-[#e9e4e4]">
      <CampusMap issues={visible} onSelect={setSelected} onBuilding={setBuilding} focusId={selected?.id} focusBuilding={building} />

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/70 px-3 py-2.5 shadow-lg animate-fade-up">
          <RippleLogo size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold leading-tight tracking-tight">Ripple</p>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-cardinal">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-open" />
              USC LIVE
              <span className="font-medium text-muted">· University Park</span>
            </p>
          </div>
          {MOCK && (
            <button onClick={mockReset} className="flex items-center gap-1 rounded-full bg-gold/30 px-2.5 py-1.5 text-[10px] font-bold text-cardinal-dark" aria-label="Reset demo data">
              <RotateCcw size={11} strokeWidth={3} /> DEMO
            </button>
          )}
        </div>

        <div className="pointer-events-auto mt-2 flex gap-1.5 animate-fade-up" style={{ animationDelay: "80ms" }}>
          <Stat color={STATUS.open.color} n={counts.open} label="open" />
          <Stat color={STATUS.assigned.color} n={counts.assigned} label="in progress" />
          <Stat color={STATUS.resolved.color} n={counts.resolved} label="fixed today" />
        </div>

        <div className="pointer-events-auto mt-2 flex gap-1.5 overflow-x-auto pb-1 animate-fade-up" style={{ animationDelay: "160ms" }}>
          <FilterChip active={!filter} onClick={() => setFilter(null)}>
            <Layers size={13} /> All
          </FilterChip>
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <FilterChip key={c} active={filter === c} onClick={() => setFilter(filter === c ? null : c)}>
              <CategoryIcon category={c} size={13} /> {CATEGORIES[c].label}
            </FilterChip>
          ))}
        </div>
        {error && <p className="pointer-events-auto mt-2 rounded-xl bg-white p-2 text-xs text-open">Couldn&apos;t load issues: {error}</p>}
      </header>

      {/* Bottom actions */}
      <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 space-y-2 px-3 animate-fade-up" style={{ animationDelay: "240ms" }}>
        <Link
          href="/report"
          onClick={() => haptic("medium")}
          className="relative flex h-[58px] items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-b from-[#b3121b] to-cardinal-dark text-[17px] font-semibold text-white shadow-xl shadow-cardinal/40 ring-1 ring-gold/40 transition active:scale-[0.98]"
        >
          <Camera size={22} strokeWidth={2.2} /> Report a problem
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <BarButton onClick={() => setPanel("feed")}>
            <Activity size={16} className="text-open" /> Live at USC
          </BarButton>
          <BarButton onClick={() => setPanel("mine")}>
            <Inbox size={16} /> My reports
            {myIssues.length > 0 && <span className="rounded-full bg-cardinal px-1.5 py-px text-[11px] text-white">{myIssues.length}</span>}
          </BarButton>
        </div>
      </div>

      {/* Pin sheet */}
      {selected && (
        <Sheet onClose={() => setSelected(null)}>
          <div className="flex gap-3">
            <Thumb issue={selected} size={76} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold leading-snug">{selected.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {describeLocation(selected)} · {timeAgo(selected.created_at)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Users size={12} /> {selected.reporter_count} Trojans
                </span>
              </div>
            </div>
          </div>
          <Link href={`/issue/${selected.id}`} onClick={() => haptic()} className="mt-4 flex h-12 items-center justify-center gap-1 rounded-xl bg-ink text-[15px] font-semibold text-white">
            View details <ChevronRight size={18} />
          </Link>
        </Sheet>
      )}

      {/* Building x-ray sheet */}
      {bldg && (
        <Sheet onClose={() => setBuilding(null)} title={bldg.name} subtitle={`${bldg.floors.length} floors · live floor status`}>
          <div className="max-h-[52dvh] space-y-1.5 overflow-y-auto pb-1">
            {[...bldg.floors].reverse().map((f, n) => {
              const here = recent.filter((i) => i.location_id === bldg.id && i.floor === f && i.status !== "resolved");
              const worst = here.find((i) => i.status === "open") ?? here[0];
              return (
                <div key={f} className="animate-fade-up rounded-2xl bg-white p-3" style={{ animationDelay: `${n * 50}ms` }}>
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold" style={{ background: worst ? STATUS[worst.status].bg : "#f1f1f4", color: worst ? STATUS[worst.status].color : "#6b6b75" }}>
                      {f}
                    </div>
                    <p className="flex-1 text-[15px] font-semibold">{floorLabel(f)}</p>
                    {here.length === 0 && <span className="text-xs font-semibold text-resolved">All clear</span>}
                  </div>
                  {here.map((i) => (
                    <Link key={i.id} href={`/issue/${i.id}`} onClick={() => haptic()} className="mt-2 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
                      <CategoryIcon category={i.category} size={15} className="text-cardinal" />
                      <span className="flex-1 truncate">{i.title}</span>
                      <StatusBadge status={i.status} />
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* Live feed */}
      {panel === "feed" && (
        <Sheet onClose={() => setPanel(null)} title="Live at USC" subtitle="Every report, assignment and fix, as it happens">
          <div className="max-h-[58dvh] space-y-1 overflow-y-auto pb-1">
            {feed.map((i, n) => {
              const verb = i.status === "resolved" ? "Fixed" : i.status === "assigned" ? `Assigned to ${i.assigned_team ?? CATEGORIES[i.category].team}` : `Reported by ${i.reporter_count} Trojan${i.reporter_count > 1 ? "s" : ""}`;
              return (
                <Link
                  key={i.id}
                  href={`/issue/${i.id}`}
                  onClick={() => haptic()}
                  className={`flex items-start gap-3 rounded-2xl p-3 transition ${fresh === i.id ? "bg-gold/20" : "bg-white"} animate-fade-up`}
                  style={{ animationDelay: `${Math.min(n, 8) * 40}ms` }}
                >
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: STATUS[i.status].color }}>
                    <CategoryIcon category={i.category} size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{i.title}</p>
                    <p className="truncate text-xs text-muted">
                      {verb} · {describeLocation(i)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(i.updated_at)}</span>
                </Link>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* My reports */}
      {panel === "mine" && (
        <Sheet onClose={() => setPanel(null)} title="My reports" subtitle="You'll be notified the moment these are fixed">
          {myIssues.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-cardinal">
                <Building2 size={26} />
              </div>
              <p className="mt-3 font-semibold">No reports yet</p>
              <p className="max-w-[260px] text-sm text-muted">Spot something broken on campus? Snap it. One photo, and the right office hears about it.</p>
            </div>
          ) : (
            <div className="max-h-[55dvh] space-y-2 overflow-y-auto pb-1">
              {myIssues.map((i) => (
                <IssueCard key={i.id} issue={i} />
              ))}
            </div>
          )}
        </Sheet>
      )}
    </main>
  );
}

function Stat({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <div className="glass flex items-center gap-1.5 rounded-full border border-white/70 px-3 py-1.5 text-xs shadow">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <b className="tabular-nums">{n}</b> <span className="text-muted">{label}</span>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        haptic();
        onClick();
      }}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold shadow transition ${active ? "bg-cardinal text-white ring-1 ring-gold/60" : "glass border border-white/70 text-ink"}`}
    >
      {children}
    </button>
  );
}

function BarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        haptic();
        onClick();
      }}
      className="glass flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/70 text-[14px] font-semibold shadow transition active:scale-[0.98]"
    >
      {children}
    </button>
  );
}
