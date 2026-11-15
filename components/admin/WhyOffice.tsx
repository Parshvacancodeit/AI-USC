"use client";
// P3 Dispatch Copilot: explains the routing in one glance (pure, client-side; no API).
import { Route } from "lucide-react";
import type { AdminIssue } from "@/lib/admin";
import { catInfo } from "@/lib/campus";
import { placeKind, routeFor } from "@/lib/routing";
import type { PlaceKind } from "@/lib/usc-buildings";

const KIND: Record<PlaceKind, string> = {
  academic: "Academic building",
  residence: "Residence hall",
  dining: "Dining location",
  library: "Library",
  athletic: "Athletics facility",
  parking: "Parking structure",
  outdoor: "Outdoor area",
  health: "Health facility",
};

export default function WhyOffice({ issue: i }: { issue: AdminIssue }) {
  const rule = routeFor(i.category, i.location_id, i.floor);
  const human = [...i.events].reverse().find((e) => e.type === "rerouted" && e.by !== "Ripple" && e.by !== "Student");
  const facts = [
    KIND[placeKind(i.location_id)] + (i.floor === "Outside" ? " (outside)" : ""),
    `Problem type: ${catInfo(i.category).label}`,
    typeof i.ai_confidence === "number" ? `AI category confidence: ${i.ai_confidence.toFixed(2)}` : null,
  ].filter(Boolean);
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
      <p className="flex items-center gap-1.5 font-semibold">
        <Route size={14} className="text-accent" /> Why {i.office}?
      </p>
      {human ? (
        <p className="mt-1">
          Re-routed by <b>{human.by}</b>. Default rule: {rule.office}, because {lower(rule.why)}.
        </p>
      ) : (
        <p className="mt-1">{rule.why}.</p>
      )}
      <p className="mt-1 text-muted">{facts.join(" · ")}</p>
    </div>
  );
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
