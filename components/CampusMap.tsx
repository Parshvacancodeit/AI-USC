"use client";
// Client-only map. Load with next/dynamic({ ssr: false }).
// Pins and labels are GL layers (drawn by the map itself), so they never drift while zooming or tilting.
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { FLOOR_HEIGHT_M, USC_CENTER, getLocation } from "@/lib/campus";
import { CAMPUS_RING } from "@/lib/campus-geo";
import type { Theme } from "@/lib/theme";
import type { Issue, Status } from "@/lib/types";
import { USC_BUILDINGS } from "@/lib/usc-buildings";

const HEX: Record<Status, string> = { open: "#ff453a", assigned: "#ffb020", resolved: "#30d158" };
const RANK: Record<Status, number> = { open: 3, assigned: 2, resolved: 1 };
const CAMERA = { pitch: 45, bearing: -17 };
// USC + ~4 miles each way
const BOUNDS: [[number, number], [number, number]] = [
  [USC_CENTER[0] - 0.07, USC_CENTER[1] - 0.058],
  [USC_CENTER[0] + 0.07, USC_CENTER[1] + 0.058],
];
const FONT = ["Noto Sans Bold"];

type Props = {
  issues: Issue[];
  onSelect: (issue: Issue) => void;
  onBuilding: (id: string) => void;
  focusId?: string | null;
  focusBuilding?: string | null;
  theme?: Theme;
};

function scaleRing(ring: [number, number][], k: number): [number, number][] {
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

function campusBounds(): [[number, number], [number, number]] {
  const xs = CAMPUS_RING.map((p) => p[0]);
  const ys = CAMPUS_RING.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

function floorSlabs(issues: Issue[], slab: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  new Set(issues.filter((x) => x.status !== "resolved").map((x) => x.location_id)).forEach((id) => {
    const loc = getLocation(id);
    const ring = USC_BUILDINGS.find((b) => b.id === id)?.ring;
    if (!loc || !ring || loc.floors.length === 0) return;
    const r = scaleRing(ring, 1.04);
    loc.floors.forEach((f, i) => {
      const worst = issues.filter((x) => x.location_id === id && x.floor === f && x.status !== "resolved").sort((a, b) => RANK[b.status] - RANK[a.status])[0];
      features.push({
        type: "Feature",
        properties: { base: i * FLOOR_HEIGHT_M + 0.4, top: i * FLOOR_HEIGHT_M + FLOOR_HEIGHT_M * 0.72, color: worst ? HEX[worst.status] : slab },
        geometry: { type: "Polygon", coordinates: [r] },
      });
    });
  });
  return { type: "FeatureCollection", features };
}

/** Pin position: the location, with several issues at one building fanned out slightly. */
function positions(issues: Issue[]) {
  const perLoc: Record<string, number> = {};
  return issues.map((issue) => {
    const idx = (perLoc[issue.location_id] = (perLoc[issue.location_id] ?? -1) + 1);
    const loc = getLocation(issue.location_id);
    const [lng, lat] = loc ? [loc.lng, loc.lat] : USC_CENTER;
    const a = idx * 2.4;
    const r = idx === 0 ? 0 : 0.00009 * Math.sqrt(idx);
    return { issue, at: [lng + r * Math.cos(a), lat + r * Math.sin(a)] as [number, number] };
  });
}

function pinData(issues: Issue[], focusId: string | null | undefined): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: positions(issues).map(({ issue, at }) => ({
      type: "Feature",
      properties: { id: issue.id, color: HEX[issue.status], count: issue.reporter_count, open: issue.status === "open", resolved: issue.status === "resolved", active: issue.id === focusId },
      geometry: { type: "Point", coordinates: at },
    })),
  };
}

function labelData(issues: Issue[]): GeoJSON.FeatureCollection {
  const ids = new Set(issues.map((i) => i.location_id).filter((id) => USC_BUILDINGS.some((b) => b.id === id)));
  return {
    type: "FeatureCollection",
    features: [...ids].flatMap((id) => {
      const l = getLocation(id);
      return l ? [{ type: "Feature" as const, properties: { id, name: l.name }, geometry: { type: "Point" as const, coordinates: [l.lng, l.lat] } }] : [];
    }),
  };
}

