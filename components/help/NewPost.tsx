"use client";
// Full-screen "new post" for Ask SC / Favors: title, details, photo (faces blurred on device), building.
import { Camera, ChevronRight, Loader2, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import EmergencyScreen from "@/components/EmergencyScreen";
import BuildingPicker, { type PickedPlace } from "@/components/help/BuildingPicker";
import { ApiError, blurFaces, prepareImage } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { createPost, currentSpot, HelpBlockedError } from "@/lib/help";
import type { HelpKind } from "@/lib/help-types";

const COPY: Record<"ask" | "favor", { title: string; ph: string; detail: string; cta: string }> = {
  ask: { title: "Ask SC", ph: "Ask something happening on campus…", detail: "Add details (optional)", cta: "Post question" },
  favor: { title: "Ask for a favor", ph: "What do you need a hand with?", detail: "When, where, anything that helps (optional)", cta: "Post favor" },
};

export default function NewPost({ kind, onClose, onPosted }: { kind: Extract<HelpKind, "ask" | "favor">; onClose: () => void; onPosted: (id: string) => void }) {
  const c = COPY[kind];
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);

  useEffect(() => {
    currentSpot().then((s) => s && setPlace((cur) => cur ?? { id: s.location.id, name: s.location.name, lat: s.location.lat, lng: s.location.lng }));
  }, []);

  async function onFile(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const img = await prepareImage(f);
      const b = await blurFaces(img.dataUrl);
      setPhoto({ dataUrl: b.dataUrl, base64: b.dataUrl.split(",")[1] });
    } catch {
      setErr("Couldn't use that photo.");
    } finally {
      setBusy(false);
    }
  }

  const ready = title.trim().length >= 3 && !!place && !busy;
  async function submit() {
    if (!ready) return;
    haptic("medium");
    setBusy(true);
    setErr(null);
    try {
      const { id } = await createPost({ kind, title: title.trim().slice(0, 120), body: body.trim() || undefined, imageBase64: photo?.base64, location: place! });
      haptic("success");
      onPosted(id);
    } catch (e) {
      if (e instanceof HelpBlockedError && e.emergency) setEmergency(true);
      else setErr(e instanceof ApiError ? e.message : "Couldn't post. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (emergency) return <div className="fixed inset-0 z-[80]"><EmergencyScreen onBack={() => setEmergency(false)} /></div>;

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-[480px] flex-col bg-canvas animate-slide-up">
      <header className="flex items-center justify-between border-b hairline px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center text-muted" aria-label="Cancel">
          <X size={22} />
        </button>
        <h2 className="text-[17px] font-bold">{c.title}</h2>
        <button onClick={submit} disabled={!ready} className="press h-9 rounded-full bg-cardinal px-4 text-[14px] font-semibold text-white disabled:opacity-35">
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Post"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4">
        {err && <p className="mt-3 rounded-lg bg-open/10 px-3 py-2 text-[13px] text-open">{err}</p>}
        <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.ph} maxLength={120} rows={2} className="mt-4 w-full resize-none bg-transparent text-[20px] font-semibold leading-snug outline-none placeholder:text-muted/70" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={c.detail} maxLength={600} rows={4} className="mt-1 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted/70" />
        {photo && (
          <div className="relative mt-2 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt="Attached" className="max-h-56 rounded-2xl object-cover" />
            <button onClick={() => setPhoto(null)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="border-t hairline px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <button onClick={() => setPicking(true)} className="press flex w-full items-center gap-3 py-2.5 text-left">
          <MapPin size={18} className="text-accent" />
          <span className={`flex-1 truncate text-[15px] ${place ? "font-semibold" : "text-muted"}`}>{place ? place.name : "Choose a building"}</span>
          <ChevronRight size={18} className="text-muted" />
        </button>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => fileRef.current?.click()} className="press flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 text-[13px] font-semibold">
            <Camera size={15} /> {photo ? "Change photo" : "Add photo"}
          </button>
          <span className="text-[11px] text-muted">Faces are blurred on your phone before upload.</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {picking && (
        <BuildingPicker
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPlace(p);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
