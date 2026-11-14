// P1 UI constants for USC. Location list mirrors README seed.sql (P2's DB is the source of truth once live).
import { Accessibility, Wifi, Wrench, type LucideIcon } from "lucide-react";
import type { Category, Location, Priority, Status } from "./types";

export const USC_CENTER: [number, number] = [-118.2856, 34.0205]; // Tommy Trojan

// Must match the `locations` table in Supabase (ids). Map coordinates from OpenStreetMap building outlines.
export const LOCATIONS: Location[] = [
  { id: "ginsburg", name: "Ginsburg Hall", lat: 34.02184, lng: -118.29045, floors: ["1", "2", "3"] },
  { id: "leavey", name: "Leavey Library", lat: 34.02178, lng: -118.28294, floors: ["B", "1", "2"] },
  { id: "parkside", name: "Parkside", lat: 34.01873, lng: -118.29007, floors: ["1", "2", "3", "4"] },
];

export const locationName = (id: string) => LOCATIONS.find((l) => l.id === id)?.name ?? id;

export const CATEGORIES: Record<Category, { label: string; Icon: LucideIcon; covers: string; team: string }> = {
  elevator_access: {
    label: "Access",
    Icon: Accessibility,
    covers: "Elevators, ramps, auto doors, blocked paths",
    team: "Facilities — Elevators & Accessibility",
  },
  broken_equipment: {
    label: "Equipment",
    Icon: Wrench,
    covers: "Lights, doors, furniture, fountains, restrooms, leaks",
    team: "Facilities — Maintenance",
  },
  tech: {
    label: "Tech",
    Icon: Wifi,
    covers: "Printers, Wi-Fi, projectors, charging",
    team: "ITS",
  },
};

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "var(--color-open)", bg: "rgba(255,69,58,0.16)" },
  assigned: { label: "In progress", color: "var(--color-assigned)", bg: "rgba(255,176,32,0.16)" },
  resolved: { label: "Fixed", color: "var(--color-resolved)", bg: "rgba(48,209,88,0.16)" },
};

export function nearestLocation(lat: number, lng: number): Location {
  const d = (l: Location) => (l.lat - lat) ** 2 + ((l.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
  return [...LOCATIONS].sort((a, b) => d(a) - d(b))[0];
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const FLOOR_HEIGHT_M = 4.2;
export const floorLabel = (f: string) => (f === "B" ? "Basement" : `Floor ${f}`);
