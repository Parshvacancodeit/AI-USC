"use client";
// Client-only map. Load with next/dynamic({ ssr: false }).
// Pins and labels are GL layers (drawn by the map itself), so they never drift while zooming or tilting.
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { FLOOR_HEIGHT_M, USC_CENTER, getLocation } from "@/lib/campus";
import { CAMPUS_RING, VILLAGE_RING } from "@/lib/campus-geo";
import type { Theme } from "@/lib/theme";
import type { Issue, Status } from "@/lib/types";
import { USC_BUILDINGS } from "@/lib/usc-buildings";
import { USC_TREES } from "@/lib/usc-trees";

const HEX: Record<Status, string> = { open: "#ff453a", assigned: "#ffb020", resolved: "#30d158", rejected: "#8e8e98" };
const RANK: Record<Status, number> = { open: 3, assigned: 2, resolved: 1, rejected: 0 };
const CAMERA = { pitch: 76, bearing: -17 };
// USC + ~4 miles each way
const BOUNDS: [[number, number], [number, number]] = [
  [USC_CENTER[0] - 0.07, USC_CENTER[1] - 0.058],
  [USC_CENTER[0] + 0.07, USC_CENTER[1] + 0.058],
];
const FONT = ["Noto Sans Bold"];


/** USC palette for the base map: brick walls, clay-tile roofs, cardinal/gold roads. */
const PAL = {
  light: { bg: "#efe8dc", wall: "#b8705a", glass: "#a9cfe0", trim: "#f1e2cc", roof: "#cf9a83", ped: "#e4c7ac", minor: "#7a7d84", mid: "#6c6f77", major: "#5f626a", casing: "#d9d4cb", line: "#ffd34d", grass: "#8fca63", park: "#9bd36f", wood: "#5c9b43", water: "#3d9be0", leaf: ["#4f9a3a", "#5fae45", "#3f8a33"], trunk: "#6b4a2f" },
  dark: { bg: "#120c0c", wall: "#3b2622", glass: "#ffcc66", trim: "#2a1a17", roof: "#4a2a24", ped: "#3a2622", minor: "#2c2c33", mid: "#34343c", major: "#3c3c45", casing: "#1a1416", line: "#ffb300", grass: "#1f3b1c", park: "#22421e", wood: "#183015", water: "#0e2c4a", leaf: ["#1f4a1c", "#275a22", "#183c16"], trunk: "#2a1c12" },
};

/** Facade tile: brick wall with two rows of glazed windows (drawn once, used as an extrusion pattern). */
function facade(p: typeof PAL.light): ImageData {
  const W = 20, H = 14, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = p.wall; g.fillRect(0, 0, W, H);
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 3; k++) {
      const x = 2 + k * 6, y = 2 + r * 7;
      g.fillStyle = p.trim; g.fillRect(x - 1, y - 1, 5, 6);
      const grad = g.createLinearGradient(x, y, x + 3, y + 4);
      grad.addColorStop(0, p.glass); grad.addColorStop(1, p.wall);
      g.fillStyle = grad; g.fillRect(x, y, 3, 4);
    }
  return g.getImageData(0, 0, W, H);
}

/** Recolor the base style: asphalt roads with sidewalks, green grass and trees, blue water. */
function paintBase(m: maplibregl.Map, p: typeof PAL.light) {
  for (const l of m.getStyle().layers ?? []) {
    const id = l.id;
    if (l.type === "background") m.setPaintProperty(id, "background-color", p.bg);
    if (l.type === "fill") {
      const c = /^water/.test(id) ? p.water : /wood|forest/.test(id) ? p.wood : /grass|pitch/.test(id) ? p.grass : /park/.test(id) ? p.park : null;
      if (c) { m.setPaintProperty(id, "fill-color", c); m.setPaintProperty(id, "fill-opacity", 1); }
    }
    if (l.type === "line" && /^waterway/.test(id)) m.setPaintProperty(id, "line-color", p.water);
    if (l.type !== "line" || !/road|highway|tunnel|bridge/.test(id) || /rail|arrow|oneway/.test(id)) continue;
    const color = /casing/.test(id) ? p.casing : /path|pedestrian/.test(id) ? p.ped : /motorway|trunk|primary|major/.test(id) ? p.major : /secondary|tertiary/.test(id) ? p.mid : p.minor;
    m.setPaintProperty(id, "line-color", color);
  }
}

