// P3 Dispatch Copilot: Smart priority score for the queue (pure, no AI). Higher = handle first.
import type { AdminIssue } from "./admin";
import { isOverdue } from "./sla";
import type { Priority } from "./types";

const PRIORITY: Record<Priority, number> = { urgent: 40, high: 25, medium: 12, low: 5 };
const DAY = 86400_000;

export function triageScore(i: AdminIssue, all: AdminIssue[], now = Date.now()): { score: number; reasons: string[] } {
  if (i.status === "resolved" || i.status === "rejected") return { score: 0, reasons: [] };
  const parts: { pts: number; label: string }[] = [];
  parts.push({ pts: PRIORITY[i.priority] ?? 12, label: `${i.priority[0].toUpperCase()}${i.priority.slice(1)} priority` });
  if (i.ai_risk?.safety_risk) parts.push({ pts: 20, label: "Safety risk" });
  if (i.ai_risk?.act_today) parts.push({ pts: 10, label: "Act today" });
  if (i.category === "elevator_access") parts.push({ pts: 15, label: "Accessibility" });
  const reps = Math.min(i.reporter_count, 10);
  if (reps > 1) parts.push({ pts: 3 * reps, label: `${i.reporter_count} students` });
  else parts.push({ pts: 3 * reps, label: "1 student" });
  const recurrence = all.filter((x) => x.id !== i.id && x.location_id === i.location_id && x.category === i.category && now - +new Date(x.created_at) <= 45 * DAY).length;
  if (recurrence > 0) parts.push({ pts: Math.min(24, 4 * recurrence), label: `Recurring: ${recurrence + 1} in 45 days` });
  const hours = Math.max(0, (now - +new Date(i.created_at)) / 3600_000);
  if (hours >= 1) parts.push({ pts: Math.min(20, 0.5 * hours), label: hours < 48 ? `Open ${Math.round(hours)} h` : `Open ${Math.round(hours / 24)} days` });
  if (isOverdue(i, now)) parts.push({ pts: 15, label: "Overdue" });

  const score = Math.round(parts.reduce((n, p) => n + p.pts, 0));
  const reasons = parts
    .filter((p) => !p.label.endsWith("priority") && p.label !== "1 student")
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3)
    .map((p) => p.label);
  return { score, reasons };
}
