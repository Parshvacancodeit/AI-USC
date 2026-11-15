"use client";
// P3 — Office work-order page (from the email link). No login, mobile-first.
// 1. Acknowledge  2. Upload after photo → Claude before/after check → supervisor confirms in /admin.
import { Camera, CheckCircle2, CircleAlert, Clock, ExternalLink, Link2Off, Loader2, MapPin, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RippleLogo } from "@/components/Icon";
import { blurFaces, prepareImage } from "@/lib/api";
import { timeAgo } from "@/lib/campus";

type Verdict = { same_location: boolean; resolved: boolean; confidence: number; reason: string };
type Summary = {
  office: string;
  department: string;
  acknowledged_at: string | null;
  fix_submitted_at: string | null;
  issue: { title: string; description: string | null; priority: string; status: string; floor: string | null; location: string; map: string | null; photo_url: string | null; after_photo_url: string | null; verdict: Verdict | null };
};
const PRIORITY: Record<string, string> = { low: "#8e8e98", medium: "#0a84ff", high: "#ff9f0a", urgent: "#ff453a" };

export default function FixPage() {
  const { token } = useParams<{ token: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [fatal, setFatal] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState<"ack" | "photo" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fix/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok) return setData(j);
        setFatal(r.status === 410 ? { title: "Link expired", text: j.error } : r.status === 404 ? { title: "Link not valid", text: j.error ?? "Check that you opened the full link from the email." } : { title: "Something went wrong", text: j.error ?? "Try again in a moment." });
      })
      .catch(() => setFatal({ title: "You're offline", text: "Connect to the internet and reload this page." }));
  }, [token]);

  async function post(body: object) {
    const r = await fetch(`/api/fix/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "You're offline" };
    if (!r?.ok) throw new Error(j.error ?? "Something went wrong");
    setData(j as Summary);
  }

  async function acknowledge() {
    setBusy("ack");
    setErr(null);
    try {
      await post({ action: "acknowledge" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onPhoto(f?: File) {
    if (!f) return;
    setBusy("photo");
    setErr(null);
    try {
      const img = await prepareImage(f);
      const b = await blurFaces(img.dataUrl);
      await post({ action: "submit_fix", imageBase64: b.dataUrl.split(",")[1] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (fatal)
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-xs space-y-3">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface text-muted">
            <Link2Off size={26} />
          </div>
          <h1 className="text-[22px] font-bold">{fatal.title}</h1>
          <p className="text-[15px] text-muted">{fatal.text}</p>
        </div>
      </main>
    );

  if (!data)
    return (
      <main className="space-y-3 p-4">
        <div className="shimmer h-56 rounded-2xl" />
        <div className="shimmer h-6 w-4/5 rounded" />
        <div className="shimmer h-4 w-1/2 rounded" />
      </main>
    );

  const i = data.issue;
  const closed = i.status === "resolved" || i.status === "rejected";
  const v = i.verdict;

  return (
    <main className="min-h-dvh pb-10">
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
        <RippleLogo size={28} />
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight">Work order</p>
          <p className="truncate text-[13px] text-muted">{data.office}</p>
        </div>
      </header>

      <div className="space-y-4 px-4">
        {/* The problem */}
        <section className="overflow-hidden rounded-2xl bg-surface">
          {i.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.photo_url} alt="Reported problem" className="max-h-72 w-full object-cover" />
          )}
          <div className="space-y-2 p-4">
            <span className="inline-block rounded-full px-2 py-0.5 text-[12px] font-bold capitalize" style={{ color: PRIORITY[i.priority] ?? "#8e8e98", background: `${PRIORITY[i.priority] ?? "#8e8e98"}22` }}>
              {i.priority} priority
            </span>
            <h1 className="text-[21px] font-bold leading-snug">{i.title}</h1>
            {i.description && <p className="text-[15px] text-muted">{i.description}</p>}
            <p className="flex items-center gap-1.5 text-[14px]">
              <MapPin size={15} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">
                {i.location}
                {!i.floor ? "" : i.floor === "Outside" ? " · Outside" : i.floor === "B" ? " · Basement" : ` · Floor ${i.floor}`}
              </span>
              {i.map && (
                <a href={i.map} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-0.5 font-semibold text-accent">
                  Map <ExternalLink size={12} />
                </a>
              )}
            </p>
          </div>
        </section>

        {closed ? (
          <section className="flex items-center gap-3 rounded-2xl bg-resolved/10 p-4">
            <CheckCircle2 size={22} className="shrink-0 text-resolved" />
            <p className="text-[15px] font-semibold">{i.status === "resolved" ? "Resolved. Thank you! Students have been told it's fixed." : "This issue was closed by Ripple."}</p>
          </section>
        ) : (
          <>
            {/* Step 1 */}
            <section className="rounded-2xl bg-surface p-4">
              <p className="text-[13px] font-semibold text-muted">Step 1</p>
              {data.acknowledged_at ? (
                <p className="mt-1 flex items-center gap-2 text-[16px] font-semibold text-resolved">
                  <CheckCircle2 size={18} /> Acknowledged {timeAgo(data.acknowledged_at)}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[15px]">Let students know your team is on it.</p>
                  <button onClick={acknowledge} disabled={!!busy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cardinal text-[16px] font-semibold text-white disabled:opacity-50">
                    {busy === "ack" ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Acknowledge
                  </button>
                </>
              )}
            </section>

            {/* Step 2 */}
            <section className="rounded-2xl bg-surface p-4">
              <p className="text-[13px] font-semibold text-muted">Step 2</p>
              <p className="mt-1 text-[15px]">When it&apos;s fixed, take an after photo from the same spot.</p>
              {i.after_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.after_photo_url} alt="After" className="mt-3 max-h-64 w-full rounded-xl object-cover" />
              )}
              <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 text-[16px] font-semibold disabled:opacity-50">
                {busy === "photo" ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Checking the photo…
                  </>
                ) : (
                  <>
                    <Camera size={18} /> {i.after_photo_url ? "Retake after photo" : "Upload after photo"}
                  </>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </section>

            {v && data.fix_submitted_at && (
              <section className="space-y-2 rounded-2xl bg-surface p-4">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
                  <Sparkles size={14} /> AI before/after check
                </p>
                <p className={`flex items-center gap-2 text-[16px] font-semibold ${v.resolved ? "text-resolved" : "text-assigned"}`}>
                  {v.resolved ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
                  {v.resolved ? `Looks fixed · ${Math.round(v.confidence * 100)}%` : "Not confirmed yet"}
                </p>
                <p className="text-[14px] text-muted">{v.reason}</p>
                <p className="flex items-center gap-1.5 border-t hairline pt-2 text-[13px] text-muted">
                  <Clock size={13} /> Sent to the Ripple supervisor to confirm.
                </p>
              </section>
            )}
          </>
        )}

        {err && <p className="rounded-xl bg-open/10 p-3 text-[14px] text-open">{err}</p>}
        <p className="px-2 text-center text-[12px] text-muted">Ripple (demo) · student reports, routed to campus offices</p>
      </div>
    </main>
  );
}
