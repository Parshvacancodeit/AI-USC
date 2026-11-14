"use client";
// Client-only map. Load with next/dynamic({ ssr: false }).
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { LOCATIONS, STATUS, USC_CENTER } from "@/lib/campus";
import type { Issue } from "@/lib/types";

type Props = { issues: Issue[]; onSelect: (issue: Issue) => void; focusId?: string | null };

// Spread pins at the same building so they don't stack.
function position(issue: Issue, idx: number): [number, number] {
  const loc = LOCATIONS.find((l) => l.id === issue.location_id) ?? LOCATIONS[0];
  const a = idx * 2.4;
  const r = idx === 0 ? 0 : 0.00012 * Math.sqrt(idx);
  return [loc.lng + r * Math.cos(a), loc.lat + r * Math.sin(a)];
}

function pinEl(issue: Issue) {
  const el = document.createElement("div");
  paint(el, issue);
  return el;
}
function paint(el: HTMLElement, issue: Issue) {
  const c = STATUS[issue.status].color;
  el.classList.add("pin");
  el.classList.toggle("pin-resolved", issue.status === "resolved");
  el.innerHTML = `${issue.status === "open" ? `<div class="pin-ring" style="background:${c}"></div>` : ""}<div class="pin-dot" style="background:${c}">${issue.reporter_count}</div>`;
  el.setAttribute("aria-label", issue.title);
  el.style.zIndex = "2";
}

export default function CampusMap({ issues, onSelect, focusId }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { m: maplibregl.Marker; status: string }>());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: USC_CENTER,
      zoom: 16.2,
      pitch: 45,
      bearing: -17,
      maxBounds: [
        [-118.305, 34.012],
        [-118.272, 34.03],
      ],
      attributionControl: { compact: true },
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    const lngs = LOCATIONS.map((l) => l.lng);
    const lats = LOCATIONS.map((l) => l.lat);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 120, bottom: 150, left: 50, right: 50 }, pitch: 45, bearing: -17, duration: 0 },
    );
    m.on("load", () => {
      LOCATIONS.forEach((l) => {
        const el = document.createElement("div");
        el.className = "rounded-full bg-white/85 px-1.5 py-px text-[9px] font-semibold text-cardinal shadow-sm";
        el.style.zIndex = "0";
        el.textContent = l.name;
        new maplibregl.Marker({ element: el, offset: [0, 22] }).setLngLat([l.lng, l.lat]).addTo(m);
      });
    });
    const ms = markers.current;
    return () => {
      ro.disconnect();
      ms.clear();
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const perLoc: Record<string, number> = {};
    issues.forEach((issue) => {
      seen.add(issue.id);
      const idx = (perLoc[issue.location_id] = (perLoc[issue.location_id] ?? -1) + 1);
      const cur = markers.current.get(issue.id);
      if (cur) {
        paint(cur.m.getElement(), issue);
        cur.m.getElement().onclick = () => selectRef.current(issue);
        return;
      }
      const el = pinEl(issue);
      el.onclick = () => selectRef.current(issue);
      markers.current.set(issue.id, { m: new maplibregl.Marker({ element: el }).setLngLat(position(issue, idx)).addTo(m), status: issue.status });
    });
    markers.current.forEach((v, id) => {
      if (!seen.has(id)) {
        v.m.remove();
        markers.current.delete(id);
      }
    });
  }, [issues]);

  useEffect(() => {
    const target = focusId && markers.current.get(focusId);
    if (target && map.current) map.current.flyTo({ center: target.m.getLngLat(), zoom: 17.5, duration: 1200 });
  }, [focusId]);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
}
