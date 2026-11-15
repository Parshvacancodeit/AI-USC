// P3: unit check for lib/triage-score.ts. Run: node --no-warnings --import ./scripts/ts-resolve.mjs scripts/test-triage.mjs
import assert from "node:assert/strict";
import { triageScore } from "../lib/triage-score.ts";
import { isOverdue } from "../lib/sla.ts";

const now = Date.now();
const iso = (hAgo) => new Date(now - hAgo * 3600_000).toISOString();
const base = { status: "open", events: [], reporter_count: 1, location_id: "x", floor: null, ai_risk: null, office: "FPM — Building Maintenance" };
const access = { ...base, id: "a", category: "elevator_access", priority: "high", reporter_count: 5, location_id: "parkside", created_at: iso(10) };
const cosmetic = { ...base, id: "b", category: "broken_equipment", priority: "low", created_at: iso(10) };
const prior = [1, 2, 3, 4, 5].map((n) => ({ ...access, id: `p${n}`, status: "resolved", created_at: iso(24 * 7 * n) }));
const all = [access, cosmetic, ...prior];

const A = triageScore(access, all, now), C = triageScore(cosmetic, all, now);
console.log("accessibility:", A, "\ncosmetic:", C);
assert.ok(A.score > C.score, "high-priority accessibility issue with 5 reporters must outrank a low cosmetic one");
assert.ok(A.reasons.includes("Accessibility"), "chip: Accessibility");
assert.ok(A.reasons.some((r) => r.startsWith("Recurring: 6")), "chip: Recurring: 6 in 45 days");
assert.equal(triageScore({ ...access, status: "resolved" }, all, now).score, 0, "resolved scores 0");

const sent = { ...access, status: "assigned", priority: "high", events: [{ type: "work_order", at: iso(26), by: "x", text: "sent" }] };
assert.equal(isOverdue(sent, now), true, "high priority sent 26 h ago, no ack → overdue");
assert.equal(isOverdue({ ...sent, events: [...sent.events, { type: "acknowledged", at: iso(1), by: "o", text: "ack" }] }, now), false, "acknowledged → not overdue");
assert.ok(triageScore(sent, all, now).reasons.includes("Overdue") || triageScore(sent, all, now).score > A.score, "overdue adds points");
console.log("triage + sla checks passed");
