// P1. Admin data layer — PREVIEW MODE.
// Reads real issues (read-only). Admin actions are kept in this browser (localStorage) until the
// backend from docs/ADMIN_BACKEND_REQUIREMENTS.md exists; then each action maps 1:1 to an API route.
import { catInfo, getLocation } from "./campus";
import { routeFor } from "./routing";
import { MOCK, photoUrl } from "./api";
import type { Category, Issue, Priority } from "./types";

export type AdminStatus = Issue["status"];
export type RejectReason = "not_an_issue" | "duplicate" | "emergency_dps" | "inappropriate" | "outside_scope";

export type AdminEvent = {
  at: string;
  by: string;
  type: "created" | "assigned" | "status" | "priority" | "rerouted" | "note" | "after_photo" | "resolved" | "reopened" | "rejected" | "merged" | "work_order";
  text: string;
};

export type Overlay = {
  status?: AdminStatus;
  assigned_team?: string;
  assignee?: string;
  priority?: Priority;
  category?: Category;
  duplicate_of?: string;
  rejected_reason?: RejectReason;
  resolution_note?: string;
  resolved_at?: string;
  after_photo?: string; // data URL (preview only)
  notes?: { at: string; by: string; text: string }[];
  events?: AdminEvent[];
};

export type AdminIssue = Omit<Issue, "status"> & {
  status: AdminStatus;
  assignee: string | null;
  duplicate_of: string | null;
  rejected_reason: RejectReason | null;
  after_photo: string | null;
  notes: { at: string; by: string; text: string }[];
  events: AdminEvent[];
  office: string;
  locationLabel: string;
  lat: number | null;
  lng: number | null;
};

const KEY = "ripple-admin-overlay";
export const ADMIN_NAME_KEY = "ripple-admin-name";

export function readOverlay(): Record<string, Overlay> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

// ---------- live mode: server actions ----------
function adminHeaders(): Record<string, string> {
  let pass = "";
  try {
    pass = sessionStorage.getItem("ripple-admin-pass") ?? "";
  } catch {}
  return { "Content-Type": "application/json", "x-admin-passcode": pass, "x-admin-name": encodeURIComponent(adminName()) };
}

async function serverAction(body: object) {
  const res = await fetch("/api/admin/action", { method: "POST", headers: adminHeaders(), body: JSON.stringify(body) }).catch(() => null);
  if (!res?.ok) {
    const msg = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : "You're offline";
    window.alert(`Couldn't save: ${msg ?? "unknown error"}`);
  }
  window.dispatchEvent(new Event("ripple:admin"));
}

export type Activity = {
  events: { issue_id: string; actor_name: string; type: AdminEvent["type"]; text: string; created_at: string }[];
  notes: { issue_id: string; author_name: string; text: string; created_at: string }[];
};

export async function loadActivity(): Promise<Activity> {
  const res = await fetch("/api/admin/activity", { headers: adminHeaders() });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't load activity");
  return res.json();
}

export function writeOverlay(id: string, patch: Overlay, event?: Omit<AdminEvent, "at" | "by">) {
  if (!MOCK) {
    const { resolved_at: _r, notes: _n, events: _e, ...rest } = patch;
    void _r;
    void _n;
    void _e;
    return void serverAction({ issueId: id, patch: rest, event });
  }
  const all = readOverlay();
  const cur = all[id] ?? {};
  const by = adminName();
  const next: Overlay = { ...cur, ...patch };
  if (event) next.events = [...(cur.events ?? []), { ...event, at: new Date().toISOString(), by }];
  all[id] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // quota (after photos): drop photos and retry
    Object.values(all).forEach((o) => delete o.after_photo);
    localStorage.setItem(KEY, JSON.stringify(all));
  }
  window.dispatchEvent(new Event("ripple:admin"));
}

export function addNote(id: string, text: string) {
  if (!MOCK) return void serverAction({ issueId: id, note: text, event: { type: "note", text } });
  const cur = readOverlay()[id] ?? {};
  writeOverlay(id, { notes: [...(cur.notes ?? []), { at: new Date().toISOString(), by: adminName(), text }] }, { type: "note", text });
}

export function clearOverlay() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("ripple:admin"));
}

export function adminName() {
  try {
    return localStorage.getItem(ADMIN_NAME_KEY) || "Office admin";
  } catch {
    return "Office admin";
  }
}

export function merge(issues: Issue[], ov: Record<string, Overlay>, live?: Activity | null): AdminIssue[] {
  return issues.map((i) => {
    const o = ov[i.id] ?? {};
    const category = o.category ?? i.category;
    const loc = getLocation(i.location_id);
    return {
      ...i,
      category,
      priority: o.priority ?? i.priority,
      status: o.status ?? i.status,
      assigned_team: o.assigned_team ?? i.assigned_team,
      resolution_note: o.resolution_note ?? i.resolution_note,
      resolved_at: o.resolved_at ?? i.resolved_at,
      assignee: o.assignee ?? i.assignee ?? null,
      duplicate_of: o.duplicate_of ?? i.duplicate_of ?? null,
      rejected_reason: (o.rejected_reason ?? i.rejected_reason ?? null) as RejectReason | null,
      after_photo: o.after_photo ?? photoUrl(i.after_photo_path, "resolution-photos"),
      notes: live ? live.notes.filter((n) => n.issue_id === i.id).map((n) => ({ at: n.created_at, by: n.author_name, text: n.text })) : (o.notes ?? []),
      events: [
        ...(live?.events.some((e) => e.issue_id === i.id && e.type === "created")
          ? []
          : [{ at: i.created_at, by: "Student", type: "created", text: `Reported by ${i.reporter_count} student${i.reporter_count > 1 ? "s" : ""}` } as AdminEvent]),
        ...(live ? live.events.filter((e) => e.issue_id === i.id).map((e) => ({ at: e.created_at, by: e.actor_name, type: e.type, text: e.text })) : (o.events ?? [])),
      ],
      office: o.assigned_team ?? i.assigned_team ?? routeFor(category, i.location_id, i.floor).office,
      locationLabel: `${loc?.name ?? "USC campus"}${i.floor ? ` · Floor ${i.floor}` : ""}`,
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
    };
  });
}

