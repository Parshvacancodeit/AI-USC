"use client";
import { BadgeCheck, BatteryCharging, Bell, BellRing, Footprints, MessageCircleQuestion, Moon, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import LargeTitle from "@/components/LargeTitle";
import TabBar from "@/components/TabBar";
import { haptic } from "@/lib/haptics";

type Feature = {
  id: string;
  name: string;
  tagline: string;
  Icon: typeof Sparkles;
  tint: string;
  preview: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "ask",
    name: "Ask",
    tagline: "Ask a place. Trojans who are there answer with a photo.",
    Icon: MessageCircleQuestion,
    tint: "#0a84ff",
    preview: (
      <div className="space-y-2">
        <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-[#0a84ff] px-3 py-2 text-[13px]">How packed is Leavey 2nd floor right now?</div>
        <div className="flex w-fit max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md bg-surface-2 p-2 text-[13px]">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3a3a48] to-[#22222a]" />
          <span>
            Half full, plenty of outlets
            <span className="block text-[11px] text-muted">Answered by a Trojan · 2 min ago</span>
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "favors",
    name: "Favors",
    tagline: "Small help between nearby students. Earn karma for every assist.",
    Icon: BatteryCharging,
    tint: "#30d158",
    preview: (
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#30d158]/15 text-[#30d158]">
          <BatteryCharging size={18} />
        </div>
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold">Need a USB-C charger</p>
          <p className="text-muted">SAL · 2nd floor · 80 m away</p>
        </div>
        <span className="rounded-full bg-gold/15 px-2 py-1 text-[11px] font-bold text-gold">+15</span>
      </div>
    ),
  },
  {
    id: "lantern",
    name: "Lantern",
    tagline: "Walk together after night classes. Never walk home alone.",
    Icon: Footprints,
    tint: "#ffb020",
    preview: (
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <Moon size={18} className="text-[#ffb020]" />
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold">3 Trojans walking to Parkside</p>
          <p className="text-muted">Leaving Ginsburg · 9:40 PM</p>
        </div>
        <span className="flex -space-x-2">
          {["#ff453a", "#ffcc00", "#0a84ff"].map((c) => (
            <span key={c} className="h-6 w-6 rounded-full border-2 border-surface-2" style={{ background: c }} />
          ))}
        </span>
      </div>
    ),
  },
  {
    id: "pass",
    name: "Trojan Pass",
    tagline: "Verified USC identity, karma and badges. Trust built in.",
    Icon: BadgeCheck,
    tint: "#ffcc00",
    preview: (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cardinal via-[#5a0008] to-black p-3">
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full border-8 border-gold/20" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">Trojan Pass</p>
            <p className="mt-1 text-[15px] font-bold">Tommy Trojan</p>
            <p className="text-[11px] text-white/60">Verified student · 340 karma</p>
          </div>
          <div className="flex gap-1">
            {["Fixer", "Helper", "Night Owl"].map((b) => (
              <span key={b} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold">
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
];

export default function Help() {
  const [subs, setSubs] = useState<string[]>([]);
  useEffect(() => {
    try {
      setSubs(JSON.parse(localStorage.getItem("help-notify") ?? "[]"));
    } catch {}
  }, []);
  const toggle = (id: string) => {
    haptic("medium");
    const next = subs.includes(id) ? subs.filter((s) => s !== id) : [...subs, id];
    setSubs(next);
    localStorage.setItem("help-notify", JSON.stringify(next));
  };

  return (
    <main className="pb-tabbar min-h-dvh">
      <LargeTitle title="Help SC" subtitle="Trojans helping Trojans" />
      <div className="space-y-4 px-4">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gold via-[#ffb800] to-[#e08a00] p-5 text-black animate-fade-up">
          <Sparkles className="absolute -bottom-3 -right-3 opacity-20" size={96} />
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em]">Coming next</p>
          <p className="mt-1 max-w-[260px] text-[22px] font-extrabold leading-tight">Ripple is how USC fixes itself. Help SC is how it looks out for itself.</p>
          <p className="mt-2 text-sm font-medium text-black/70">Tap the bell on what you want first. The most-wanted ships first.</p>
        </section>

        {FEATURES.map((f, n) => {
          const on = subs.includes(f.id);
          return (
            <section key={f.id} className="rounded-3xl bg-surface p-4 animate-fade-up" style={{ animationDelay: `${(n + 1) * 70}ms` }}>
              <div className="mb-3 flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: `${f.tint}26`, color: f.tint }}>
                  <f.Icon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[17px] font-bold">{f.name}</p>
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Soon</span>
                  </div>
                  <p className="text-[13px] leading-snug text-muted">{f.tagline}</p>
                </div>
                <button
                  onClick={() => toggle(f.id)}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${on ? "bg-gold text-black" : "bg-surface-2 text-muted"}`}
                  aria-label={on ? `Stop notifying about ${f.name}` : `Notify me about ${f.name}`}
                >
                  {on ? <BellRing size={17} /> : <Bell size={17} />}
                </button>
              </div>
              <div className="pointer-events-none select-none opacity-90">{f.preview}</div>
            </section>
          );
        })}
        <p className="pb-2 text-center text-xs text-muted">Previews. These features aren&apos;t live yet.</p>
      </div>
      <TabBar />
    </main>
  );
}
