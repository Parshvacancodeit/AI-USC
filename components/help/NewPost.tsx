"use client";
// Full-screen composer for Ask SC / Favors.
// Audience: All of USC (campus-wide) or one building. Shows similar live posts while typing, quick-start ideas,
// photo (faces blurred on device), rules and how long the post stays live.
import { Building2, Camera, ChevronRight, Clock, Globe2, Loader2, MapPin, MessageCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import EmergencyScreen from "@/components/EmergencyScreen";
import BuildingPicker, { type PickedPlace } from "@/components/help/BuildingPicker";
import { ApiError, blurFaces, prepareImage } from "@/lib/api";
import { timeAgo } from "@/lib/campus";
import { haptic } from "@/lib/haptics";
import { ALL_USC, createPost, currentSpot, HelpBlockedError, shortPlace, similarPosts } from "@/lib/help";
import { EXPIRY_HOURS, type HelpKind, type HelpPost } from "@/lib/help-types";

const COPY: Record<"ask" | "favor", { title: string; ph: string; detail: string; ideas: string[]; similar: string }> = {
  ask: {
    title: "Ask SC",
    ph: "What do you want to know?",
    detail: "Add context so Trojans can answer faster (optional)",
    ideas: ["How busy is Leavey right now?", "Any quiet study spots open?", "Is the Village Trader Joe's line long?", "Which dining hall has the best food today?", "Is the Lyon Center crowded?"],
    similar: "Already asked?",
  },
  favor: {
    title: "Ask for a favor",
    ph: "What do you need a hand with?",
    detail: "When and where, and anything that helps (optional)",
    ideas: ["Need a USB-C charger for 20 min", "Can someone lend a calculator?", "Need help carrying boxes", "Anyone have an umbrella to share?", "Need a study partner for CSCI 104"],
    similar: "Someone may already be asking",
  },
};

type Audience = "all" | "building";

export default function NewPost({ kind, existing = [], onClose, onPosted }: { kind: Extract<HelpKind, "ask" | "favor">; existing?: HelpPost[]; onClose: () => void; onPosted: (id: string) => void }) {
  const c = COPY[kind];
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [audience, setAudience] = useState<Audience>("all");
  const [building, setBuilding] = useState<PickedPlace | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);

  // Suggest the building you're in (used only if you switch to "At a building")
  useEffect(() => {
    currentSpot().then((s) => s && setBuilding((cur) => cur ?? { id: s.location.id, name: s.location.name, lat: s.location.lat, lng: s.location.lng }));
  }, []);

  const similar = useMemo(() => (title.trim().length >= 6 ? similarPosts(`${title} ${body}`, existing, kind) : []), [title, body, existing, kind]);
  const place = audience === "all" ? ALL_USC : building;

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
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const ready = title.trim().length >= 3 && !!place && !busy;
  async function submit() {
    if (!ready) {
      if (audience === "building" && !building) setPicking(true);
      return;
    }
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
      <div className="cardinal-bar h-[3px]" />
      <header className="flex items-center justify-between px-3 pb-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center text-muted" aria-label="Cancel">
          <X size={22} />
        </button>
        <h2 className="text-[17px] font-bold">{c.title}</h2>
        <button onClick={submit} disabled={!ready} className="press h-9 min-w-[64px] rounded-full bg-cardinal px-4 text-[14px] font-semibold text-white disabled:opacity-35">
          {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Post"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Audience */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(
            [
              ["all", "All of USC", Globe2],
              ["building", "At a building", Building2],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => {
                haptic();
                setAudience(v);
                if (v === "building" && !building) setPicking(true);
              }}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-[14px] font-semibold transition ${audience === v ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        {audience === "building" && (
          <button onClick={() => setPicking(true)} className="press mt-2 flex w-full items-center gap-2 rounded-xl border hairline px-3 py-2.5 text-left">
            <MapPin size={16} className="text-accent" />
            <span className={`flex-1 truncate text-[14px] ${building ? "font-semibold" : "text-muted"}`}>{building ? building.name : "Choose a building"}</span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        )}
        <p className="mt-2 text-[12px] text-muted">{audience === "all" ? "Every Trojan on campus can see and answer this." : "Shown to everyone, pinned to this building."}</p>

        {err && <p className="mt-3 rounded-lg bg-open/10 px-3 py-2 text-[13px] text-open">{err}</p>}

        {/* Question */}
        <div className="relative mt-4">
          <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.ph} maxLength={120} rows={2} className="w-full resize-none bg-transparent text-[22px] font-bold leading-snug tracking-tight outline-none placeholder:text-muted/60" />
          <span className={`absolute bottom-1 right-0 text-[11px] tabular-nums ${title.length > 100 ? "text-accent" : "text-muted/70"}`}>{title.length}/120</span>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={c.detail} maxLength={600} rows={3} className="mt-1 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted/60" />

        {/* Quick start */}
        {!title && (
          <div className="mt-2">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
              <Sparkles size={13} className="text-gold" /> Quick start
            </p>
            <div className="flex flex-wrap gap-2">
              {c.ideas.map((i) => (
                <button
                  key={i}
                  onClick={() => {
                    haptic();
                    setTitle(i);
                  }}
                  className="press rounded-full border hairline px-3 py-1.5 text-[13px]"
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Similar live posts */}
        {similar.length > 0 && (
          <div className="mt-4 border-l-2 border-gold pl-3 rise">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">{c.similar}</p>
            {similar.map((p) => (
              <Link
                key={p.id}
                href={`/help/post/${p.id}`}
                onClick={(e) => {
                  e.preventDefault(); // navigate first; closing the sheet first would cancel the tap
                  haptic();
                  router.push(`/help/post/${p.id}`);
                }}
                className="block py-2"
              >
                <p className="text-[15px] font-semibold leading-snug">{p.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                  <MessageCircle size={12} /> {p.reply_count} · {shortPlace(p.location_name)} · {timeAgo(p.created_at)}
                </p>
              </Link>
            ))}
          </div>
        )}

        {/* Photo */}
        {photo && (
          <div className="relative mt-4 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt="Attached" className="max-h-60 rounded-2xl object-cover" />
            <button onClick={() => setPhoto(null)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t hairline px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="press flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 text-[13px] font-semibold">
            <Camera size={15} /> {photo ? "Change photo" : "Add photo"}
          </button>
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Clock size={12} /> Live for {EXPIRY_HOURS[kind]} hours
          </span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
          <ShieldCheck size={13} className="mt-px shrink-0 text-resolved" />
          Faces are blurred on your phone. Be kind, no posts about people. Emergency? Call DPS at 213-740-4321.
        </p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {picking && (
        <BuildingPicker
          onClose={() => {
            setPicking(false);
            if (!building) setAudience("all");
          }}
          onPick={(p) => {
            setBuilding(p);
            setAudience("building");
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
