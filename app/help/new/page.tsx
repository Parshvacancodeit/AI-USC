"use client";
import { Camera, MapPin, ShieldCheck, X } from "lucide-react";
import EmergencyScreen from "@/components/EmergencyScreen";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import StepHeader from "@/components/StepHeader";
import { ApiError, blurFaces, preloadFaceDetector, prepareImage } from "@/lib/api";
import { LOCATIONS, floorLabel } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { createPost, currentSpot, DPS_PHONE, HelpBlockedError, KIND } from "@/lib/help";
import { HELP_KINDS, type HelpKind, type HelpLocationInput } from "@/lib/help-types";

export default function NewHelpPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <NewHelp />
    </Suspense>
  );
}

type Place = HelpLocationInput & { floors: string[]; auto: boolean };

function NewHelp() {
  const router = useRouter();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = HELP_KINDS.includes(params.get("kind") as HelpKind) ? (params.get("kind") as HelpKind) : "ask";
  const [kind, setKind] = useState<HelpKind>(initial);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(true);
  const [picking, setPicking] = useState(false);
  const [floor, setFloor] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string; faces: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);
  const m = KIND[kind];

  useEffect(() => void preloadFaceDetector(), []);
  useEffect(() => {
    currentSpot()
      .then((s) => s && setPlace({ id: s.location.id, name: s.location.name, lat: s.location.lat, lng: s.location.lng, floors: s.location.floors ?? [], auto: true }))
      .finally(() => setLocating(false));
  }, []);

  const buildings = useMemo(() => [...LOCATIONS].filter((l) => !l.id.startsWith("spot-")).sort((a, b) => a.name.localeCompare(b.name)), []);

  async function onFile(f?: File) {
    if (!f) return;
    setBusy("Blurring faces on your phone…");
    setErr(null);
    try {
      const img = await prepareImage(f);
      const b = await blurFaces(img.dataUrl);
      setPhoto({ dataUrl: b.dataUrl, base64: b.dataUrl.split(",")[1], faces: b.facesBlurred });
    } catch {
      setErr("Couldn't read that photo. Try another one.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (!place || title.trim().length < 3) return;
    haptic("medium");
    setBusy("Checking and posting…");
    setErr(null);
    try {
      const { id } = await createPost({
        kind,
        title: title.trim(),
        body: body.trim() || undefined,
        imageBase64: photo?.base64,
        location: { id: place.id, name: place.name, lat: place.lat, lng: place.lng },
        floor: floor ?? undefined,
      });
      haptic("success");
      router.replace(`/help/${id}`);
    } catch (e) {
      if (e instanceof HelpBlockedError && e.emergency) setEmergency(true);
      else setErr(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      setBusy(null);
    }
  }

  if (emergency) return <EmergencyScreen onBack={() => setEmergency(false)} />;

  const canPost = !!place && title.trim().length >= 3 && !busy;
  return (
    <main className="min-h-dvh pb-32">
      <StepHeader title={`New ${m.noun}`} />
      <div className="space-y-4 px-4 pt-4">
        {/* Kind */}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
          {HELP_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => {
                haptic();
                setKind(k);
              }}
              className={`flex h-9 items-center justify-center gap-1 rounded-lg text-[12px] font-semibold transition ${kind === k ? "bg-surface-2 shadow" : "text-muted"}`}
              style={kind === k ? { color: KIND[k].tint } : undefined}
            >
              {KIND[k].label}
            </button>
          ))}
        </div>

        {/* Text */}
        <div className="space-y-2 rounded-2xl bg-surface p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder={m.titleHint}
            className="h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-cardinal"
            autoFocus
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 600))}
            placeholder={m.bodyHint}
            rows={3}
            className="w-full rounded-xl bg-surface-2 p-3 text-[14px] outline-none focus:ring-2 focus:ring-cardinal"
          />
        </div>

        {/* Where */}
        <div className="space-y-2 rounded-2xl bg-surface p-3">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{locating ? "Finding where you are…" : place ? place.name : "Pick a building"}</p>
              {place?.auto && <p className="text-[12px] text-muted">From your location</p>}
            </div>
            <button onClick={() => setPicking((v) => !v)} className="rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-accent">
              {picking ? "Done" : place ? "Change" : "Choose"}
            </button>
          </div>
          {picking && (
            <select
              value={place?.auto ? "" : place?.id ?? ""}
              onChange={(e) => {
                const l = buildings.find((b) => b.id === e.target.value);
                if (l) {
                  setPlace({ id: l.id, name: l.name, lat: l.lat, lng: l.lng, floors: l.floors, auto: false });
                  setFloor(null);
                  setPicking(false);
                }
              }}
              className="h-11 w-full rounded-xl bg-surface-2 px-2 text-[14px] outline-none"
            >
              <option value="">Select a building…</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {place && place.floors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {place.floors.map((f) => (
                <button
                  key={f}
                  onClick={() => setFloor(floor === f ? null : f)}
                  className={`h-8 rounded-full px-3 text-[12px] font-semibold ${floor === f ? "bg-cardinal text-white" : "bg-surface-2 text-muted"}`}
                >
                  {floorLabel(f)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Photo */}
        <div className="rounded-2xl bg-surface p-3">
          {photo ? (
            <div className="relative overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.dataUrl} alt="Your photo" className="max-h-64 w-full object-cover" />
              <button onClick={() => setPhoto(null)} className="glass absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full" aria-label="Remove photo">
                <X size={16} />
              </button>
              <p className="glass absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold">
                <ShieldCheck size={12} /> {photo.faces > 0 ? `${photo.faces} face${photo.faces > 1 ? "s" : ""} blurred` : photo.faces === 0 ? "No faces found" : "Couldn't check for faces"}
              </p>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 text-[14px] font-semibold text-muted">
              <Camera size={18} /> Add a photo (optional)
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        <p className="px-1 text-[12px] leading-snug text-muted">{m.tip} Posts are checked by AI for safety. Not for emergencies: call DPS {DPS_PHONE}.</p>
        {err && <p className="rounded-xl bg-open/10 p-3 text-[13px] font-medium text-open">{err}</p>}
      </div>

      <div className="glass-strong fixed inset-x-0 bottom-0 mx-auto max-w-[480px] p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          onClick={submit}
          disabled={!canPost}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: m.tint }}
        >
          {busy ?? `Post ${m.noun}`}
        </button>
      </div>
    </main>
  );
}
