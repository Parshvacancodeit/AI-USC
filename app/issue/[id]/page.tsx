"use client";
import { Check, MapPin, MessageSquare, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { CategoryIcon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import StepHeader from "@/components/StepHeader";
import { MOCK, describeLocation, getIssue, mockAdvance, photoUrl, subscribeIssues } from "@/lib/api";
import { CATEGORIES, timeAgo } from "@/lib/campus";
import type { Issue } from "@/lib/types";

export default function IssuePage() {
  const { id } = useParams<{ id: string }>();
  const [issue, setIssue] = useState<Issue | null | undefined>(undefined);

  useEffect(() => {
    getIssue(id).then(setIssue).catch(() => setIssue(null));
    return subscribeIssues((i) => i.id === id && setIssue(i));
  }, [id]);

  if (issue === undefined)
    return (
      <main>
        <StepHeader title="Report" />
        <div className="m-4 aspect-[4/3] animate-pulse rounded-3xl bg-line" />
      </main>
    );
  if (issue === null)
    return (
      <main>
        <StepHeader title="Report" />
        <p className="p-8 text-center text-muted">This report doesn&apos;t exist anymore.</p>
      </main>
    );

  const cat = CATEGORIES[issue.category];
  const before = photoUrl(issue.before_photo_path);
  const after = photoUrl(issue.after_photo_path, "resolution-photos");
  const steps = [
    { label: "Reported", sub: `${issue.reporter_count} Trojan${issue.reporter_count > 1 ? "s" : ""} · ${timeAgo(issue.created_at)}`, on: true },
    { label: "Assigned", sub: issue.assigned_team ?? cat.team, on: issue.status !== "open" },
    { label: "Fixed", sub: issue.resolved_at ? timeAgo(issue.resolved_at) : "Waiting on the office", on: issue.status === "resolved" },
  ];

  return (
    <main className="pb-10">
      <StepHeader title="Report" />
      <div className="space-y-4 p-4 animate-fade-up">
        {issue.status === "resolved" && after ? (
          <div className="grid grid-cols-2 gap-2">
            <Photo src={before} label="Before" category={issue.category} />
            <Photo src={after} label="After" category={issue.category} />
          </div>
        ) : (
          <Photo src={before} category={issue.category} big />
        )}

        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={issue.status} />
            <span className="text-xs capitalize text-muted">{issue.priority} priority</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">{issue.title}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1"><CategoryIcon category={issue.category} size={14} className="text-accent" /> {cat.label}</span> · <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-accent" /> {describeLocation(issue)}</span>
          </p>
          {issue.description && <p className="mt-3 text-[15px] leading-relaxed">{issue.description}</p>}
        </div>

        <div className="rounded-2xl bg-surface p-4">
          {steps.map((s, i) => (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${s.on ? "bg-cardinal text-white" : "bg-surface-2 text-muted"}`}>{s.on ? <Check size={15} strokeWidth={3} /> : i + 1}</div>
                {i < steps.length - 1 && <div className={`w-0.5 flex-1 ${steps[i + 1].on ? "bg-cardinal" : "bg-line"}`} style={{ minHeight: 20 }} />}
              </div>
              <div className="pb-4">
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-muted">{s.sub}</p>
              </div>
            </div>
          ))}
          {issue.resolution_note && <p className="flex items-start gap-2 rounded-xl bg-resolved/15 p-3 text-sm"><MessageSquare size={16} className="mt-0.5 shrink-0 text-resolved" /> {issue.resolution_note}</p>}
        </div>

        <p className="flex items-center justify-center gap-1 text-center text-xs text-muted"><Users size={12} /> Student-reported · confirmed by {issue.reporter_count} · routed to official USC offices</p>

        {MOCK && issue.status !== "resolved" && (
          <button onClick={() => { haptic("medium"); mockAdvance(issue.id); }} className="h-11 w-full rounded-xl border-2 border-dashed border-gold bg-gold/10 text-sm font-semibold text-gold">
            Demo: simulate office {issue.status === "open" ? "assigning" : "fixing"} this →
          </button>
        )}
      </div>
    </main>
  );
}

function Photo({ src, label, category, big }: { src: string | null; label?: string; category: Issue["category"]; big?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-surface ${big ? "aspect-[4/3]" : "aspect-square"}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label ?? ""} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-cardinal to-cardinal-dark text-gold"><CategoryIcon category={category} size={64} /></div>
      )}
      {label && <span className="glass absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold">{label}</span>}
    </div>
  );
}
