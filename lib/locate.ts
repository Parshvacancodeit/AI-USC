// P1. GPS point → nearest named USC place. "At Leavey Library" (inside) or "Near Leavey Library" (outside).
// The report is saved on that building (not a raw GPS point), so pins and duplicates group by building.
import { USC_BUILDINGS, type Building } from "./usc-buildings";
import type { Location } from "./types";

export type Spot = {
  kind: "inside" | "near" | "off_campus";
  label: string;
  outside: boolean; // true when the photo was taken outdoors next to the building
  distance: number; // meters from the building outline (0 inside)
  location: Location;
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

/** Meters from point to a building outline. */
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

const floorsOf = (b: Building) => (b.id === "leavey" ? ["B", "1", "2"] : b.kind === "outdoor" || b.kind === "athletic" ? [] : Array.from({ length: b.levels || 3 }, (_, i) => String(i + 1)));
const toLocation = (b: Building): Location => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, floors: floorsOf(b) });

export function locate(lat: number, lng: number): Spot {
  // Inside: prefer real buildings over open areas (a building inside a quad wins)
  const hits = USC_BUILDINGS.filter((b) => inside(lng, lat, b.ring)).sort((a, b) => Number(a.kind === "outdoor") - Number(b.kind === "outdoor"));
  if (hits[0]) {
    const b = hits[0];
    return { kind: "inside", label: `At ${b.name}`, outside: b.kind === "outdoor", distance: 0, building: b, location: toLocation(b) };
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
  if (!near || d > 300) {
    return { kind: "off_campus", label: "Off campus", outside: true, distance: d, building: null, location: { id: "", name: "Off campus", lat, lng, floors: [] } };
  }
  return { kind: "near", label: `Near ${near.name}`, outside: true, distance: Math.round(d), building: near, location: toLocation(near) };
}

/** Best GPS fix within `ms`: listens to updates and keeps the most accurate one; stops early at <= `good` meters. */
export function bestFix(ms = 5000, good = 12): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    let best: { lat: number; lng: number; accuracy: number } | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      resolve(best);
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (fix.accuracy <= good) finish();
      },
      () => finish(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms },
    );
    const timer = setTimeout(finish, ms);
  });
}
