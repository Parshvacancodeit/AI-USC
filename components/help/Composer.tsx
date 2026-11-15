"use client";
// The one input for Help SC, pinned to the bottom like Messages: new posts on the feed, replies in a thread.
import { ArrowUp, Camera, ChevronDown, Loader2, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import EmergencyScreen from "@/components/EmergencyScreen";
import PlaceSheet from "@/components/help/PlaceSheet";
import { ApiError, blurFaces, prepareImage } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { createPost, createReply, currentSpot, HelpBlockedError, KIND, SECTIONS, shortPlace, type SectionId } from "@/lib/help";
import type { HelpKind, HelpLocationInput, HelpPost } from "@/lib/help-types";

type Props =
  | { mode: "post"; section: SectionId; aboveTabBar?: boolean; onPosted: (id: string) => void }
  | { mode: "reply"; post: HelpPost; onSent: (id: string, body: string | null) => void };

const PLACEHOLDER: Record<SectionId, string> = {
  ask: "Ask or share what's happening…",
  favors: "What do you need a hand with?",
  "lost-found": "What did you lose or find?",
};

export default function Composer(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [here, setHere] = useState<HelpLocationInput | null>(null);
  const [place, setPlace] = useState<HelpLocationInput | null>(null);
  const [picking, setPicking] = useState(false);
  const [lf, setLf] = useState<"lost" | "found">("lost");
  const isPost = props.mode === "post";

  useEffect(() => {
    if (!isPost) return;
    currentSpot().then((s) => {
      if (!s) return;
      const p = { id: s.location.id, name: s.location.name, lat: s.location.lat, lng: s.location.lng };
      setHere(p);
      setPlace((cur) => cur ?? p);
    });
  }, [isPost]);

  async function onFile(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const img = await prepareImage(f);
      const b = await blurFaces(img.dataUrl); // faces blurred on the phone, before upload
      setPhoto({ dataUrl: b.dataUrl, base64: b.dataUrl.split(",")[1] });
    } catch {
      setErr("Couldn't use that photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const kind: HelpKind = isPost ? (props.section === "lost-found" ? lf : SECTIONS[props.section].newKind) : props.post.kind;
  const ready = !busy && (isPost ? text.trim().length >= 3 && !!place : !!text.trim() || !!photo);

  async function send() {
    if (!ready) {
      if (isPost && !place) setPicking(true);
      return;
    }
    haptic("medium");
    setBusy(true);
    setErr(null);
    const body = text.trim();
    try {
      if (props.mode === "post") {
        const { id } = await createPost({ kind, title: body.slice(0, 120), imageBase64: photo?.base64, location: place! });
        props.onPosted(id);
      } else {
        const { id } = await createReply({ postId: props.post.id, body: body || undefined, imageBase64: photo?.base64 });
        props.onSent(id, body || null);
      }
      haptic("success");
      setText("");
      setPhoto(null);
    } catch (e) {
      if (e instanceof HelpBlockedError && e.emergency) setEmergency(true);
      else setErr(e instanceof ApiError ? e.message : "Couldn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (emergency) return <div className="fixed inset-0 z-50"><EmergencyScreen onBack={() => setEmergency(false)} /></div>;

  return (
    <>
      <div
        className={
          isPost && props.aboveTabBar
            ? "glass-strong fixed inset-x-3 z-30 mx-auto max-w-[456px] rounded-[24px] border hairline p-2 shadow-lg"
            : "glass-strong fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t hairline px-3 pt-2"
        }
        style={isPost && props.aboveTabBar ? { bottom: "calc(64px + env(safe-area-inset-bottom) + 38px)" } : { bottom: 0, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      >
        {err && <p className="mb-2 rounded-lg bg-open/10 px-3 py-2 text-[13px] text-open">{err}</p>}

        {isPost && (
          <div className="mb-2 flex items-center gap-2">
            <button onClick={() => setPicking(true)} className="flex h-8 min-w-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-[13px] font-medium">
              <MapPin size={13} className="shrink-0 text-accent" />
              <span className="truncate">{place ? shortPlace(place.name) : "Add place"}</span>
              <ChevronDown size={13} className="shrink-0 text-muted" />
            </button>
            {props.section === "lost-found" && (
              <div className="flex h-8 shrink-0 rounded-full bg-surface-2 p-0.5">
                {(["lost", "found"] as const).map((k) => (
                  <button key={k} onClick={() => setLf(k)} className={`rounded-full px-3 text-[13px] font-semibold ${lf === k ? "bg-surface shadow" : "text-muted"}`} style={lf === k ? { color: KIND[k].tint } : undefined}>
                    {KIND[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {photo && (
          <div className="relative mb-2 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt="Attached photo" className="h-16 rounded-xl object-cover" />
            <button onClick={() => setPhoto(null)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-surface-2 shadow" aria-label="Remove photo">
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition active:bg-surface-2" aria-label="Add photo">
            <Camera size={22} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, isPost ? 120 : 400))}
            placeholder={isPost ? PLACEHOLDER[props.section] : props.post.kind === "ask" ? "Reply…" : KIND[props.post.kind].replyHint}
            rows={1}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-[20px] border hairline bg-surface px-4 py-2 text-[16px] leading-6 outline-none placeholder:text-muted"
          />
          <button
            onClick={send}
            disabled={!ready && !(isPost && !place && text.trim())}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white transition active:scale-90 disabled:bg-surface-2 disabled:text-muted"
            aria-label="Send"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={20} strokeWidth={2.6} />}
          </button>
        </div>
      </div>
      {picking && (
        <PlaceSheet
          here={here}
          value={place}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPlace(p);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
