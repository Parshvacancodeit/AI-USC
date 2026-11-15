"use client";
import { Camera, HandHelping, Map, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";

const TABS = [
  { href: "/", label: "Map", Icon: Map, match: (p: string) => p === "/" },
  { href: "/ask", label: "Ask SC", Icon: MessageCircle, match: (p: string) => p.startsWith("/ask") || p.startsWith("/help") },
  null,
  { href: "/favors", label: "Favors", Icon: HandHelping, match: (p: string) => p.startsWith("/favors") },
  { href: "/me", label: "Me", Icon: UserRound, match: (p: string) => p.startsWith("/me") },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="panel-bar fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-[60px] grid-cols-5 items-center">
        {TABS.map((t) =>
          t ? (
            <Link key={t.href} href={t.href} onClick={() => haptic()} className={`press flex flex-col items-center gap-0.5 text-[10px] font-semibold ${t.match(path) ? "text-accent" : "text-muted"}`}>
              <t.Icon size={22} strokeWidth={t.match(path) ? 2.4 : 1.9} />
              {t.label}
              <span className="tab-dot" style={{ transform: t.match(path) ? "scale(1)" : "scale(0)" }} />
            </Link>
          ) : (
            <Link key="report" href="/report" onClick={() => haptic("medium")} className="flex justify-center" aria-label="Report a problem">
              <span className="press -mt-6 grid h-[58px] w-[58px] place-items-center rounded-full bg-cardinal text-white shadow-[0_8px_24px_rgba(153,0,0,0.35)] ring-[3px] ring-gold">
                <Camera size={25} strokeWidth={2.2} />
              </span>
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
