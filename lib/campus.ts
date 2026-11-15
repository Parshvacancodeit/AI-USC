// P1 campus registry: every USC building (OpenStreetMap) + rows from Supabase `locations` / `routing`.
import {
  Accessibility,
  Bike,
  Brush,
  Building2,
  Droplets,
  Home,
  Tag,
  Trees,
  UtensilsCrossed,
  Wifi,
  Wrench,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { USC_BUILDINGS } from "./usc-buildings";
import type { Location, Priority, Status } from "./types";

export const USC_CENTER: [number, number] = [-118.2856, 34.0205]; // Tommy Trojan
export const FLOOR_HEIGHT_M = 4.2;
export const floorLabel = (f: string) => (f === "B" ? "Basement" : `Floor ${f}`);
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

const floorsFor = (levels: number) => Array.from({ length: levels || 3 }, (_, i) => String(i + 1));

// ---------- Locations ----------
/** Mutable registry: starts with all campus buildings, grows with DB rows and custom spots. */
export const LOCATIONS: Location[] = USC_BUILDINGS.map((b) => ({
  id: b.id,
  name: b.name,
  lat: b.lat,
  lng: b.lng,
  floors: b.id === "leavey" ? ["B", "1", "2"] : floorsFor(b.levels),
}));

export function registerLocations(rows: Location[]) {
  rows.forEach((r) => {
    const i = LOCATIONS.findIndex((l) => l.id === r.id);
    const row = { ...r, floors: r.floors?.length ? r.floors : LOCATIONS[i]?.floors ?? [] };
    if (i >= 0) LOCATIONS[i] = { ...LOCATIONS[i], ...row, lat: LOCATIONS[i].lat, lng: LOCATIONS[i].lng };
    else LOCATIONS.push(row);
  });
}

export const getLocation = (id: string) => LOCATIONS.find((l) => l.id === id) ?? null;
export const locationName = (id: string) => getLocation(id)?.name ?? "USC campus";

// ---------- Problem types (routing) ----------
type CatInfo = { label: string; Icon: LucideIcon; covers: string; team: string };

const KNOWN: Record<string, CatInfo> = {
  elevator_access: { label: "Access", Icon: Accessibility, covers: "Elevators, ramps, auto doors, blocked paths", team: "Facilities — Elevators & Accessibility" },
  broken_equipment: { label: "Equipment", Icon: Wrench, covers: "Lights, doors, furniture, fountains, restrooms", team: "Facilities — Maintenance" },
  tech: { label: "Tech", Icon: Wifi, covers: "Printers, Wi-Fi, projectors, charging", team: "ITS" },
  grounds: { label: "Outdoors", Icon: Trees, covers: "Bike racks, paths, benches, lighting, sprinklers", team: "Facilities — Grounds" },
  cleanliness: { label: "Cleanliness", Icon: Brush, covers: "Trash, spills, graffiti, pests", team: "Custodial Services" },
  water_leak: { label: "Leak", Icon: Droplets, covers: "Leaks, flooding, plumbing", team: "Facilities — Maintenance" },
  housing: { label: "Housing", Icon: Home, covers: "Residence halls and apartments", team: "USC Housing" },
  dining: { label: "Dining", Icon: UtensilsCrossed, covers: "Dining halls and cafés", team: "USC Hospitality" },
  transportation: { label: "Transport", Icon: Bike, covers: "Bikes, shuttles, parking", team: "Transportation" },
  safety_hazard: { label: "Hazard", Icon: TriangleAlert, covers: "Trip hazards, exposed wiring (non-emergency)", team: "Facilities — Safety" },
  other: { label: "Other", Icon: Tag, covers: "Anything else", team: "Ripple triage (USG)" },
};
const ORDER = ["elevator_access", "broken_equipment", "tech", "grounds", "cleanliness"];
const registered = new Map<string, CatInfo>(ORDER.map((id) => [id, KNOWN[id]]));

const humanize = (id: string) => id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function catInfo(id: string): CatInfo {
  return registered.get(id) ?? KNOWN[id] ?? { label: humanize(id), Icon: Building2, covers: "", team: "Ripple triage (USG)" };
}

export function registerRouting(rows: { category: string; team_name: string }[]) {
  rows.forEach((r) => registered.set(r.category, { ...catInfo(r.category), team: r.team_name }));
}

/** Problem types currently known (DB routing rows + defaults). */
export const categoryIds = () => [...registered.keys()];

/** Back-compat: CATEGORIES[id] works for any id; Object.keys lists registered ones. */
export const CATEGORIES: Record<string, CatInfo> = new Proxy({} as Record<string, CatInfo>, {
  get: (_t, k) => (typeof k === "string" ? catInfo(k) : undefined),
  ownKeys: () => categoryIds(),
  getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && registered.has(k) ? { enumerable: true, configurable: true, value: catInfo(k) } : undefined),
});

export const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "var(--color-open)", bg: "rgba(255,69,58,0.16)" },
  assigned: { label: "In progress", color: "var(--color-assigned)", bg: "rgba(255,176,32,0.16)" },
  resolved: { label: "Fixed", color: "var(--color-resolved)", bg: "rgba(48,209,88,0.16)" },
  rejected: { label: "Closed", color: "var(--color-muted)", bg: "rgba(142,142,152,0.16)" },
};

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
