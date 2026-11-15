import { CATEGORIES } from "@/lib/campus";
import type { Category } from "@/lib/types";

export function CategoryIcon({ category, size = 20, className = "" }: { category: Category; size?: number; className?: string }) {
  const { Icon } = CATEGORIES[category];
  return <Icon size={size} strokeWidth={2.2} className={className} />;
}

/** Ripple mark: a gold drop sending cardinal ripples — USC colors, no USC marks. */
export function RippleLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#990000" />
      <path d="M8 27c3.5-3 7-3 10.5 0s7 3 10.5 0" fill="none" stroke="#FFCC00" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
      <path d="M8 31.5c3.5-3 7-3 10.5 0s7 3 10.5 0" fill="none" stroke="#FFCC00" strokeWidth="2.6" strokeLinecap="round" opacity="0.3" />
      <path d="M20 7.5c3.6 4.6 5.4 8 5.4 10.4a5.4 5.4 0 1 1-10.8 0c0-2.4 1.8-5.8 5.4-10.4z" fill="#FFCC00" />
    </svg>
  );
}

/** "ripple" wordmark with the Trojan gold dot. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline text-[22px] font-black lowercase leading-none tracking-[-0.04em] ${className}`}>
      ripple<span className="ml-[2px] inline-block h-[7px] w-[7px] rounded-full bg-gold" />
    </span>
  );
}
