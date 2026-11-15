"use client";
// Full-screen building picker: search every named USC place, or tap one near you.
import { ChevronLeft, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { haptic } from "@/lib/haptics";
import { bestFix, nearestPlaces } from "@/lib/locate";
import { USC_BUILDINGS } from "@/lib/usc-buildings";

export type PickedPlace = { id: string; name: string; lat: number; lng: number };

export default function BuildingPicker({ onPick, onClose, title = "Where?" }: { onPick: (p: PickedPlace) => void; onClose: () => void; title?: string }) {
  const [q, setQ] = useState("");
  const [near, setNear] = useState<PickedPlace[] | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    bestFix(5000, 25).then((f) => {
      setLocating(false);
      if (!f) return setNear([]);
      setNear(nearestPlaces(f.lat, f.lng, 6, Math.max(250, f.accuracy + 150)).map((s) => ({ id: s.location.id, name: s.location.name, lat: s.location.lat, lng: s.location.lng })));
    });
  }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return USC_BUILDINGS.filter((b) => b.name.toLowerCase().includes(t)).slice(0, 30);
  }, [q]);

  const pick = (p: PickedPlace) => {
    haptic();
    onPick(p);
  };

  return (
    <div className="fixed inset-0 z-[70] mx-auto flex max-w-[480px] flex-col bg-canvas animate-slide-up">
      <header className="flex items-center gap-2 border-b hairline px-2 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center text-accent" aria-label="Back">
          <ChevronLeft size={26} />
        </button>
        <h2 className="text-[17px] font-bold">{title}</h2>
      </header>
      <div className="px-4 pt-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3">
          <Search size={17} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buildings, e.g. Leavey, Village" className="flex-1 bg-transparent text-[16px] outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-2">
        {q.trim() ? (
          results.length ? (
            results.map((b) => <Row key={b.id} name={b.name} onClick={() => pick({ id: b.id, name: b.name, lat: b.lat, lng: b.lng })} />)
          ) : (
            <p className="py-10 text-center text-sm text-muted">No building matches &ldquo;{q}&rdquo;.</p>
          )
        ) : (
          <>
            <p className="mb-1 mt-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
              <LocateFixed size={13} /> Near you
            </p>
            {locating && <p className="py-3 text-sm text-muted">Finding where you are…</p>}
            {near?.length === 0 && <p className="py-3 text-sm text-muted">Location is off. Search for the building instead.</p>}
            {near?.map((p) => <Row key={p.id} name={p.name} onClick={() => pick(p)} />)}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="press flex w-full items-center gap-3 border-b hairline py-3.5 text-left">
      <MapPin size={18} className="shrink-0 text-accent" />
      <span className="text-[15px] font-medium">{name}</span>
    </button>
  );
}
