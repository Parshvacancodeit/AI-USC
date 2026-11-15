"use client";
// Help SC: one screen. Ask (live campus feed), Favors, Lost & Found — each its own feed, one composer at the bottom.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Composer from "@/components/help/Composer";
import FeedRow from "@/components/help/FeedRow";
import LargeTitle from "@/components/LargeTitle";
import TabBar from "@/components/TabBar";
import { haptic } from "@/lib/haptics";
import { SECTION_ORDER, SECTIONS, type SectionId } from "@/lib/help";
import { useHelpFeed } from "@/lib/use-help";

const EMPTY: Record<SectionId, { title: string; line: string }> = {
  ask: { title: "Nothing yet", line: "Share what's happening, or ask anything about a place on campus." },
  favors: { title: "No open favors", line: "Need a charger, an umbrella, or a hand with something? Ask below." },
  "lost-found": { title: "Nothing lost or found", line: "Post an item below. Hand valuables to the front desk or DPS." },
};

export default function HelpSC() {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>("ask");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s") as SectionId | null;
    if (s && s in SECTIONS) setSection(s);
  }, []);
  const feed = useHelpFeed(section);

  function pick(s: SectionId) {
    haptic();
    setSection(s);
    window.history.replaceState(null, "", s === "ask" ? "/help" : `/help?s=${s}`);
  }

  return (
    <main className="min-h-dvh" style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom) + 160px)" }}>
      <LargeTitle title="Help SC" subtitle="Live from Trojans on campus" />

      <div className="sticky top-0 z-10 bg-canvas/85 px-4 pb-3 pt-1 backdrop-blur-xl">
        <div className="grid grid-cols-3 rounded-[10px] bg-surface-2 p-0.5" role="tablist">
          {SECTION_ORDER.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={section === id}
              onClick={() => pick(id)}
              className={`h-8 rounded-[8px] text-[13px] font-semibold transition ${section === id ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
            >
              {SECTIONS[id].title}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        {feed.demo && <p className="mb-3 text-center text-[12px] text-muted">Sample posts. Live posting starts once Help SC is connected.</p>}

        {feed.loading ? (
          <div className="overflow-hidden rounded-2xl bg-surface">
            {[0, 1, 2].map((n) => (
              <div key={n} className="space-y-2 border-t hairline p-4 first:border-t-0">
                <div className="shimmer h-4 w-4/5 rounded" />
                <div className="shimmer h-3 w-2/5 rounded" />
              </div>
            ))}
          </div>
        ) : feed.error ? (
          <p className="py-16 text-center text-[15px] text-muted">Couldn&apos;t load. Check your connection.</p>
        ) : feed.rows.length === 0 ? (
          <div className="py-16 text-center animate-fade-up">
            <p className="text-[17px] font-semibold">{EMPTY[section].title}</p>
            <p className="mx-auto mt-1 max-w-[280px] text-[15px] text-muted">{EMPTY[section].line}</p>
          </div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface animate-fade-up">
            {feed.rows.map((r) => (
              <FeedRow key={r.post.id} row={r} fresh={feed.fresh === r.post.id} />
            ))}
          </div>
        )}
      </div>

      <Composer mode="post" section={section} aboveTabBar onPosted={(id) => router.push(`/help/post/${id}`)} />
      <TabBar />
    </main>
  );
}
