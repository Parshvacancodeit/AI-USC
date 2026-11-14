"use client";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";

export default function StepHeader({ title, step, total, onBack }: { title: string; step?: number; total?: number; onBack?: () => void }) {
  const router = useRouter();
  return (
    <header className="glass sticky top-0 z-20 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
      <div className="flex h-12 items-center">
        <button
          onClick={() => {
            haptic();
            (onBack ?? (() => router.back()))();
          }}
          className="grid h-11 w-11 place-items-center text-cardinal"
          aria-label="Back"
        >
          <ChevronLeft size={26} strokeWidth={2.4} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold">{title}</h1>
        <span className="w-11 text-center text-xs font-medium text-muted">{step && total ? `${step}/${total}` : ""}</span>
      </div>
      {step && total ? (
        <div className="mx-2 mb-2 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-gradient-to-r from-cardinal to-[#d4202a] transition-all duration-500" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      ) : null}
    </header>
  );
}