export default function CampusMap({ issues, onSelect, onBuilding, focusId, focusBuilding, theme = "light" }: Props) {
  const light = theme === "light";
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const prev = useRef(new Map<string, { status: Status; count: number }>());
  const latest = useRef({ issues, focusId });
  const cbs = useRef({ onSelect, onBuilding });
  cbs.current = { onSelect, onBuilding };
  latest.current = { issues, focusId };
  const slab = light ? "#ffffff" : "#d9d9e3";

  useEffect(() => {
    if (!box.current) return;
    const [[w, s], [e, n]] = campusBounds();
    const m = new maplibregl.Map({
      container: box.current,
      style: `https://tiles.openfreemap.org/styles/${light ? "liberty" : "dark"}`,
      center: [(w + e) / 2, (s + n) / 2],
      zoom: 15.4,
      ...CAMERA,
      minZoom: 12.5,
      maxZoom: 19,
      maxPitch: 60,
      maxBounds: BOUNDS,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    let raf = 0;

    m.on("load", () => {
      const world: [number, number][] = [
        [-180, -85],
        [180, -85],
        [180, 85],
        [-180, 85],
        [-180, -85],
      ];
      m.addSource("outside", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, CAMPUS_RING] } } });
      m.addLayer({ id: "outside-dim", type: "fill", source: "outside", paint: { "fill-color": light ? "#2a0a0a" : "#000000", "fill-opacity": light ? 0.3 : 0.55 } });
      m.addSource("campus", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: CAMPUS_RING } } });
      m.addLayer({ id: "campus-glow", type: "line", source: "campus", paint: { "line-color": "#ff2a36", "line-width": 10, "line-blur": 8, "line-opacity": 0.45 } });
      m.addLayer({ id: "campus-edge", type: "line", source: "campus", paint: { "line-color": "#FFCC00", "line-width": 1.6 } });

      // 3D buildings only when zoomed into campus (cheap at city zoom)
      ["building", "building-3d"].forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", "none"));
      m.addLayer({
        id: "buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": light ? "#dedad5" : "#23232c",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.9,
        },
      });

      m.addSource("floors", { type: "geojson", data: floorSlabs(latest.current.issues, slab) });
      m.addLayer({
        id: "floors",
        type: "fill-extrusion",
        source: "floors",
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.88 },
      });

      // Building names for places with reports
      m.addSource("labels", { type: "geojson", data: labelData(latest.current.issues) });
      m.addLayer({
        id: "labels",
        type: "symbol",
        source: "labels",
        layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.9], "text-anchor": "top", "text-max-width": 10 },
        paint: { "text-color": light ? "#7a0000" : "#ffffff", "text-halo-color": light ? "#ffffff" : "#000000", "text-halo-width": 1.6 },
      });

      // Pins
      m.addSource("pins", { type: "geojson", data: pinData(latest.current.issues, latest.current.focusId) });
      m.addLayer({
        id: "pin-pulse",
        type: "circle",
        source: "pins",
        filter: ["==", ["get", "open"], true],
        paint: { "circle-color": ["get", "color"], "circle-radius": 12, "circle-opacity": 0.4, "circle-pitch-alignment": "viewport" },
      });
      m.addLayer({
        id: "pin-dot",
        type: "circle",
        source: "pins",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["case", ["get", "active"], 15, 11],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-opacity": ["case", ["get", "resolved"], 0.55, 1],
          "circle-stroke-opacity": ["case", ["get", "resolved"], 0.55, 1],
          "circle-pitch-alignment": "viewport",
        },
      });
      m.addLayer({
        id: "pin-count",
        type: "symbol",
        source: "pins",
        layout: { "text-field": ["to-string", ["get", "count"]], "text-font": FONT, "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": "#ffffff" },
      });

      const pick = (ev: maplibregl.MapLayerMouseEvent) => {
        const id = ev.features?.[0]?.properties?.id as string | undefined;
        const issue = latest.current.issues.find((i) => i.id === id);
        if (issue) cbs.current.onSelect(issue);
      };
      m.on("click", "pin-dot", pick);
      m.on("click", "labels", (ev) => {
        const id = ev.features?.[0]?.properties?.id as string | undefined;
        if (id) cbs.current.onBuilding(id);
      });
      ["pin-dot", "labels"].forEach((l) => {
        m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
      });

      // One light pulse animation for all open pins (~30 fps)
      let last = 0;
      const tick = (t: number) => {
        raf = requestAnimationFrame(tick);
        if (t - last < 33 || document.hidden) return;
        last = t;
        const p = (t % 1800) / 1800;
        m.setPaintProperty("pin-pulse", "circle-radius", 12 + p * 18);
        m.setPaintProperty("pin-pulse", "circle-opacity", 0.45 * (1 - p));
      };
      raf = requestAnimationFrame(tick);

      latest.current.issues.forEach((i) => prev.current.set(i.id, { status: i.status, count: i.reporter_count }));
      ready.current = true;

      // Quick settle onto campus (first visit only)
      let seen = false;
      try {
        seen = sessionStorage.getItem("ripple-intro") === "1";
        sessionStorage.setItem("ripple-intro", "1");
      } catch {}
      const cam = m.cameraForBounds(campusBounds(), { padding: { top: 140, bottom: 300, left: 30, right: 30 }, ...CAMERA });
      if (cam && seen) m.jumpTo({ ...cam, ...CAMERA });
      else if (cam) m.easeTo({ ...cam, ...CAMERA, duration: 1200 });
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ready.current = false;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map remounts per theme via key
  }, []);

  // Live updates
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("pins") as maplibregl.GeoJSONSource).setData(pinData(issues, focusId));
    (m.getSource("labels") as maplibregl.GeoJSONSource).setData(labelData(issues));
    (m.getSource("floors") as maplibregl.GeoJSONSource).setData(floorSlabs(issues, slab));
    // Ripple wave on new report (+1) or status change
    positions(issues).forEach(({ issue, at }) => {
      const before = prev.current.get(issue.id);
      prev.current.set(issue.id, { status: issue.status, count: issue.reporter_count });
      const color = !before || issue.reporter_count > before.count ? HEX.open : before.status !== issue.status ? HEX[issue.status] : null;
      if (!color) return;
      const el = document.createElement("div");
      el.className = "wave";
      el.style.setProperty("--c", color);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(m);
      setTimeout(() => mk.remove(), 2200);
    });
  }, [issues, focusId, slab]);

  useEffect(() => {
    const m = map.current;
    if (!m || !focusId) return;
    const hit = positions(latest.current.issues).find((p) => p.issue.id === focusId);
    if (hit) m.easeTo({ center: hit.at, zoom: Math.max(m.getZoom(), 17), duration: 700, offset: [0, 60] });
  }, [focusId]);

  useEffect(() => {
    const m = map.current;
    const loc = focusBuilding ? getLocation(focusBuilding) : null;
    if (m && loc) m.easeTo({ center: [loc.lng, loc.lat], zoom: 17.8, pitch: 55, duration: 900 });
  }, [focusBuilding]);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
}

