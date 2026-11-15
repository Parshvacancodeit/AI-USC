"use client";
// P3 Dispatch Copilot: AI triage risk for the supervisor (advisory). Hidden when there is no risk data.
import { Accessibility, Clock, Phone, ShieldAlert, Siren } from "lucide-react";
import { DPS_PHONE } from "@/lib/help";
import type { Issue } from "@/lib/types";

export default function RiskPanel({ risk, confidence }: { risk: Issue["ai_risk"]; confidence?: number | null }) {
  if (!risk) return null;
  const badges = [
    risk.safety_risk && { label: "Safety risk", Icon: ShieldAlert, color: "#ff453a" },
    risk.notify_dps && { label: "Notify DPS", Icon: Siren, color: "#ff453a" },
    risk.act_today && { label: "Act today", Icon: Clock, color: "#ff9f0a" },
  ].filter(Boolean) as { label: string; Icon: typeof Accessibility; color: string }[];
  return (
    <section className="space-y-2 rounded-2xl bg-surface p-3">
      {risk.notify_dps && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-open/15 p-3 text-sm font-semibold text-open">
          <Phone size={16} className="shrink-0" /> AI flagged possible emergency. Call DPS: {DPS_PHONE}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold">Risk</p>
        {badges.length ? (
          badges.map((b) => (
            <span key={b.label} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ color: b.color, background: `${b.color}22` }}>
              <b.Icon size={12} /> {b.label}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted">No safety risk flagged</span>
        )}
      </div>
      {risk.reason && <p className="text-sm text-muted">{risk.reason}</p>}
      <p className="text-xs text-muted">
        AI risk confidence {risk.confidence.toFixed(2)}
        {typeof confidence === "number" ? ` · AI category confidence ${confidence.toFixed(2)}` : ""}
      </p>
    </section>
  );
}
