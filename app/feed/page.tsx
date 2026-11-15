"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CategoryIcon } from "@/components/Icon";
import LargeTitle from "@/components/LargeTitle";
import TabBar from "@/components/TabBar";
import { describeLocation, listIssues, subscribeIssues } from "@/lib/api";
import { CATEGORIES, STATUS, timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import type { Issue, Status } from "@/lib/types";

const SEGMENTS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "assigned", label: "In progress" },
  { key: "resolved", label: "Fixed" },
];

function group(iso: string) {
  const h = (Date.now() - +new Date(iso)) / 3600000;
  return h < 1 ? "Last hour" : h < 24 ? "Today" : "Earlier";
}

export default function Feed() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [seg, setSeg] = useState<Status | "all">("all");
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    listIssues().then(setIssues).catch(() => setIssues([]));
    return subscribeIssues((issue) => {
      setIssues((l) => [issue, ...(l ?? []).filter((i) => i.id !== issue.id)]);
      setFresh(issue.id);
      haptic();
    });
  }, []);

  const groups = useMemo(() => {
    const list = (issues ?? []).filter((i) => i.status !== "rejected").filter((i) => seg === "all" || i.status === seg).sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    const out: Record<string, Issue[]> = {};
    list.forEach((i) => (out[group(i.updated_at)] ??= []).push(i));
    return Object.entries(out);
  }, [issues, seg]);

  return (
    <main className="pb-tabbar min-h-dvh">
      <LargeTitle
        title="Feed"
        subtitle={
          <span className="flex items-center gap-1.5">
            <span className="live-dot h-2 w-2 rounded-full bg-open" /> Everything happening at USC, live
          </span>
        }
      />
      <div className="sticky top-0 z-10 bg-canvas/90 px-4 pb-3 pt-1 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                haptic();
                setSeg(s.key);
              }}
              className={`h-8 rounded-lg text-[12px] font-semibold transition ${seg === s.key ? "bg-surface-2 text-ink shadow" : "text-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 px-4">
        {issues === null && [0, 1, 2].map((n) => <div key={n} className="shimmer h-20 rounded-2xl" />)}
        {issues !== null && groups.length === 0 && <p className="py-16 text-center text-muted">Nothing here yet.</p>}
        {groups.map(([label, list]) => (
          <section key={label}>
            <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">{label}</h2>
            <div className="overflow-hidden rounded-2xl bg-surface">
              {list.map((i, n) => {
                const verb =
                  i.status === "resolved" ? "Fixed" : i.status === "assigned" ? `Assigned to ${i.assigned_team ?? CATEGORIES[i.category].team}` : `${i.reporter_count} Trojan${i.reporter_count > 1 ? "s" : ""} reported`;
                return (
                  <Link
                    key={i.id}
                    href={`/issue/${i.id}`}
                    onClick={() => haptic()}
                    className={`flex items-center gap-3 px-3 py-3 transition animate-fade-up ${n > 0 ? "border-t hairline" : ""} ${fresh === i.id ? "bg-gold/10" : ""}`}
                    style={{ animationDelay: `${Math.min(n, 8) * 35}ms` }}
                  >
                    <div className="relative">
                      <div className="grid h-11 w-11 place-items-center rounded-full" style={{ background: STATUS[i.status].bg, color: STATUS[i.status].color }}>
                        <CategoryIcon category={i.category} size={20} />
                      </div>
                      {i.status === "open" && <span className="live-dot absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-open" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{i.title}</p>
                      <p className="truncate text-[13px] text-muted">
                        <span style={{ color: STATUS[i.status].color }}>{verb}</span> · {describeLocation(i)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[12px] text-muted">{timeAgo(i.updated_at)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <TabBar />
    </main>
  );
}
