// P3 Dispatch Copilot: response deadlines for offices (pure, client + server). Rules, not AI.
// Clock starts when the work order is sent (latest work_order event, else assigned_at) and stops when the office
// acknowledges. Reminders don't reset it. Demo: NEXT_PUBLIC_SLA_DEMO_MINUTES overrides every deadline.
import type { AdminIssue } from "./admin";
import { departmentFor } from "./departments";
import type { Priority } from "./types";

export const ACK_HOURS: Record<Priority, number> = { urgent: 4, high: 24, medium: 72, low: 168 };
const DEMO_MIN = Number(process.env.NEXT_PUBLIC_SLA_DEMO_MINUTES || 0);
const H = 3600_000;

type SlaIssue = Pick<AdminIssue, "status" | "priority" | "events"> & { assigned_at?: string | null };

export const deadlineHours = (p: Priority) => (DEMO_MIN > 0 ? DEMO_MIN / 60 : ACK_HOURS[p]);

/** When the office was asked (first work order); null if never sent. */
export function sentAt(i: SlaIssue): Date | null {
  const sent = i.events.filter((e) => e.type === "work_order").map((e) => +new Date(e.at));
  if (sent.length) return new Date(Math.min(...sent));
  return i.assigned_at ? new Date(i.assigned_at) : null;
}

export function isAcknowledged(i: SlaIssue, since: Date | null = sentAt(i)): boolean {
  return i.events.some((e) => (e.type === "acknowledged" || (e.type === "status" && e.text.startsWith("Acknowledged"))) && (!since || +new Date(e.at) >= +since));
}

export function ackDeadline(i: SlaIssue): Date | null {
  const s = sentAt(i);
  return s ? new Date(+s + deadlineHours(i.priority) * H) : null;
}

export function isOverdue(i: SlaIssue, now = Date.now()): boolean {
  if (i.status === "resolved" || i.status === "rejected" || i.status === "open") return false;
  const d = ackDeadline(i);
  return !!d && now > +d && !isAcknowledged(i);
}

export const reminderCount = (i: SlaIssue) => i.events.filter((e) => e.type === "reminder").length;

const fmt = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

/** "Facilities hasn't acknowledged · sent 26 h ago · deadline 24 h" */
export function overdueLabel(i: SlaIssue & { office: string }, now = Date.now()): string {
  const s = sentAt(i);
  if (!s) return "";
  return `${departmentFor(i.office).name} hasn't acknowledged · sent ${fmt((now - +s) / H)} ago · deadline ${fmt(deadlineHours(i.priority))}`;
}