// ---------- metrics ----------
const H = 3600 * 1000;
export const hoursBetween = (a: string, b: string) => (+new Date(b) - +new Date(a)) / H;

export function fmtHours(h: number | null) {
  if (h === null || !Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${Math.round(h / 24)} d`;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function metrics(list: AdminIssue[]) {
  const live = list.filter((i) => i.status !== "rejected" && !i.duplicate_of);
  const today = Date.now() - 24 * H;
  const fixes = live.filter((i) => i.status === "resolved" && i.resolved_at).map((i) => hoursBetween(i.created_at, i.resolved_at!));
  return {
    open: live.filter((i) => i.status === "open").length,
    assigned: live.filter((i) => i.status === "assigned").length,
    fixedToday: live.filter((i) => i.status === "resolved" && i.resolved_at && +new Date(i.resolved_at) > today).length,
    reports24h: live.filter((i) => +new Date(i.created_at) > today).reduce((n, i) => n + i.reporter_count, 0),
    access: live.filter((i) => i.category === "elevator_access" && i.status !== "resolved").length,
    medianFix: median(fixes),
    urgent: live.filter((i) => i.status !== "resolved" && (i.priority === "urgent" || i.priority === "high")),
  };
}

export type BuildingRow = { id: string; name: string; open: number; assigned: number; fixed: number; avgFix: number | null; chronic: string[]; access: number; score: number };

/** Building health: 100 minus weighted open load, slow fixes and repeat problems. */
export function buildingHealth(list: AdminIssue[]): BuildingRow[] {
  const by = new Map<string, AdminIssue[]>();
  list.filter((i) => i.status !== "rejected" && !i.duplicate_of).forEach((i) => by.set(i.location_id, [...(by.get(i.location_id) ?? []), i]));
  const W: Record<Priority, number> = { low: 4, medium: 8, high: 14, urgent: 22 };
  return [...by.entries()]
    .map(([id, xs]) => {
      const active = xs.filter((i) => i.status !== "resolved");
      const fixes = xs.filter((i) => i.status === "resolved" && i.resolved_at).map((i) => hoursBetween(i.created_at, i.resolved_at!));
      const counts = new Map<string, number>();
      xs.forEach((i) => counts.set(i.category, (counts.get(i.category) ?? 0) + 1));
      const chronic = [...counts.entries()].filter(([, n]) => n >= 3).map(([c]) => catInfo(c).label);
      const avgFix = fixes.length ? fixes.reduce((a, b) => a + b, 0) / fixes.length : null;
      const penalty = active.reduce((n, i) => n + W[i.priority], 0) + chronic.length * 10 + (avgFix && avgFix > 72 ? 10 : 0);
      return {
        id,
        name: getLocation(id)?.name ?? id,
        open: xs.filter((i) => i.status === "open").length,
        assigned: xs.filter((i) => i.status === "assigned").length,
        fixed: fixes.length,
        avgFix,
        chronic,
        access: active.filter((i) => i.category === "elevator_access").length,
        score: Math.max(0, 100 - penalty),
      };
    })
    .sort((a, b) => a.score - b.score);
}

export function workOrderText(i: AdminIssue, photoUrl: string | null) {
  const maps = i.lat && i.lng ? `https://maps.google.com/?q=${i.lat},${i.lng}` : "";
  return [
    `WORK ORDER — ${i.title}`,
    ``,
    `To: ${i.office}`,
    `Priority: ${i.priority.toUpperCase()}${i.category === "elevator_access" ? " (accessibility impact)" : ""}`,
    `Location: ${i.locationLabel}`,
    maps && `Map: ${maps}`,
    `Problem type: ${catInfo(i.category).label}`,
    `Confirmed by: ${i.reporter_count} student${i.reporter_count > 1 ? "s" : ""}`,
    `First reported: ${new Date(i.created_at).toLocaleString()}`,
    ``,
    i.description ? `Details: ${i.description}` : "",
    photoUrl ? `Photo (faces blurred on device): ${photoUrl}` : "",
    ``,
    `Reply or mark resolved in Ripple: reporters are notified automatically.`,
    `Ripple · student-reported, routed to official USC offices`,
  ]
    .filter((l): l is string => typeof l === "string")
    .join("\n");
}

export function toCsv(list: AdminIssue[]) {
  const cols = ["id", "title", "status", "priority", "category", "office", "assignee", "location", "floor", "lat", "lng", "reporters", "created_at", "resolved_at", "hours_to_fix"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = list.map((i) =>
    [i.id, i.title, i.status, i.priority, i.category, i.office, i.assignee, i.locationLabel, i.floor, i.lat, i.lng, i.reporter_count, i.created_at, i.resolved_at, i.resolved_at ? hoursBetween(i.created_at, i.resolved_at).toFixed(1) : ""].map(esc).join(","),
  );
  return [cols.join(","), ...rows].join("\n");
}
