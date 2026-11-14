"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import IssueCard, { Thumb } from "@/components/IssueCard";
import StatusBadge from "@/components/StatusBadge";
import { MOCK, describeLocation, ensureSession, listIssues, mockReset, myIssueIds, subscribeIssues } from "@/lib/api";
import { CATEGORIES, timeAgo } from "@/lib/campus";
import type { Issue } from "@/lib/types";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-line" />,
});

const DAY = 24 * 3600 * 1000;

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [showMine, setShowMine] = useState(false);
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    setMine(myIssueIds());
    ensureSession().catch(() => {});
    listIssues().then(setIssues).catch((e) => setError(e.message));
    return subscribeIssues((issue) => {
      setIssues((list) => [issue, ...list.filter((i) => i.id !== issue.id)]);
      setSelected((s) => (s?.id === issue.id ? issue : s));
      setMine(myIssueIds());
    });
  }, []);

  const visible = useMemo(
    () => issues.filter((i) => i.status !== "resolved" || Date.now() - +new Date(i.resolved_at ?? i.updated_at) < DAY),
    [issues],
  );
  const counts = useMemo(
    () => ({
      open: visible.filter((i) => i.status === "open").length,
      assigned: visible.filter((i) => i.status === "assigned").length,
      resolved: visible.filter((i) => i.status === "resolved").length,
    }),
    [visible],
  );
  const myIssues = issues.filter((i) => mine.includes(i.id));

  return (
    <main className="relative h-dvh overflow-hidden">
      <CampusMap issues={visible} onSelect={setSelected} focusId={selected?.id} />

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-10 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="glass flex items-center gap-3 rounded-2xl border border-white/60 px-4 py-3 shadow-lg">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-cardinal text-lg font-black text-gold">R</div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-tight">Ripple</p>
            <p className="text-xs text-muted">Live campus status · USC</p>
          </div>
          {MOCK && (
            <button onClick={mockReset} className="rounded-full bg-gold/30 px-2.5 py-1 text-[10px] font-semibold text-cardinal-dark" title="Reset demo data">
              DEMO DATA ↺
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Chip color="var(--color-open)" n={counts.open} label="open" />
          <Chip color="var(--color-assigned)" n={counts.assigned} label="in progress" />
          <Chip color="var(--color-resolved)" n={counts.resolved} label="fixed today" />
        </div>
        {error && <p className="mt-2 rounded-xl bg-white p-2 text-xs text-open">Couldn&apos;t load issues: {error}</p>}
      </header>

      {/* Bottom actions */}
      <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 space-y-2 px-3">
        <Link
          href="/report"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-cardinal text-[17px] font-semibold text-white shadow-xl shadow-cardinal/30 active:scale-[0.98] transition"
        >
          <span className="text-xl">📸</span> Report a problem
        </Link>
        <button onClick={() => setShowMine(true)} className="glass flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/60 text-[15px] font-semibold shadow">
          My reports
          <span className="rounded-full bg-cardinal px-2 py-0.5 text-xs text-white">{myIssues.length}</span>
        </button>
      </div>

      {/* Pin sheet */}
      {selected && (
        <Sheet onClose={() => setSelected(null)}>
          <div className="flex gap-3">
            <Thumb issue={selected} size={72} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold leading-snug">{selected.title}</p>
              <p className="text-xs text-muted">
                {CATEGORIES[selected.category].icon} {describeLocation(selected)} · {timeAgo(selected.created_at)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-muted">👥 {selected.reporter_count} Trojans reported</span>
              </div>
            </div>
          </div>
          <Link href={`/issue/${selected.id}`} className="mt-4 flex h-12 items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-white">
            View details
          </Link>
        </Sheet>
      )}

      {/* My reports */}
      {showMine && (
        <Sheet onClose={() => setShowMine(false)} title="My reports">
          {myIssues.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-3xl">✌️</p>
              <p className="mt-2 font-semibold">No reports yet</p>
              <p className="text-sm text-muted">Spot something broken? Snap it. You&apos;ll be notified when it&apos;s fixed.</p>
            </div>
          ) : (
            <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
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

function Chip({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <div className="glass flex items-center gap-1.5 rounded-full border border-white/60 px-3 py-1.5 text-xs font-medium shadow">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <b>{n}</b> <span className="text-muted">{label}</span>
    </div>
  );
}

function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/25" onClick={onClose}>
      <div className="animate-slide-up safe-bottom w-full rounded-t-3xl bg-canvas px-4 pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-3 text-xl font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
