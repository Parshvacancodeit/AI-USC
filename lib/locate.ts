// P1. Turns a GPS point into a campus location: "Inside Leavey Library" or "40 m north of Doheny Library".
import { USC_BUILDINGS, type Building } from "./usc-buildings";
import type { Location } from "./types";

export type Spot = {
  kind: "inside" | "near" | "campus";
  label: string; // human sentence for the UI
  hint: string | null; // direction guide, e.g. "Southwest side · about 15 m"
  location: Location; // what gets saved (a building, or a custom spot)
  building: Building | null;
};

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function inside(lng: number, lat: number, ring: [number, number][]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

/** Meters from point to the building's outline. */
function edgeDistance(lng: number, lat: number, ring: [number, number][]) {
  const kx = mPerDegLng(lat);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lng) * kx, ay = (ring[j][1] - lat) * M_PER_DEG_LAT;
    const bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * M_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const DIRS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
function direction(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const dx = (to.lng - from.lng) * mPerDegLng(from.lat);
  const dy = (to.lat - from.lat) * M_PER_DEG_LAT;
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return DIRS[Math.round(((deg + 360) % 360) / 45) % 8];
}

const floorsOf = (b: Building) => (b.id === "leavey" ? ["B", "1", "2"] : Array.from({ length: b.levels || 3 }, (_, i) => String(i + 1)));

export function locate(lat: number, lng: number): Spot {
  const hit = USC_BUILDINGS.find((b) => inside(lng, lat, b.ring));
  if (hit) {
    return { kind: "inside", label: `Inside ${hit.name}`, hint: null, building: hit, location: { id: hit.id, name: hit.name, lat: hit.lat, lng: hit.lng, floors: floorsOf(hit) } };
  }
  let near: Building | null = null;
  let d = Infinity;
  for (const b of USC_BUILDINGS) {
    const e = edgeDistance(lng, lat, b.ring);
    if (e < d) {
      d = e;
      near = b;
    }
  }
  const id = `spot-${Math.round(lat * 1e5)}-${Math.round(-lng * 1e5)}`;
  if (near) {
    const m = Math.max(5, Math.round(d / 5) * 5);
    const side = direction(near, { lat, lng });
    const hint = `${side[0].toUpperCase()}${side.slice(1)} side · about ${m} m from the building`;
    const name = `Near ${near.name} (${side} side)`;
    return { kind: "near", label: `Near ${near.name}`, hint, building: near, location: { id, name, lat, lng, floors: [] } };
  }
  return { kind: "campus", label: "Outdoors on campus", hint: null, building: null, location: { id, name: "Outdoors on USC campus", lat, lng, floors: [] } };
}