/** Low-poly 3D trees: trunk + two canopy tiers, built as small octagons around each tree point. */
function octagon(lng: number, lat: number, r: number): [number, number][] {
  const kx = r / (111320 * Math.cos((lat * Math.PI) / 180)), ky = r / 110540;
  const ring: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = ((i % 8) / 8) * Math.PI * 2 + Math.PI / 8;
    ring.push([lng + Math.cos(a) * kx, lat + Math.sin(a) * ky]);
  }
  return ring;
}
function treeData(p: typeof PAL.light): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = [];
  const add = (ring: [number, number][], base: number, top: number, color: string) =>
    f.push({ type: "Feature", properties: { base, top, color }, geometry: { type: "Polygon", coordinates: [ring] } });
  USC_TREES.forEach(([lng, lat, k], i) => {
    const leaf = p.leaf[i % p.leaf.length];
    add(octagon(lng, lat, 0.35 * k), 0, 2.6 * k, p.trunk);
    add(octagon(lng, lat, 2.6 * k), 2.2 * k, 6.2 * k, leaf);
    add(octagon(lng, lat, 1.6 * k), 6.2 * k, 8.4 * k, leaf);
  });
  return { type: "FeatureCollection", features: f };
}

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
  const pts = [...CAMPUS_RING, ...VILLAGE_RING];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
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
      maxPitch: 85,
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
      m.addSource("outside", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, CAMPUS_RING, VILLAGE_RING] } } });
      m.addSource("usc-areas", { type: "geojson", data: { type: "FeatureCollection", features: [CAMPUS_RING, VILLAGE_RING].map((r) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [r] } })) } });
      m.addLayer({ id: "usc-tint", type: "fill", source: "usc-areas", paint: { "fill-color": "#990000", "fill-opacity": light ? 0.06 : 0.1 } });
      m.addLayer({ id: "outside-dim", type: "fill", source: "outside", paint: { "fill-color": light ? "#2a0a0a" : "#000000", "fill-opacity": light ? 0.3 : 0.55 } });
      m.addSource("campus", { type: "geojson", data: { type: "FeatureCollection", features: [CAMPUS_RING, VILLAGE_RING].map((r) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r } })) } });
      m.addLayer({ id: "campus-glow", type: "line", source: "campus", paint: { "line-color": light ? "#990000" : "#FFCC00", "line-width": 12, "line-blur": 9, "line-opacity": 0.5 } });
      m.addLayer({ id: "campus-edge", type: "line", source: "campus", paint: { "line-color": "#FFCC00", "line-width": 1.6 } });

      // USC look: recolored roads, brick buildings with glazed windows and clay-tile roofs, warm light
      const pal = light ? PAL.light : PAL.dark;
      paintBase(m, pal);
      m.addImage("facade", facade(pal), { pixelRatio: 1 });
      m.setLight({ anchor: "map", color: light ? "#fff1dc" : "#ffd9a8", intensity: light ? 0.38 : 0.25, position: [1.4, 210, 35] });
      // Game-style sky: blue day sky fading to a warm haze, or a cardinal night with a gold horizon
      m.setSky(light
        ? { "sky-color": "#5fa8e8", "horizon-color": "#ffe2b8", "fog-color": "#f3e3cf", "sky-horizon-blend": 0.55, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.92, "atmosphere-blend": 0.8 }
        : { "sky-color": "#07051a", "horizon-color": "#7a1c0c", "fog-color": "#1c0d0a", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.9, "atmosphere-blend": 0.6 });
      ["building", "building-3d"].forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", "none"));
      const h: maplibregl.ExpressionSpecification = ["coalesce", ["get", "render_height"], 8];
      m.addLayer({
        id: "buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 15,
        paint: {
          "fill-extrusion-pattern": "facade",
          "fill-extrusion-height": h,
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.95,
        },
      });
      m.addLayer({
        id: "roofs",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 15,
        paint: { "fill-extrusion-color": pal.roof, "fill-extrusion-base": h, "fill-extrusion-height": ["+", h, 1.2], "fill-extrusion-opacity": 0.95 },
      });

      // Yellow center lines on real streets (close zoom only)
      m.addLayer({
        id: "road-lines",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 16,
        filter: ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false],
        layout: { "line-cap": "butt" },
        paint: { "line-color": pal.line, "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.8, 19, 2.2], "line-dasharray": [4, 3], "line-opacity": 0.9 },
      }, "buildings-3d");
      // Trees
      m.addSource("trees", { type: "geojson", data: treeData(pal) });
      m.addLayer({
        id: "trees",
        type: "fill-extrusion",
        source: "trees",
        minzoom: 15,
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 1 },
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
        m.setPaintProperty("campus-glow", "line-opacity", 0.35 + 0.25 * Math.sin((t / 2600) * Math.PI * 2));
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
      // Fit campus top-down, then tilt toward the horizon so the sky shows above campus
      const fit = m.cameraForBounds(campusBounds(), { padding: { top: 140, bottom: 300, left: 30, right: 30 }, bearing: CAMERA.bearing });
      const cam = fit && { center: fit.center, zoom: (fit.zoom ?? 15.4) + 0.35, ...CAMERA };
      if (cam && seen) m.jumpTo(cam);
      else if (cam) m.easeTo({ ...cam, duration: 1200 });
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
    if (m && loc) m.easeTo({ center: [loc.lng, loc.lat], zoom: 17.8, pitch: 65, duration: 900 });
  }, [focusBuilding]);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
}

