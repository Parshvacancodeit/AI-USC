"use client";
// Pick where a post is about: your current spot, or any campus building.
import { Check, LocateFixed, Search } from "lucide-react";
import { useMemo, useState } from "react";
import Sheet from "@/components/Sheet";
import { LOCATIONS } from "@/lib/campus";
import type { HelpLocationInput } from "@/lib/help-types";

export default function PlaceSheet({ here, value, onPick, onClose }: { here: HelpLocationInput | null; value: HelpLocationInput | null; onPick: (p: HelpLocationInput) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return LOCATIONS.filter((l) => !l.id.startsWith("spot-") && (!s || l.name.toLowerCase().includes(s)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [q]);
  const Row = ({ p, icon }: { p: HelpLocationInput; icon?: React.ReactNode }) => (
    <button onClick={() => onPick(p)} className="flex min-h-12 w-full items-center gap-3 px-1 text-left text-[16px]">
      {icon}
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      {value?.id === p.id && <Check size={18} className="shrink-0 text-accent" />}
    </button>
  );
  return (
    <Sheet onClose={onClose} title="Where?">
      <label className="relative mb-2 block">
        <Search size={16} className="absolute left-3 top-3 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buildings" className="h-10 w-full rounded-xl bg-surface-2 pl-9 pr-3 text-[16px] outline-none" />
      </label>
      <div className="max-h-[55dvh] divide-y divide-line overflow-y-auto pb-4">
        {here && !q && <Row p={here} icon={<LocateFixed size={18} className="shrink-0 text-accent" />} />}
        {list.map((l) => (
          <Row key={l.id} p={{ id: l.id, name: l.name, lat: l.lat, lng: l.lng }} />
        ))}
      </div>
    </Sheet>
  );
}
