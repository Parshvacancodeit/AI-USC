"use client";
import { Camera, Check, MapPin, Phone, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/Icon";
const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false, loading: () => <div className="shimmer h-[46dvh] rounded-3xl" /> });
import { haptic } from "@/lib/haptics";
import { readPhotoGps } from "@/lib/exif-gps";
import { locate, type Spot } from "@/lib/locate";
import dynamic from "next/dynamic";
import StepHeader from "@/components/StepHeader";
import { ApiError, analyze, blurFaces, findDuplicates, preloadFaceDetector, prepareImage, submitReport } from "@/lib/api";
import { CATEGORIES, PRIORITIES, categoryIds } from "@/lib/campus";
import { loadCatalog } from "@/lib/api";
import type { AnalyzeResult, Category, DuplicateMatch, Priority } from "@/lib/types";

type Step = "capture" | "privacy" | "location" | "details" | "duplicate" | "done";
const ORDER: Step[] = ["capture", "privacy", "location", "details", "duplicate"];
const TITLES: Record<Step, string> = {
  capture: "Report a problem",
  privacy: "Privacy check",
  location: "Where is it?",
  details: "What's wrong?",
  duplicate: "Already reported?",
  done: "Reported",
};

type Form = { category: Category; title: string; description: string; priority: Priority };

