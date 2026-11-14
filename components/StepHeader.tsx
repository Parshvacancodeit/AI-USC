"use client";
import { useRouter } from "next/navigation";

export default function StepHeader({ title, step, total, onBack }: { title: string; step?: number; total?: number; onBack?: () => void }) {
  const router = useRouter();
  return (
    <header className="glass sticky top-0 z-20 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
      <div className="flex h-12 items-center">
        <button onClick={onBack ?? (() => router.back())} className="grid h-11 w-11 place-items-center text-2xl text-cardinal" aria-label="Back">
          ‹
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold">{title}</h1>
        <span className="w-11 text-center text-xs text-muted">{step && total ? `${step}/${total}` : ""}</span>
      </div>
      {step && total ? (
        <div className="mx-2 mb-2 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-cardinal transition-all duration-500" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      ) : null}
    </header>
  );
}
