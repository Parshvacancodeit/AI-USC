"use client";
import { Activity, Camera, HandHeart, Radio, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";

const TABS = [
  { href: "/", label: "Live", Icon: Radio },
  { href: "/feed", label: "Feed", Icon: Activity },
  null,
  { href: "/help", label: "Help SC", Icon: HandHeart },
  { href: "/me", label: "Me", Icon: UserRound },
];

export default function TabBar() {
  const path = usePathname();
  const on = (href: string) => path === href || (href !== "/" && path.startsWith(`${href}/`));
  return (
    <nav className="panel-bar fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-[64px] grid-cols-5 items-center">
        {TABS.map((t) =>
          t ? (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => haptic()}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold tracking-wide transition ${on(t.href) ? "text-ink" : "text-muted"}`}
            >
              <t.Icon size={22} strokeWidth={on(t.href) ? 2.4 : 2} className={on(t.href) && t.href === "/" ? "text-accent" : ""} />
              {t.label}
            </Link>
          ) : (
            <Link key="report" href="/report" onClick={() => haptic("medium")} className="flex justify-center" aria-label="Report a problem">
              <span className="glow-cardinal -mt-7 grid h-[62px] w-[62px] place-items-center rounded-full bg-gradient-to-b from-[#e0202e] to-cardinal ring-[3px] ring-gold/80 transition active:scale-90">
                <Camera size={26} strokeWidth={2.2} className="text-white" />
              </span>
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
