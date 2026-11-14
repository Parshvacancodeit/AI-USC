"use client";
// Shown when the AI safety check says a Help SC post or reply is an emergency.
import { Phone, ShieldAlert } from "lucide-react";
import { DPS_PHONE } from "@/lib/help";

export default function EmergencyScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="w-full max-w-sm space-y-4 text-center animate-fade-up">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-open/15 text-open">
          <ShieldAlert size={32} />
        </div>
        <h1 className="text-2xl font-extrabold">This sounds like an emergency</h1>
        <p className="text-muted">Help SC isn&apos;t monitored for emergencies. Call now. USC DPS answers 24/7.</p>
        <a href="tel:2137404321" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-open text-[17px] font-bold text-white">
          <Phone size={20} /> Call USC DPS · {DPS_PHONE}
        </a>
        <a href="tel:911" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface text-[17px] font-bold">
          <Phone size={20} /> Call 911
        </a>
        <button onClick={onBack} className="h-11 text-sm font-semibold text-muted">
          Not an emergency? Go back
        </button>
      </div>
    </main>
  );
}
