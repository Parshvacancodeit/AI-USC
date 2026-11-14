"use client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";

export default function Sheet({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title?: React.ReactNode; subtitle?: string }) {
  const [closing, setClosing] = useState(false);
  useEffect(() => haptic(), []);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };
  return (
    <div className={`fixed inset-0 z-30 mx-auto flex max-w-[480px] items-end transition-colors duration-200 ${closing ? "bg-black/0" : "bg-black/60"}`} onClick={close}>
      <div
        className={`safe-bottom w-full rounded-t-[28px] border-t hairline bg-surface px-4 pt-2 shadow-2xl transition-transform duration-200 ${closing ? "translate-y-full" : "animate-slide-up"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
        {title && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold leading-tight">{title}</h2>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
            <button onClick={close} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Close">
              <X size={16} strokeWidth={2.6} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
