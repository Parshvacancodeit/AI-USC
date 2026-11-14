import { CATEGORIES } from "@/lib/campus";
import type { Category } from "@/lib/types";

export function CategoryIcon({ category, size = 20, className = "" }: { category: Category; size?: number; className?: string }) {
  const { Icon } = CATEGORIES[category];
  return <Icon size={size} strokeWidth={2.2} className={className} />;
}

/** Ripple mark: concentric arcs, gold on cardinal. */
export function RippleLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="11" fill="url(#rg)" />
      <circle cx="20" cy="20" r="3.6" fill="#FFCC00" />
      <circle cx="20" cy="20" r="8.5" fill="none" stroke="#FFCC00" strokeWidth="2.4" opacity="0.85" />
      <circle cx="20" cy="20" r="14" fill="none" stroke="#FFCC00" strokeWidth="2" opacity="0.45" />
      <defs>
        <linearGradient id="rg" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#B3121B" />
          <stop offset="1" stopColor="#7A0000" />
        </linearGradient>
      </defs>
    </svg>
  );
}
