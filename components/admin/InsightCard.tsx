"use client";
// P3 Dispatch Copilot: "Recurring issue" card in the /admin issue detail (fetched once per issue per session).
import { Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { adminPost } from "@/lib/admin";

type Insight = { recurring: boolean; count: number; resolved?: number; median_days?: number | null; likely_cause?: string; recommendation?: string; confidence?: number };
const seen = new Map<string, Insight | null>();

export default function InsightCard({ issueId }: { issueId: string }) {
  const [data, setData] = useState<Insight | null | undefined>(seen.get(issueId));
  useEffect(() => {
    if (seen.has(issueId)) return setData(seen.get(issueId));
    let live = true;
    adminPost<Insight>("/api/admin/insight", { issueId })
      .then((r) => (seen.set(issueId, r), live && setData(r)))
      .catch(() => (seen.set(issueId, null), live && setData(null))); // hide on error
    return () => {
      live = false;
    };
  }, [issueId]);

  if (data === undefined)
    return (
      <div className="space-y-2 rounded-2xl bg-surface p-3">
        <div className="shimmer h-4 w-2/3 rounded" />
        <div className="shimmer h-3 w-full rounded" />
      </div>
    );
  if (!data?.recurring) return null;
  const total = data.count + 1;
  return (
    <section className="space-y-1.5 rounded-2xl border border-open/30 bg-open/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-open">
        <Flame size={15} /> Recurring issue: {total} similar here in 45 days
      </p>
      <p className="text-xs text-muted">
        {data.resolved ?? 0} repaired{typeof data.median_days === "number" ? ` · median fix ${data.median_days} days` : ""}
      </p>
      {data.likely_cause && (
        <p className="text-sm">
          <b>Likely cause:</b> {data.likely_cause.replace(/^Likely,?\s*/i, "")}
        </p>
      )}
      {data.recommendation && (
        <p className="text-sm">
          <b>Recommendation:</b> {data.recommendation}
        </p>
      )}
      {typeof data.confidence === "number" && <p className="text-xs text-muted">AI confidence {data.confidence.toFixed(2)}</p>}
    </section>
  );
}
