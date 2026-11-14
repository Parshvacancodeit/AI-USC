"use client";
import { Accessibility, Bell, ChevronRight, Crown, Info, Moon, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import IssueCard from "@/components/IssueCard";
import LargeTitle from "@/components/LargeTitle";
import TabBar from "@/components/TabBar";
import { listIssues, listReports, myIssueIds, myReporterId } from "@/lib/api";
import { POINTS, emptyBadges, handle, scoreboard, tierFor, type Player } from "@/lib/karma";
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
  const [board, setBoard] = useState<Player[] | null>(null);
  const [me, setMe] = useState<string>("");
  const [access, setAccess] = usePref("pref-access-alerts", true);
  const [notify, setNotify] = usePref("pref-fixed-alerts", true);
  const theme = useTheme();

  useEffect(() => {
    const ids = myIssueIds();
    Promise.all([listIssues(), listReports(), myReporterId().catch(() => "")])
      .then(([all, reps, id]) => {
        setMine(all.filter((i) => ids.includes(i.id)));
        setBoard(scoreboard(reps, all));
        setMe(id);
      })
      .catch(() => {
        setMine([]);
        setBoard([]);
      });
  }, []);

  const self = board?.find((p) => p.id === me) ?? null;
  const karma = self?.points ?? 0;
  const fixed = self?.fixed ?? 0;
  const rank = self && board ? board.indexOf(self) + 1 : null;
  const { tier, next, progress } = tierFor(karma);
  const badges = self?.badges ?? emptyBadges();

  return (
    <main className="pb-tabbar min-h-dvh">
      <LargeTitle title="Me" />
      <div className="space-y-6 px-4">
        {/* Profile */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5a0008] via-cardinal to-[#2a0004] p-5 animate-fade-up">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[14px] border-gold/15" />
          <div className="absolute -right-2 -top-2 h-24 w-24 rounded-full border-[10px] border-gold/20" />
          <div className="relative flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gold text-cardinal-dark ring-4 ring-white/15">
              <Crown size={30} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 text-white">
              <p className="truncate text-xl font-bold">{me ? handle(me) : "Trojan"}</p>
              <p className="text-sm text-white/70">
                <b style={{ color: tier.color === "#8e8e98" ? "#fff" : tier.color }}>{tier.name}</b>
                {rank ? ` · #${rank} on campus` : " · anonymous"}
              </p>
            </div>
          </div>
          <div className="relative mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-black/30">
              <div className="h-full rounded-full bg-gradient-to-r from-gold to-[#ffe680] transition-all duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-white/70">{next ? `${next.min - karma} karma to ${next.name}` : "Top tier reached. Fight On!"}</p>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-white">
            <Stat n={mine?.length ?? 0} label="Reports" />
            <Stat n={fixed} label="Fixed" />
            <Stat n={karma} label="Karma" gold />
          </div>
        </section>

        {/* Badges */}
        <section className="animate-fade-up" style={{ animationDelay: "60ms" }}>
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">Badges</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {badges.map((b) => (
              <div key={b.id} className={`flex w-[96px] shrink-0 flex-col items-center gap-1.5 rounded-2xl bg-surface p-3 text-center ${b.earned ? "" : "opacity-45"}`}>
                <div className={`grid h-11 w-11 place-items-center rounded-full ${b.earned ? "bg-gradient-to-br from-gold to-[#e08a00] text-black" : "bg-surface-2 text-muted"}`}>
                  <b.Icon size={20} />
                </div>
                <p className="text-[11px] font-bold leading-tight">{b.name}</p>
                <p className="text-[9px] leading-tight text-muted">{b.hint}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-muted">
            +{POINTS.first} first to report · +{POINTS.confirm} confirm · +{POINTS.fixed} when it&apos;s fixed
          </p>
        </section>

        {/* Leaderboard */}
        <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
            <Trophy size={14} className="text-gold" /> Campus leaderboard
          </h2>
          <div className="overflow-hidden rounded-2xl bg-surface">
            {board === null && <div className="shimmer h-24" />}
            {board?.length === 0 && <p className="p-4 text-sm text-muted">No reports yet. Be the first Trojan on the board.</p>}
            {board?.slice(0, 10).map((p, n) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${n ? "border-t hairline" : ""} ${p.id === me ? "bg-cardinal/15" : ""}`}>
                <span className={`w-6 text-center text-sm font-extrabold ${n === 0 ? "text-gold" : n < 3 ? "text-ink" : "text-muted"}`}>{n + 1}</span>
                <div className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: tierFor(p.points).tier.color }}>
                  {p.handle.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">
                    {p.handle} {p.id === me && <span className="text-accent">(you)</span>}
                  </p>
                  <p className="text-[11px] text-muted">
                    {tierFor(p.points).tier.name} · {p.reports} report{p.reports === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums">{p.points}</span>
              </div>
            ))}
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