export default function ReportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("capture");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [faces, setFaces] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null);
  const [newType, setNewType] = useState<{ id: string; label: string } | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [autoLoc, setAutoLoc] = useState(false);
  const fix = useRef<Promise<{ lat: number; lng: number } | null> | null>(null);
  const detecting = useRef<Promise<Spot | null>>(Promise.resolve(null));
  const [floor, setFloor] = useState<string | null>(null);
  const [ai, setAi] = useState<AnalyzeResult | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [form, setForm] = useState<Form>({ category: "broken_equipment", title: "", description: "", priority: "medium" });
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [result, setResult] = useState<{ issueId: string; count: number; joined: boolean } | null>(null);

  const loc = spot?.location ?? null;
  useEffect(() => void loadCatalog().catch(() => {}), []);
  useEffect(() => void preloadFaceDetector(), []);

  // Ask for the phone's position the moment the camera opens (runs while the photo is taken)
  function openCamera() {
    fix.current ??= new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
    fileRef.current?.click();
  }

  /** Photo GPS first, then phone GPS → "Inside X" or "40 m north of X". Off campus → map picker. */
  async function detectBuilding(file: File): Promise<Spot | null> {
    const fromPhoto = await readPhotoGps(file);
    const pos = fromPhoto ?? (await Promise.race([fix.current ?? Promise.resolve(null), new Promise<null>((r) => setTimeout(() => r(null), 6000))]));
    if (!pos) return null;
    setGpsPos(pos);
    const onCampus = pos.lat > 34.012 && pos.lat < 34.03 && pos.lng > -118.3 && pos.lng < -118.275;
    if (!onCampus) {
      setGpsNote("You seem to be off campus. Drop the pin where the problem is.");
      return null;
    }
    const s = locate(pos.lat, pos.lng);
    setSpot(s);
    setAutoLoc(true);
    setGpsNote(fromPhoto ? "From your photo's location" : "From your phone's location");
    return s;
  }

  async function afterPrivacy() {
    if (!spot) setBusy("Finding where you are…");
    const s = spot ?? (await detecting.current);
    setBusy(null);
    if (s) toDetails(s);
    else toLocation();
  }

  // 1 → 2: capture, compress, blur (building detection runs in parallel)
  async function onFile(file?: File) {
    if (!file) return;
    haptic("medium");
    setErr(null);
    setStep("privacy");
    setBusy("Blurring faces on your phone…");
    setSpot(null);
    setFloor(null);
    setNewType(null);
    setAutoLoc(false);
    setAi(null);
    setAiFailed(false);
    detecting.current = detectBuilding(file);
    try {
      const img = await prepareImage(file);
      const blurred = await blurFaces(img.dataUrl);
      setPhoto({ dataUrl: blurred.dataUrl, base64: blurred.dataUrl.split(",")[1] });
      setFaces(blurred.facesBlurred);
    } catch {
      setErr("Couldn't read that photo. Try again.");
      setStep("capture");
    } finally {
      setBusy(null);
    }
  }

  // 2 → 3: locate via GPS
  function toLocation() {
    setPicked(spot);
    setStep("location");
  }

  // 3 → 4: AI suggestion (never blocks: falls back to manual form)
  async function toDetails(s?: Spot) {
    const l = (s ?? spot)?.location;
    if (!l || !photo) return;
    setStep("details");
    if (ai || aiFailed) return; // already analyzed (e.g. came back from "Change")
    setBusy("Ripple AI is reading the photo…");
    setAiFailed(false);
    try {
      const res = await Promise.race([
        analyze({ imageBase64: photo.base64, mimeType: "image/jpeg", locationName: l.name, floor: floor ?? undefined }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 9000)),
      ]);
      setAi(res);
      if (!res.is_issue) setAiFailed(true);
      setNewType(res.suggested_new_category ?? null);
      setForm({ category: res.suggested_new_category?.id ?? res.category, title: res.is_issue ? res.title : "", description: res.is_issue ? res.description : "", priority: res.priority });
    } catch {
      setAi(null);
      setAiFailed(true);
    } finally {
      setBusy(null);
    }
  }

  // 4 → 5: duplicate check
  async function toDuplicate() {
    if (!loc || !photo) return;
    setStep("duplicate");
    setBusy("Checking if other Trojans already reported this…");
    try {
      const m = await findDuplicates({ imageBase64: photo.base64, mimeType: "image/jpeg", locationId: loc.id, category: form.category });
      setBusy(null);
      if (m.length) setMatches(m);
      else await submit(null);
    } catch {
      setBusy(null);
      await submit(null);
    }
  }

  async function submit(existingIssueId: string | null) {
    if (!loc || !photo) return;
    setBusy("Sending your report…");
    setErr(null);
    const common = { imageBase64: photo.base64, aiSuggestion: ai ?? undefined, aiUsed: !!ai && !aiFailed };
    try {
      const out = existingIssueId
        ? await submitReport({ ...common, existingIssueId })
        : await submitReport({
            ...common,
            newIssue: { locationId: loc.id, location: loc, categoryLabel: newType?.id === form.category ? newType.label : undefined, floor: floor ?? undefined, category: form.category, title: form.title.trim(), description: form.description.trim() || undefined, priority: form.priority },
          });
      setResult({ issueId: out.issueId, count: out.reporterCount, joined: !!existingIssueId });
      haptic("success");
      setStep("done");
    } catch (e) {
      haptic("warning");
      setErr(e instanceof ApiError && e.status === 409 ? "You already reported this one. We'll tell you when it's fixed." : `Couldn't send: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function back() {
    const i = ORDER.indexOf(step);
    if (i <= 0 || step === "done") return router.push("/");
    setErr(null);
    setMatches([]);
    setStep(ORDER[i - 1]);
  }

  const stepNo = ORDER.indexOf(step) + 1;

  return (
    <main className="flex min-h-dvh flex-col">
      {step !== "done" && <StepHeader title={TITLES[step]} step={stepNo} total={ORDER.length} onBack={back} />}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />

      <div key={step} className="flex-1 px-4 py-4 animate-fade-up">
        {err && <p className="mb-3 rounded-xl bg-open/15 p-3 text-sm text-open">{err}</p>}

        {/* 1. Capture */}
        {step === "capture" && (
          <div className="flex h-full flex-col items-center justify-center gap-6 pt-10 text-center">
            <button onClick={openCamera} className="relative grid h-40 w-40 place-items-center rounded-full bg-gradient-to-b from-[#b3121b] to-cardinal-dark text-white shadow-2xl shadow-cardinal/40 ring-4 ring-gold/70 ring-offset-4 ring-offset-canvas transition active:scale-95" aria-label="Take a photo">
              <span className="pin-ring !bg-cardinal/25" />
              <Camera size={58} strokeWidth={1.8} />
            </button>
            <div>
              <p className="text-2xl font-bold">Snap the problem</p>
              <p className="mt-1 text-[15px] text-muted">Broken elevator, dead printer, leaking ceiling.<br />One photo is all it takes.</p>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 text-xs">
              {categoryIds().slice(0, 3).map((id) => CATEGORIES[id]).map((c) => (
                <div key={c.label} className="rounded-2xl bg-surface p-3">
                  <c.Icon size={20} className="mx-auto text-accent" />
                  <p className="mt-1 font-semibold">{c.label}</p>
                </div>
              ))}
            </div>
            <a href="tel:+12137404321" className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-xs text-muted ">
              <Phone size={14} className="text-open" /> Emergency? Don&apos;t report here. <b className="text-accent">Call DPS</b>
            </a>
          </div>
        )}

        {/* 2. Privacy */}
        {step === "privacy" && (
          <div className="space-y-4">
            <PhotoFrame src={photo?.dataUrl} scanning={!!busy} />
            {busy ? (
              <p className="text-center text-sm text-muted">{busy}</p>
            ) : (
              <>
                <div className="flex gap-3 rounded-2xl bg-surface p-4">
                  <ShieldCheck size={28} className="shrink-0 text-resolved" />
                  <div>
                    <p className="font-semibold">Faces blurred on your phone before upload</p>
                    <p className="text-sm text-muted">{faces > 0 ? `${faces} face${faces > 1 ? "s" : ""} blurred. ` : faces < 0 ? "Couldn't run the face check on this device. " : "No faces in this photo. "}The original photo never leaves your device.</p>
                  </div>
                </div>
                <Actions secondary={{ label: "Retake", onClick: openCamera }} primary={{ label: "Looks good", onClick: afterPrivacy }} />
              </>
            )}
          </div>
        )}

        {/* 3. Location */}
        {step === "location" && (
          <div className="space-y-4">
            {gpsNote && !spot && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <MapPin size={15} className="text-accent" /> {gpsNote}
              </p>
            )}
            <MapPicker start={spot?.location ?? gpsPos} onChange={setPicked} />
            <p className="text-center text-xs text-muted">Works anywhere on campus: inside a building, or outdoors near one.</p>
            <Actions
              primary={{
                label: "Use this spot",
                disabled: !picked,
                onClick: () => {
                  if (!picked) return;
                  setSpot(picked);
                  setAutoLoc(false);
                  setFloor(null);
                  toDetails(picked);
                },
              }}
            />
          </div>
        )}

        {/* 4. Details */}
        {step === "details" && (
          <div className="space-y-4">
            {busy ? (
              <>
                <PhotoFrame src={photo?.dataUrl} scanning />
                <p className="text-center text-sm text-muted">{busy}</p>
              </>
            ) : (
              <>
                {loc && (
                  <div className="rounded-2xl bg-surface p-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cardinal text-gold">
                        <MapPin size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{spot?.label ?? loc.name}</p>
                        <p className="truncate text-xs text-muted">{spot?.hint ? `${spot.hint} · ` : ""}{autoLoc ? gpsNote : "Pinned on the map"}</p>
                      </div>
                      <button onClick={() => { haptic(); toLocation(); }} className="h-9 rounded-full bg-surface-2 px-3 text-xs font-semibold text-accent">
                        Adjust
                      </button>
                    </div>
                    {loc.floors.length > 0 && <div className="mt-3 flex items-center gap-1.5 overflow-x-auto">
                      <span className="mr-1 text-xs font-semibold text-muted">Floor</span>
                      {loc.floors.map((f) => (
                        <button key={f} onClick={() => { haptic(); setFloor(floor === f ? null : f); }} className={`h-9 min-w-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${floor === f ? "bg-cardinal text-white" : "bg-surface-2"}`}>
                          {f}
                        </button>
                      ))}
                    </div>}
                  </div>
                )}
                {aiFailed ? (
                  <p className="rounded-xl bg-gold/15 p-3 text-gold text-sm">AI couldn&apos;t tell what&apos;s wrong. Pick a category and add a short title.</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span className="flex items-center gap-1 rounded-full bg-cardinal px-2 py-0.5 text-[11px] font-semibold text-white"><Sparkles size={11} /> AI</span>
                    Suggested from your photo · edit anything
                  </p>
                )}
                <Field label="Category">
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                    {[...(newType ? [newType.id] : []), ...categoryIds().filter((c) => c !== newType?.id)].map((c) => (
                      <button
                        key={c}
                        onClick={() => { haptic(); setForm({ ...form, category: c }); }}
                        className={`flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-xl border-2 bg-surface px-1 py-2 text-[11px] font-semibold transition ${form.category === c ? "border-cardinal" : "border-transparent"}`}
                      >
                        <CategoryIcon category={c} size={20} className="text-accent" />
                        <span className="w-full truncate text-center">{newType?.id === c ? newType.label : CATEGORIES[c].label}</span>
                        {newType?.id === c && <span className="rounded bg-gold/20 px-1 text-[9px] font-bold uppercase text-gold">New</span>}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Title">
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Elevator out of service" maxLength={80} className="h-12 w-full rounded-xl bg-surface px-3 text-[15px] outline-none focus:ring-2 focus:ring-cardinal" />
                </Field>
                <Field label="Details (optional)">
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-xl bg-surface p-3 text-[15px] outline-none focus:ring-2 focus:ring-cardinal" />
                </Field>
                <Field label="Priority">
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-line p-1">
                    {PRIORITIES.map((p) => (
                      <button key={p} onClick={() => setForm({ ...form, priority: p })} className={`h-9 rounded-lg text-xs font-semibold capitalize transition ${form.priority === p ? "bg-surface shadow" : "text-muted"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </Field>
                <p className="text-xs text-muted">→ Goes to <b>{CATEGORIES[form.category].team}</b></p>
                <Actions primary={{ label: "Continue", onClick: toDuplicate, disabled: form.title.trim().length < 3 }} />
              </>
            )}
          </div>
        )}

        {/* 5. Duplicate */}
        {step === "duplicate" && (
          <div className="space-y-4">
            {busy ? (
              <div className="flex flex-col items-center gap-3 pt-16 text-center">
                <div className="relative h-20 w-20">
                  <span className="pin-ring !bg-cardinal/30" />
                  <div className="absolute inset-4 grid place-items-center rounded-full bg-cardinal text-white"><Search size={20} /></div>
                </div>
                <p className="text-sm text-muted">{busy}</p>
              </div>
            ) : (
              <>
                <p className="text-[15px]">Looks like other Trojans already reported this. Is it the same problem?</p>
                {matches.map((m) => (
                  <div key={m.issue_id} className="space-y-3 rounded-2xl bg-surface p-3">
                    <div className="flex gap-3">
                      {m.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photo_url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                      ) : (
                        <div className="grid h-20 w-20 place-items-center rounded-xl bg-gradient-to-br from-cardinal to-cardinal-dark text-gold"><CategoryIcon category={form.category} size={30} /></div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold">{m.title}</p>
                        <p className="flex items-center gap-1 text-xs text-muted"><Users size={12} /> {m.reporter_count} students reported</p>
                        <p className="mt-1 flex items-start gap-1 text-xs text-muted"><Sparkles size={12} className="mt-0.5 shrink-0 text-accent" /> {m.reason}</p>
                      </div>
                    </div>
                    <button onClick={() => submit(m.issue_id)} className="h-12 w-full rounded-xl bg-cardinal font-semibold text-white active:scale-[0.98] transition">
                      Yes, same issue (+1)
                    </button>
                  </div>
                ))}
                <button onClick={() => submit(null)} className="h-12 w-full rounded-xl bg-surface font-semibold">
                  No, it&apos;s new
                </button>
              </>
            )}
          </div>
        )}

        {/* Done */}
        {step === "done" && result && (
          <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-4 text-center">
            <div className="relative grid h-28 w-28 place-items-center">
              <span className="pin-ring !bg-resolved/40" />
              <div className="grid h-24 w-24 place-items-center rounded-full bg-resolved text-white"><Check size={52} strokeWidth={3} /></div>
            </div>
            <p className="text-2xl font-bold">Reported. Fight On!</p>
            <span className="animate-fade-up rounded-full bg-gradient-to-r from-gold to-[#e08a00] px-4 py-1.5 text-sm font-extrabold text-black shadow-lg" style={{ animationDelay: "250ms" }}>
              +{result.joined ? 5 : 10} karma
            </span>
            <p className="text-[15px] text-muted">
              {result.joined ? `You're Trojan #${result.count} to report this. ` : ""}
              You&apos;ll get an update here when it&apos;s fixed.
            </p>
            <div className="w-full rounded-2xl bg-surface p-4 text-left text-sm">
              <p className="text-muted">Routed to</p>
              <p className="font-semibold">{CATEGORIES[form.category].team}</p>
            </div>
            <div className="w-full space-y-2">
              <Link href="/" className="flex h-14 items-center justify-center rounded-2xl bg-cardinal text-[17px] font-semibold text-white">
                See it on the map
              </Link>
              <Link href={`/issue/${result.issueId}`} className="flex h-12 items-center justify-center rounded-2xl bg-surface font-semibold">
                Track this report
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function PhotoFrame({ src, scanning }: { src?: string; scanning?: boolean }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-ink">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="Your photo" className="h-full w-full object-cover" />}
      {scanning && <div className="scan-line" />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

type Btn = { label: string; onClick: () => void; disabled?: boolean };
function Actions({ primary, secondary }: { primary: Btn; secondary?: Btn }) {
  return (
    <div className="flex gap-2 pt-2">
      {secondary && (
        <button onClick={() => { haptic(); secondary.onClick(); }} className="h-14 flex-1 rounded-2xl bg-surface text-[16px] font-semibold">
          {secondary.label}
        </button>
      )}
      <button onClick={() => { haptic("medium"); primary.onClick(); }} disabled={primary.disabled} className="h-14 flex-[2] rounded-2xl bg-cardinal text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40">
        {primary.label}
      </button>
    </div>
  );
}
