"use client";
import { Accessibility, Bell, ChevronRight, Info, Moon, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import IssueCard from "@/components/IssueCard";
import LargeTitle from "@/components/LargeTitle";
import TabBar from "@/components/TabBar";
import { listIssues, myIssueIds } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { setTheme, useTheme } from "@/lib/theme";
import type { Issue } from "@/lib/types";

function usePref(key: string, initial: boolean) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s !== null) setV(s === "1");
    } catch {}
  }, [key]);
  return [v, (n: boolean) => (setV(n), localStorage.setItem(key, n ? "1" : "0"))] as const;
}

export default function Me() {
  const [mine, setMine] = useState<Issue[] | null>(null);
  const [access, setAccess] = usePref("pref-access-alerts", true);
  const [notify, setNotify] = usePref("pref-fixed-alerts", true);
  const theme = useTheme();

  useEffect(() => {
    const ids = myIssueIds();
    listIssues()
      .then((all) => setMine(all.filter((i) => ids.includes(i.id))))
      .catch(() => setMine([]));
  }, []);

  const fixed = mine?.filter((i) => i.status === "resolved").length ?? 0;
  const karma = (mine?.length ?? 0) * 10 + fixed * 25;

  return (
    <main className="pb-tabbar min-h-dvh">
      <LargeTitle title="Me" />
      <div className="space-y-6 px-4">
        {/* Profile */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5a0008] via-cardinal to-[#2a0004] p-5 animate-fade-up">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[14px] border-gold/15" />
          <div className="absolute -right-2 -top-2 h-24 w-24 rounded-full border-[10px] border-gold/20" />
          <div className="relative flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gold text-2xl font-extrabold text-cardinal-dark ring-4 ring-white/15">TT</div>
            <div>
              <p className="text-xl font-bold">Tommy Trojan</p>
              <p className="text-sm text-white/70">Demo profile · Class of &apos;27</p>
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <Stat n={mine?.length ?? 0} label="Reports" />
            <Stat n={fixed} label="Fixed" />
            <Stat n={karma} label="Karma" gold />
          </div>
        </section>

        {/* My reports */}
        <section className="animate-fade-up" style={{ animationDelay: "80ms" }}>
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">My reports</h2>
          {mine === null ? (
            <div className="shimmer h-20 rounded-2xl" />
          ) : mine.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted">No reports yet. Snap your first one and you&apos;ll be notified the moment it&apos;s fixed.</p>
          ) : (
            <div className="space-y-2">
              {mine.map((i) => (
                <IssueCard key={i.id} issue={i} />
              ))}
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="animate-fade-up" style={{ animationDelay: "160ms" }}>
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">Settings</h2>
          <div className="overflow-hidden rounded-2xl bg-surface">
            <Row icon={<Moon size={17} />} tint="#5e5ce6" label="Appearance" sub={theme === "dark" ? "Dark" : "Light"}>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      haptic();
                      setTheme(t);
                    }}
                    className={`h-7 rounded-md px-2.5 text-xs font-semibold capitalize transition ${theme === t ? "bg-surface text-ink shadow" : "text-muted"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Row>
            <Row border icon={<Accessibility size={17} />} tint="#0a84ff" label="Accessibility alerts" sub="Elevator or ramp down near you">
              <Toggle on={access} onChange={setAccess} />
            </Row>
            <Row icon={<Bell size={17} />} tint="#ff453a" label="Fixed notifications" sub="When your reports are resolved" border>
              <Toggle on={notify} onChange={setNotify} />
            </Row>
            <Row icon={<ShieldCheck size={17} />} tint="#30d158" label="Privacy" sub="Faces blurred on your phone before upload" border>
              <ChevronRight size={18} className="text-muted" />
            </Row>
            <Row icon={<Info size={17} />} tint="#8e8e98" label="About Ripple" sub="For Trojans, by Trojans" border>
              <ChevronRight size={18} className="text-muted" />
            </Row>
          </div>
          <p className="mt-4 text-center text-xs text-muted">Student-built. Reports route to official USC offices.</p>
        </section>
      </div>
      <TabBar />
    </main>
  );
}

function Stat({ n, label, gold }: { n: number; label: string; gold?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/25 px-3 py-2.5 text-center backdrop-blur">
      <p className={`text-2xl font-extrabold tabular-nums ${gold ? "text-gradient-gold" : ""}`}>{n}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">{label}</p>
    </div>
  );
}

function Row({ icon, tint, label, sub, border, children }: { icon: React.ReactNode; tint: string; label: string; sub: string; border?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-3 ${border ? "border-t hairline" : ""}`}>
      <div className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: tint }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{label}</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptic();
        onChange(!on);
      }}
      className={`relative h-[31px] w-[51px] rounded-full transition-colors ${on ? "bg-resolved" : "bg-surface-2"}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}
