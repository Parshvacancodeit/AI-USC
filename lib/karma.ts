// P1. Karma, tiers, badges and leaderboard, computed from the public reports + issues tables.
import { Accessibility, Flame, Moon, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import type { Issue } from "./types";

type Report = { issue_id: string; reporter_id: string; created_at: string };

export const POINTS = { first: 10, confirm: 5, fixed: 20 };

export const TIERS = [
  { name: "Recruit", min: 0, color: "#8e8e98" },
  { name: "Trojan", min: 50, color: "#ff453a" },
  { name: "Centurion", min: 150, color: "#ffb020" },
  { name: "Legend", min: 400, color: "#ffcc00" },
];

export function tierFor(points: number) {
  let i = 0;
  TIERS.forEach((t, k) => points >= t.min && (i = k));
  const next = TIERS[i + 1] ?? null;
  const progress = next ? (points - TIERS[i].min) / (next.min - TIERS[i].min) : 1;
  return { tier: TIERS[i], next, progress };
}

export type Badge = { id: string; name: string; hint: string; Icon: LucideIcon; earned: boolean };

export type Player = { id: string; handle: string; points: number; reports: number; firsts: number; fixed: number; badges: Badge[] };

const ADJ = ["Cardinal", "Golden", "Swift", "Bold", "Brave", "Loyal", "Mighty", "Clever", "Rapid", "Fearless", "Steady", "Bright"];
const NOUN = ["Trojan", "Spartan", "Centurion", "Archer", "Falcon", "Lion", "Knight", "Scholar", "Ranger", "Phoenix", "Titan", "Comet"];

/** Stable, anonymous display name for a reporter id. */
export function handle(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]} ${10 + ((h >>> 16) % 90)}`;
}

export function scoreboard(reports: Report[], issues: Issue[]): Player[] {
  const byIssue = new Map(issues.map((i) => [i.id, i]));
  const firstOf = new Map<string, Report>();
  [...reports].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).forEach((r) => firstOf.has(r.issue_id) || firstOf.set(r.issue_id, r));

  const players = new Map<string, Player & { access: boolean; night: boolean }>();
  for (const r of reports) {
    const p = players.get(r.reporter_id) ?? { id: r.reporter_id, handle: handle(r.reporter_id), points: 0, reports: 0, firsts: 0, fixed: 0, badges: [], access: false, night: false };
    const issue = byIssue.get(r.issue_id);
    const first = firstOf.get(r.issue_id) === r;
    p.reports++;
    p.points += first ? POINTS.first : POINTS.confirm;
    if (first) p.firsts++;
    if (issue?.status === "resolved") {
      p.fixed++;
      p.points += POINTS.fixed;
    }
    if (issue?.category === "elevator_access") p.access = true;
    const h = new Date(r.created_at).getHours();
    if (h >= 22 || h < 5) p.night = true;
    players.set(r.reporter_id, p);
  }
  return [...players.values()]
    .map(({ access, night, ...p }) => ({
      ...p,
      badges: [
        { id: "first", name: "First Report", hint: "Report your first problem", Icon: Sparkles, earned: p.reports >= 1 },
        { id: "spotter", name: "Spotter", hint: "Be first to report 3 problems", Icon: Flame, earned: p.firsts >= 3 },
        { id: "fixer", name: "Fixer", hint: "3 of your reports get fixed", Icon: Wrench, earned: p.fixed >= 3 },
        { id: "ally", name: "Access Ally", hint: "Report an accessibility issue", Icon: Accessibility, earned: access },
        { id: "owl", name: "Night Owl", hint: "Report after 10 PM", Icon: Moon, earned: night },
      ],
    }))
    .sort((a, b) => b.points - a.points);
}

export const emptyBadges = (): Badge[] => scoreboard([{ issue_id: "x", reporter_id: "x", created_at: new Date(2000, 0, 1, 12).toISOString() }], [])[0].badges.map((b) => ({ ...b, earned: false }));
