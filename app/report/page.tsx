"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import StepHeader from "@/components/StepHeader";
import { ApiError, analyze, blurFaces, findDuplicates, prepareImage, submitReport } from "@/lib/api";
import { CATEGORIES, LOCATIONS, PRIORITIES, nearestLocation } from "@/lib/campus";
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
  const [locId, setLocId] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [ai, setAi] = useState<AnalyzeResult | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [form, setForm] = useState<Form>({ category: "broken_equipment", title: "", description: "", priority: "medium" });
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [result, setResult] = useState<{ issueId: string; count: number; joined: boolean } | null>(null);

  const loc = LOCATIONS.find((l) => l.id === locId) ?? null;

  // 1 → 2: capture, compress, blur
  async function onFile(file?: File) {
    if (!file) return;
    setErr(null);
    setStep("privacy");
    setBusy("Blurring faces on your phone…");
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
    setStep("location");
    if (locId || !navigator.geolocation) return;
    setGpsNote("Finding your building…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const n = nearestLocation(p.coords.latitude, p.coords.longitude);
        setLocId((cur) => cur ?? n.id);
        setGpsNote(`Looks like you're near ${n.name}`);
      },
      () => setGpsNote("Location off. Pick your building."),
      { enableHighAccuracy: true, timeout: 6000 },
    );
  }

  // 3 → 4: AI suggestion (never blocks: falls back to manual form)
  async function toDetails() {
    if (!loc || !photo) return;
    setStep("details");
    setBusy("Ripple AI is reading the photo…");
    setAiFailed(false);
    try {
      const res = await Promise.race([
        analyze({ imageBase64: photo.base64, mimeType: "image/jpeg", locationName: loc.name, floor: floor ?? undefined }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 9000)),
      ]);
      setAi(res);
      if (!res.is_issue) setAiFailed(true);
      setForm({ category: res.category, title: res.is_issue ? res.title : "", description: res.is_issue ? res.description : "", priority: res.priority });
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
            newIssue: { locationId: loc.id, floor: floor ?? undefined, category: form.category, title: form.title.trim(), description: form.description.trim() || undefined, priority: form.priority },
          });
      setResult({ issueId: out.issueId, count: out.reporterCount, joined: !!existingIssueId });
      setStep("done");
    } catch (e) {
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

      <div className="flex-1 px-4 py-4">
        {err && <p className="mb-3 rounded-xl bg-[#fdecea] p-3 text-sm text-open">{err}</p>}

        {/* 1. Capture */}
        {step === "capture" && (
          <div className="flex h-full flex-col items-center justify-center gap-6 pt-10 text-center">
            <button onClick={() => fileRef.current?.click()} className="relative grid h-44 w-44 place-items-center rounded-full bg-cardinal text-6xl text-white shadow-2xl shadow-cardinal/40 active:scale-95 transition">
              <span className="pin-ring !bg-cardinal/40" />
              📸
            </button>
            <div>
              <p className="text-2xl font-bold">Snap the problem</p>
              <p className="mt-1 text-[15px] text-muted">Broken elevator, dead printer, leaking ceiling.<br />One photo is all it takes.</p>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 text-xs">
              {Object.values(CATEGORIES).map((c) => (
                <div key={c.label} className="rounded-2xl bg-white p-3">
                  <p className="text-xl">{c.icon}</p>
                  <p className="mt-1 font-semibold">{c.label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">🚨 Emergency? Don&apos;t report here. <a href="tel:+12137404321" className="font-semibold text-cardinal underline">Call DPS</a></p>
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
                <div className="flex gap-3 rounded-2xl bg-white p-4">
                  <span className="text-2xl">🛡️</span>
                  <div>
                    <p className="font-semibold">Faces blurred on your phone before upload</p>
                    <p className="text-sm text-muted">{faces > 0 ? `${faces} face${faces > 1 ? "s" : ""} blurred. ` : "No faces found. "}The original photo never leaves your device.</p>
                  </div>
                </div>
                <Actions secondary={{ label: "Retake", onClick: () => fileRef.current?.click() }} primary={{ label: "Looks good", onClick: toLocation }} />
              </>
            )}
          </div>
        )}

        {/* 3. Location */}
        {step === "location" && (
          <div className="space-y-4">
            {gpsNote && <p className="text-sm text-muted">📍 {gpsNote}</p>}
            <div className="space-y-2">
              {LOCATIONS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLocId(l.id);
                    setFloor(null);
                  }}
                  className={`flex h-14 w-full items-center justify-between rounded-2xl border-2 bg-white px-4 text-left text-[15px] font-semibold transition ${locId === l.id ? "border-cardinal" : "border-transparent"}`}
                >
                  {l.name}
                  {locId === l.id && <span className="text-cardinal">✓</span>}
                </button>
              ))}
            </div>
            {loc && (
              <div>
                <p className="mb-2 text-sm font-semibold text-muted">Floor</p>
                <div className="flex flex-wrap gap-2">
                  {loc.floors.map((f) => (
                    <button key={f} onClick={() => setFloor(f)} className={`h-11 min-w-11 rounded-xl px-4 font-semibold transition ${floor === f ? "bg-cardinal text-white" : "bg-white"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Actions primary={{ label: "Continue", onClick: toDetails, disabled: !loc }} />
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
                {aiFailed ? (
                  <p className="rounded-xl bg-gold/25 p-3 text-sm">AI couldn&apos;t tell what&apos;s wrong. Pick a category and add a short title.</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span className="rounded-full bg-cardinal px-2 py-0.5 text-[11px] font-semibold text-white">✨ AI</span>
                    Suggested from your photo · edit anything
                  </p>
                )}
                <Field label="Category">
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                      <button key={c} onClick={() => setForm({ ...form, category: c })} className={`rounded-xl border-2 bg-white p-2 text-xs font-semibold transition ${form.category === c ? "border-cardinal" : "border-transparent"}`}>
                        <span className="block text-lg">{CATEGORIES[c].icon}</span>
                        {CATEGORIES[c].label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Title">
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Elevator out of service" maxLength={80} className="h-12 w-full rounded-xl bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-cardinal" />
                </Field>
                <Field label="Details (optional)">
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-xl bg-white p-3 text-[15px] outline-none focus:ring-2 focus:ring-cardinal" />
                </Field>
                <Field label="Priority">
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-line p-1">
                    {PRIORITIES.map((p) => (
                      <button key={p} onClick={() => setForm({ ...form, priority: p })} className={`h-9 rounded-lg text-xs font-semibold capitalize transition ${form.priority === p ? "bg-white shadow" : "text-muted"}`}>
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
                  <div className="absolute inset-4 grid place-items-center rounded-full bg-cardinal text-white">⌁</div>
                </div>
                <p className="text-sm text-muted">{busy}</p>
              </div>
            ) : (
              <>
                <p className="text-[15px]">Looks like other Trojans already reported this. Is it the same problem?</p>
                {matches.map((m) => (
                  <div key={m.issue_id} className="space-y-3 rounded-2xl bg-white p-3">
                    <div className="flex gap-3">
                      {m.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photo_url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                      ) : (
                        <div className="grid h-20 w-20 place-items-center rounded-xl bg-canvas text-3xl">{CATEGORIES[form.category].icon}</div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold">{m.title}</p>
                        <p className="text-xs text-muted">👥 {m.reporter_count} students reported</p>
                        <p className="mt-1 text-xs text-muted">✨ {m.reason}</p>
                      </div>
                    </div>
                    <button onClick={() => submit(m.issue_id)} className="h-12 w-full rounded-xl bg-cardinal font-semibold text-white active:scale-[0.98] transition">
                      Yes, same issue (+1)
                    </button>
                  </div>
                ))}
                <button onClick={() => submit(null)} className="h-12 w-full rounded-xl bg-white font-semibold">
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
              <div className="grid h-24 w-24 place-items-center rounded-full bg-resolved text-5xl text-white">✓</div>
            </div>
            <p className="text-2xl font-bold">Reported. Fight on! ✌️</p>
            <p className="text-[15px] text-muted">
              {result.joined ? `You're Trojan #${result.count} to report this. ` : ""}
              You&apos;ll get an update here when it&apos;s fixed.
            </p>
            <div className="w-full rounded-2xl bg-white p-4 text-left text-sm">
              <p className="text-muted">Routed to</p>
              <p className="font-semibold">{CATEGORIES[form.category].team}</p>
            </div>
            <div className="w-full space-y-2">
              <Link href="/" className="flex h-14 items-center justify-center rounded-2xl bg-cardinal text-[17px] font-semibold text-white">
                See it on the map
              </Link>
              <Link href={`/issue/${result.issueId}`} className="flex h-12 items-center justify-center rounded-2xl bg-white font-semibold">
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
        <button onClick={secondary.onClick} className="h-14 flex-1 rounded-2xl bg-white text-[16px] font-semibold">
          {secondary.label}
        </button>
      )}
      <button onClick={primary.onClick} disabled={primary.disabled} className="h-14 flex-[2] rounded-2xl bg-cardinal text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40">
        {primary.label}
      </button>
    </div>
  );
}
