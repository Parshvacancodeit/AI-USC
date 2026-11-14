"use client";
// Client-only map. Load with next/dynamic({ ssr: false }).
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { FLOOR_HEIGHT_M, LOCATIONS } from "@/lib/campus";
import { CAMPUS_RING, FOOTPRINTS } from "@/lib/campus-geo";
import type { Issue, Status } from "@/lib/types";

const HEX: Record<Status, string> = { open: "#e5372f", assigned: "#f2a20c", resolved: "#1fa65a" };
const RANK: Record<Status, number> = { open: 3, assigned: 2, resolved: 1 };
const CAMERA = { pitch: 55, bearing: -17 };

type Props = {
  issues: Issue[];
  onSelect: (issue: Issue) => void;
  onBuilding: (id: string) => void;
  focusId?: string | null;
  focusBuilding?: string | null;
};

function scaleRing(ring: [number, number][], k: number): [number, number][] {
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

function campusBounds(): [[number, number], [number, number]] {
  const xs = LOCATIONS.map((l) => l.lng);
  const ys = LOCATIONS.map((l) => l.lat);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/** One translucent slab per floor; the worst open issue on a floor colors it. */
function floorSlabs(issues: Issue[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  LOCATIONS.forEach((loc) => {
    const ring = FOOTPRINTS[loc.id];
    if (!ring) return;
    const slab = scaleRing(ring, 1.06);
    loc.floors.forEach((f, i) => {
      const worst = issues
        .filter((x) => x.location_id === loc.id && x.floor === f && x.status !== "resolved")
        .sort((a, b) => RANK[b.status] - RANK[a.status])[0];
      features.push({
        type: "Feature",
        properties: {
          base: i * FLOOR_HEIGHT_M + 0.4,
          top: i * FLOOR_HEIGHT_M + FLOOR_HEIGHT_M * 0.72,
          color: worst ? HEX[worst.status] : "#ffffff",
        },
        geometry: { type: "Polygon", coordinates: [slab] },
      });
    });
  });
  return { type: "FeatureCollection", features };
}

function position(issue: Issue, idx: number): [number, number] {
  const loc = LOCATIONS.find((l) => l.id === issue.location_id) ?? LOCATIONS[0];
  const a = idx * 2.4;
  const r = idx === 0 ? 0 : 0.00012 * Math.sqrt(idx);
  return [loc.lng + r * Math.cos(a), loc.lat + r * Math.sin(a)];
}
function paint(el: HTMLElement, issue: Issue) {
  const c = HEX[issue.status];
  el.classList.add("pin");
  el.classList.toggle("pin-resolved", issue.status === "resolved");
  el.innerHTML = `${issue.status === "open" ? `<div class="pin-ring" style="background:${c}"></div>` : ""}<div class="pin-dot" style="background:${c}">${issue.reporter_count}</div>`;
  el.setAttribute("aria-label", issue.title);
  el.style.zIndex = "2";
}

type SyncFn = (list: Issue[], animate: boolean) => void;

export default function CampusMap({ issues, onSelect, onBuilding, focusId, focusBuilding }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const sync = useRef<SyncFn | null>(null);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const prev = useRef(new Map<string, { status: Status; count: number }>());
  const latest = useRef(issues);
  const cbs = useRef({ onSelect, onBuilding });
  cbs.current = { onSelect, onBuilding };
  latest.current = issues;

  useEffect(() => {
    if (!box.current) return;
    const [[w, s], [e, n]] = campusBounds();
    const m = new maplibregl.Map({
      container: box.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [(w + e) / 2, (s + n) / 2],
      zoom: 13.2,
      pitch: 0,
      bearing: -70,
      attributionControl: { compact: true },
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);

    const wave = (at: maplibregl.LngLat, color: string) => {
      const el = document.createElement("div");
      el.className = "wave";
      el.style.setProperty("--c", color);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(m);
      setTimeout(() => mk.remove(), 2400);
    };

    const syncPins: SyncFn = (list, animate) => {
      const seen = new Set<string>();
      const perLoc: Record<string, number> = {};
      list.forEach((issue) => {
        seen.add(issue.id);
        const idx = (perLoc[issue.location_id] = (perLoc[issue.location_id] ?? -1) + 1);
        const before = prev.current.get(issue.id);
        prev.current.set(issue.id, { status: issue.status, count: issue.reporter_count });
        let mk = markers.current.get(issue.id);
        if (!mk) {
          const el = document.createElement("div");
          if (animate) el.classList.add("pin-drop");
          mk = new maplibregl.Marker({ element: el }).setLngLat(position(issue, idx)).addTo(m);
          markers.current.set(issue.id, mk);
        }
        paint(mk.getElement(), issue);
        mk.getElement().onclick = (ev) => {
          ev.stopPropagation();
          cbs.current.onSelect(issue);
        };
        if (!animate) return;
        if (!before || issue.reporter_count > before.count) wave(mk.getLngLat(), HEX.open);
        else if (before.status !== issue.status) wave(mk.getLngLat(), HEX[issue.status]);
      });
      markers.current.forEach((mk, id) => {
        if (!seen.has(id)) {
          mk.remove();
          markers.current.delete(id);
        }
      });
    };

    m.on("load", () => {
      // Dim everything outside USC
      const world: [number, number][] = [
        [-180, -85],
        [180, -85],
        [180, 85],
        [-180, 85],
        [-180, -85],
      ];
      m.addSource("outside", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, CAMPUS_RING] } } });
      m.addLayer({ id: "outside-dim", type: "fill", source: "outside", paint: { "fill-color": "#1a0606", "fill-opacity": 0.42 } });
      m.addSource("campus", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: CAMPUS_RING } } });
      m.addLayer({ id: "campus-glow", type: "line", source: "campus", paint: { "line-color": "#FFCC00", "line-width": 9, "line-blur": 6, "line-opacity": 0.55 } });
      m.addLayer({ id: "campus-edge", type: "line", source: "campus", paint: { "line-color": "#990000", "line-width": 2.5 } });

      if (m.getLayer("building-3d")) m.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.75);

      // X-ray floors
      m.addSource("floors", { type: "geojson", data: floorSlabs(latest.current) });
      m.addLayer({
        id: "floors",
        type: "fill-extrusion",
        source: "floors",
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-height": ["get", "top"],
          "fill-extrusion-opacity": 0.82,
        },
      });

      LOCATIONS.forEach((l) => {
        const el = document.createElement("button");
        el.className = "bldg-tag";
        el.textContent = l.name;
        el.style.zIndex = "1";
        el.onclick = (ev) => {
          ev.stopPropagation();
          cbs.current.onBuilding(l.id);
        };
        new maplibregl.Marker({ element: el, offset: [0, 24] }).setLngLat([l.lng, l.lat]).addTo(m);
      });

      sync.current = syncPins;
      syncPins(latest.current, false);

      // Intro: sweep down onto campus
      const cam = m.cameraForBounds(campusBounds(), { padding: { top: 150, bottom: 190, left: 40, right: 40 }, ...CAMERA });
      if (cam) m.flyTo({ ...cam, ...CAMERA, duration: 2600, essential: true, curve: 1.3 });
    });

    const ms = markers.current;
    return () => {
      ro.disconnect();
      ms.clear();
      sync.current = null;
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !sync.current) return;
    sync.current(issues, true);
    (m.getSource("floors") as maplibregl.GeoJSONSource | undefined)?.setData(floorSlabs(issues));
  }, [issues]);

  useEffect(() => {
    const mk = focusId && markers.current.get(focusId);
    if (mk && map.current) map.current.flyTo({ center: mk.getLngLat(), zoom: 17.6, pitch: 60, duration: 1400, essential: true });
  }, [focusId]);

  useEffect(() => {
    const loc = LOCATIONS.find((l) => l.id === focusBuilding);
    const m = map.current;
    if (loc && m) m.flyTo({ center: [loc.lng, loc.lat - 0.0003], zoom: 18, pitch: 62, bearing: m.getBearing() + 25, duration: 1800, essential: true });
  }, [focusBuilding]);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
}
