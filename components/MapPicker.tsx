"use client";
// Drag the map under a fixed center pin. The building under the pin highlights and the label updates live.
import maplibregl from "maplibre-gl";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { USC_CENTER } from "@/lib/campus";
import { CAMPUS_RING, VILLAGE_RING } from "@/lib/campus-geo";
import { haptic } from "@/lib/haptics";
import { locate, type Spot } from "@/lib/locate";
import { useTheme } from "@/lib/theme";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export default function MapPicker({ start, center, onChange }: { start?: { lat: number; lng: number } | null; center?: { lat: number; lng: number } | null; onChange: (s: Spot) => void }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const chipMove = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const theme = useTheme();
  const [label, setLabel] = useState(start ? "Finding building…" : "Drag the map to your building");
  const touched = useRef(!!start); // no GPS: nothing is picked until the student moves the map
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const light = theme === "light";
    const m = new maplibregl.Map({
      container: box.current,
      style: `https://tiles.openfreemap.org/styles/${light ? "liberty" : "dark"}`,
      center: start ? [start.lng, start.lat] : USC_CENTER,
      zoom: 17.3,
      minZoom: 14,
      maxBounds: [
        [USC_CENTER[0] - 0.07, USC_CENTER[1] - 0.058],
        [USC_CENTER[0] + 0.07, USC_CENTER[1] + 0.058],
      ],
      fadeDuration: 0,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = m;
    let last = "";
    const update = () => {
      const c = m.getCenter();
      const s = locate(c.lat, c.lng);
      setLabel(s.label);
      setMoving(false);
      (m.getSource("hit") as maplibregl.GeoJSONSource | undefined)?.setData(
        s.building ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [s.building.ring] } } : EMPTY,
      );
      if (s.label !== last && last) haptic();
      last = s.label;
      if (!touched.current) {
        setLabel("Drag the map to your building");
        return;
      }
      if (chipMove.current) {
        chipMove.current = false; // keep the building the student tapped
        return;
      }
      cb.current(s);
    };
    m.on("load", () => {
      m.addSource("campus", { type: "geojson", data: { type: "FeatureCollection", features: [CAMPUS_RING, VILLAGE_RING].map((r) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r } })) } });
      m.addLayer({ id: "campus", type: "line", source: "campus", paint: { "line-color": "#FFCC00", "line-width": 2, "line-opacity": 0.8 } });
      m.addSource("hit", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "hit-fill", type: "fill", source: "hit", paint: { "fill-color": "#ff2a36", "fill-opacity": 0.25 } });
      m.addLayer({ id: "hit-line", type: "line", source: "hit", paint: { "line-color": "#ff2a36", "line-width": 2.5 } });
      update();
    });
    m.on("movestart", (ev) => {
      if ((ev as { originalEvent?: Event }).originalEvent) touched.current = true;
      setMoving(true);
    });
    m.on("moveend", update);
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start only seeds the first view
  }, [theme]);

  // A building chip was tapped: glide the pin onto it
  useEffect(() => {
    if (!center || !mapRef.current) return;
    chipMove.current = true;
    touched.current = true;
    mapRef.current.easeTo({ center: [center.lng, center.lat], zoom: 17.5, duration: 600 });
  }, [center]);

  return (
    <div className="relative h-[46dvh] overflow-hidden rounded-3xl">
      <div className="absolute inset-0">
        <div ref={box} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <MapPin size={40} strokeWidth={2.2} className={`fill-cardinal text-white drop-shadow-lg transition-transform ${moving ? "-translate-y-2" : ""}`} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-3 -translate-x-1/2 rounded-full bg-black/40 blur-[1px]" />
      <div className="glass absolute inset-x-3 top-3 rounded-2xl px-3 py-2 text-center text-[13px] font-semibold">{moving ? "Release to place pin" : label}</div>
    </div>
  );
}
