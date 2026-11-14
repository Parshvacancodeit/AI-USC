"use client";
import {
  Accessibility,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  ClipboardCopy,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryIcon, RippleLogo } from "@/components/Icon";
import { listIssues, photoUrl, prepareImage, subscribeIssues } from "@/lib/api";
import { PRIORITIES, catInfo, categoryIds, timeAgo } from "@/lib/campus";
import {
  ADMIN_NAME_KEY,
  addNote,
  buildingHealth,
  clearOverlay,
  fmtHours,
  hoursBetween,
  merge,
  metrics,
  readOverlay,
  toCsv,
  workOrderText,
  writeOverlay,
  type AdminIssue,
  type AdminStatus,
  type RejectReason,
} from "@/lib/admin";
import { setTheme, useTheme } from "@/lib/theme";
import { OFFICE, routeFor } from "@/lib/routing";
import type { Issue, Priority } from "@/lib/types";

type View = "overview" | "queue" | "buildings" | "activity" | "settings";
const NAV: { id: View; label: string; Icon: typeof Inbox }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "queue", label: "Queue", Icon: Inbox },
  { id: "buildings", label: "Buildings", Icon: Building2 },
  { id: "activity", label: "Activity", Icon: Activity },
  { id: "settings", label: "Settings", Icon: Settings },
];

const STATUS_UI: Record<AdminStatus, { label: string; color: string }> = {
  open: { label: "Open", color: "var(--color-open)" },
  assigned: { label: "In progress", color: "var(--color-assigned)" },
  resolved: { label: "Resolved", color: "var(--color-resolved)" },
  rejected: { label: "Rejected", color: "var(--color-muted)" },
};
const PRIORITY_COLOR: Record<Priority, string> = { low: "#8e8e98", medium: "#0a84ff", high: "#ff9f0a", urgent: "#ff453a" };
const REJECT: Record<RejectReason, string> = {
  not_an_issue: "Not a facilities issue",
  duplicate: "Duplicate report",
  emergency_dps: "Emergency: refer to DPS",
  inappropriate: "Inappropriate content",
  outside_scope: "Outside USC's responsibility",
};
const OFFICES: string[] = Object.values(OFFICE);

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setAuthed(sessionStorage.getItem("ripple-admin") === "1");
    } catch {
      setAuthed(false);
    }
  }, []);
  if (authed === null) return <div className="fixed inset-0 bg-canvas" />;
  return authed ? <Console onLogout={() => (sessionStorage.removeItem("ripple-admin"), setAuthed(false))} /> : <Gate onIn={() => setAuthed(true)} />;
}

// ---------------- Login gate ----------------
function Gate({ onIn }: { onIn: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setErr("Wrong passcode");
    localStorage.setItem(ADMIN_NAME_KEY, name.trim() || "Office admin");
    sessionStorage.setItem("ripple-admin", "1");
    onIn();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-canvas p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-surface p-6 shadow-xl animate-fade-up">
        <div className="flex items-center gap-3">
          <RippleLogo size={40} />
          <div>
            <p className="text-lg font-bold">Ripple Office Console</p>
            <p className="text-sm text-muted">For USC offices and USG</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-muted">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FPM dispatcher" className="h-11 w-full rounded-xl bg-surface-2 px-3 outline-none focus:ring-2 focus:ring-cardinal" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-muted">Admin passcode</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} type="password" className="h-11 w-full rounded-xl bg-surface-2 px-3 outline-none focus:ring-2 focus:ring-cardinal" />
        </label>
        {err && <p className="text-sm text-open">{err}</p>}
        <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cardinal font-semibold text-white disabled:opacity-50">
          <Lock size={16} /> Sign in
        </button>
        <p className="text-center text-xs text-muted">Preview sign-in. Production: USC SSO with office roles.</p>
      </form>
    </div>
  );
}

// ---------------- Console ----------------
function Console({ onLogout }: { onLogout: () => void }) {
  const theme = useTheme();
  const [view, setView] = useState<View>("overview");
  const [raw, setRaw] = useState<Issue[] | null>(null);
  const [ov, setOv] = useState(readOverlay);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    listIssues().then(setRaw).catch(() => setRaw([]));
    const off = subscribeIssues((issue) => setRaw((l) => [issue, ...(l ?? []).filter((i) => i.id !== issue.id)]));
    const on = () => setOv(readOverlay());
    window.addEventListener("ripple:admin", on);
    return () => {
      off();
      window.removeEventListener("ripple:admin", on);
    };
  }, []);

  const list = useMemo(() => merge(raw ?? [], ov), [raw, ov]);
  const current = list.find((i) => i.id === openId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas md:flex-row">
      {/* Sidebar / top nav */}
      <aside className="flex shrink-0 flex-col border-b hairline bg-surface md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2.5 px-4 py-3 md:py-5">
          <RippleLogo size={32} />
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">Office Console</p>
            <p className="text-xs text-muted">Ripple · USC</p>
          </div>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2" aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${view === n.id ? "bg-cardinal text-white" : "text-muted hover:bg-surface-2"}`}
            >
              <n.Icon size={17} /> {n.label}
              {n.id === "queue" && <span className={`ml-auto rounded-full px-1.5 text-[11px] ${view === n.id ? "bg-white/20" : "bg-surface-2"}`}>{list.filter((i) => i.status === "open").length}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden p-3 md:block">
          <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex items-start gap-2 border-b border-gold/30 bg-gold/10 px-4 py-2 text-[12px]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-gold" />
          <span>
            <b>Preview mode.</b> Live reports are real; your actions are saved in this browser only until the backend is connected. Students aren&apos;t notified yet.
          </span>
        </div>
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          {raw === null ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="shimmer h-24 rounded-2xl" />
              ))}
            </div>
          ) : view === "overview" ? (
            <Overview list={list} open={setOpenId} go={setView} />
          ) : view === "queue" ? (
            <Queue list={list} open={setOpenId} />
          ) : view === "buildings" ? (
            <Buildings list={list} />
          ) : view === "activity" ? (
            <ActivityLog list={list} open={setOpenId} />
          ) : (
            <SettingsView list={list} />
          )}
        </div>
      </main>

      {current && <Drawer issue={current} all={list} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ---------------- Overview ----------------
function Overview({ list, open, go }: { list: AdminIssue[]; open: (id: string) => void; go: (v: View) => void }) {
  const m = metrics(list);
  const offices = useMemo(() => {
    const c = new Map<string, number>();
    list.filter((i) => i.status === "open" || i.status === "assigned").forEach((i) => c.set(i.office, (c.get(i.office) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const max = Math.max(1, ...offices.map(([, n]) => n));
  const worst = buildingHealth(list).slice(0, 5);
  return (
    <div className="space-y-6 animate-fade-up">
      <Title title="Overview" sub="What's broken on campus right now" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Open" value={m.open} color="var(--color-open)" Icon={Inbox} />
        <Kpi label="In progress" value={m.assigned} color="var(--color-assigned)" Icon={Clock} />
        <Kpi label="Fixed today" value={m.fixedToday} color="var(--color-resolved)" Icon={Check} />
        <Kpi label="Median time to fix" value={fmtHours(m.medianFix)} color="var(--color-ink)" Icon={Clock} />
        <Kpi label="Accessibility open" value={m.access} color="#0a84ff" Icon={Accessibility} />
        <Kpi label="Reports, last 24 h" value={m.reports24h} color="var(--color-ink)" Icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Needs attention" sub="High and urgent, oldest first" className="lg:col-span-2" action={<button onClick={() => go("queue")} className="text-sm font-semibold text-accent">Open queue</button>}>
          {m.urgent.length === 0 ? (
            <Empty text="Nothing urgent. Nice." />
          ) : (
            [...m.urgent]
              .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
              .slice(0, 6)
              .map((i) => <Row key={i.id} i={i} onClick={() => open(i.id)} />)
          )}
        </Card>
        <Card title="By office" sub="Active issues per team">
          {offices.length === 0 && <Empty text="No active issues." />}
          <div className="space-y-2.5 p-3">
            {offices.map(([o, n]) => (
              <div key={o}>
                <div className="flex justify-between text-[13px]">
                  <span className="truncate">{o}</span>
                  <b>{n}</b>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-cardinal" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Building health" sub="Lowest scores first" action={<button onClick={() => go("buildings")} className="text-sm font-semibold text-accent">All buildings</button>}>
        {worst.length === 0 && <Empty text="No data yet." />}
        {worst.map((b) => (
          <HealthRow key={b.id} b={b} />
        ))}
      </Card>
    </div>
  );
}

// ---------------- Queue ----------------
function Queue({ list, open }: { list: AdminIssue[]; open: (id: string) => void }) {
  const [tab, setTab] = useState<AdminStatus | "all">("open");
  const [q, setQ] = useState("");
  const [office, setOffice] = useState("");
  const [type, setType] = useState("");
  const [prio, setPrio] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "prio" | "reporters">("prio");
  const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list
      .filter((i) => tab === "all" || i.status === tab)
      .filter((i) => !office || i.office === office)
      .filter((i) => !type || i.category === type)
      .filter((i) => !prio || i.priority === prio)
      .filter((i) => !s || `${i.title} ${i.locationLabel} ${i.description ?? ""}`.toLowerCase().includes(s))
      .sort((a, b) =>
        sort === "new"
          ? +new Date(b.created_at) - +new Date(a.created_at)
          : sort === "old"
            ? +new Date(a.created_at) - +new Date(b.created_at)
            : sort === "reporters"
              ? b.reporter_count - a.reporter_count
              : RANK[a.priority] - RANK[b.priority] || +new Date(a.created_at) - +new Date(b.created_at),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, tab, q, office, type, prio, sort]);

  const count = (s: AdminStatus | "all") => (s === "all" ? list.length : list.filter((i) => i.status === s).length);
  const offices = [...new Set(list.map((i) => i.office))];
  const types = [...new Set(list.map((i) => i.category))];

  return (
    <div className="space-y-4 animate-fade-up">
      <Title
        title="Queue"
        sub="Every student report, routed to its office"
        right={
          <button onClick={() => download(`ripple-issues-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows))} className="flex h-9 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-semibold">
            <Download size={15} /> Export CSV
          </button>
        }
      />
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1">
        {(["open", "assigned", "resolved", "rejected", "all"] as const).map((s) => (
          <button key={s} onClick={() => setTab(s)} className={`h-9 shrink-0 rounded-lg px-3 text-sm font-semibold ${tab === s ? "bg-cardinal text-white" : "text-muted"}`}>
            {s === "all" ? "All" : STATUS_UI[s].label} <span className="opacity-70">{count(s)}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        <label className="relative md:col-span-2">
          <Search size={15} className="absolute left-3 top-3 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, building, details" className="h-10 w-full rounded-xl bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-cardinal" />
        </label>
        <Select value={office} onChange={setOffice} options={[["", "All offices"], ...offices.map((o) => [o, o] as [string, string])]} />
        <Select value={type} onChange={setType} options={[["", "All problem types"], ...types.map((t) => [t, catInfo(t).label] as [string, string])]} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={prio} onChange={setPrio} options={[["", "Any priority"], ...PRIORITIES.map((p) => [p, cap(p)] as [string, string])]} />
          <Select value={sort} onChange={(v) => setSort(v as typeof sort)} options={[["prio", "Priority"], ["new", "Newest"], ["old", "Oldest"], ["reporters", "Most reports"]]} />
        </div>
      </div>
      <Card title={`${rows.length} issue${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? <Empty text="No issues match these filters." /> : rows.map((i) => <Row key={i.id} i={i} onClick={() => open(i.id)} wide />)}
      </Card>
    </div>
  );
}

// ---------------- Buildings ----------------
function Buildings({ list }: { list: AdminIssue[] }) {
  const rows = buildingHealth(list);
  return (
    <div className="space-y-4 animate-fade-up">
      <Title title="Buildings" sub="Health score, time to fix and repeat problems per building" />
      <Card title={`${rows.length} buildings with reports`}>
        <div className="hidden grid-cols-[1fr_70px_70px_70px_90px_80px] gap-2 border-b hairline px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid">
          <span>Building</span>
          <span>Open</span>
          <span>Active</span>
          <span>Fixed</span>
          <span>Avg fix</span>
          <span>Access</span>
        </div>
        {rows.length === 0 && <Empty text="No reports yet." />}
        {rows.map((b) => (
          <HealthRow key={b.id} b={b} detailed />
        ))}
      </Card>
      <p className="text-xs text-muted">Score = 100 − open load (weighted by priority) − 10 per chronic problem type (3+ reports) − 10 if the average fix takes over 3 days.</p>
    </div>
  );
}

// ---------------- Activity ----------------
function ActivityLog({ list, open }: { list: AdminIssue[]; open: (id: string) => void }) {
  const events = list.flatMap((i) => i.events.map((e) => ({ ...e, issue: i }))).sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return (
    <div className="space-y-4 animate-fade-up">
      <Title title="Activity" sub="Audit trail of every report and office action" />
      <Card title={`${events.length} events`}>
        {events.length === 0 && <Empty text="No activity yet." />}
        {events.slice(0, 200).map((e, n) => (
          <button key={n} onClick={() => open(e.issue.id)} className={`flex w-full items-start gap-3 px-3 py-2.5 text-left ${n ? "border-t hairline" : ""}`}>
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
              <ListChecks size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <b>{e.by}</b> · {e.text}
              </p>
              <p className="truncate text-xs text-muted">{e.issue.title}</p>
            </div>
            <span className="shrink-0 text-xs text-muted">{timeAgo(e.at)}</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

// ---------------- Settings ----------------
function SettingsView({ list }: { list: AdminIssue[] }) {
  const [name, setName] = useState("");
  useEffect(() => setName(localStorage.getItem(ADMIN_NAME_KEY) ?? ""), []);
  return (
    <div className="space-y-4 animate-fade-up">
      <Title title="Settings" sub="Offices, routing and data" />
      <Card title="You">
        <div className="flex gap-2 p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-10 flex-1 rounded-xl bg-surface-2 px-3 text-sm outline-none" />
          <button onClick={() => localStorage.setItem(ADMIN_NAME_KEY, name.trim() || "Office admin")} className="h-10 rounded-xl bg-cardinal px-4 text-sm font-semibold text-white">
            Save
          </button>
        </div>
      </Card>
      <Card title="Routing" sub="Default office per problem type. Place rules override it (residence → Housing, outdoor trash → Waste, parking → Transportation…). See docs/ROUTING.md.">
        {categoryIds().map((c, n) => (
          <div key={c} className={`flex items-center gap-3 px-3 py-2.5 ${n ? "border-t hairline" : ""}`}>
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-accent">
              <CategoryIcon category={c} size={16} />
            </div>
            <span className="flex-1 text-sm font-semibold">{catInfo(c).label}</span>
            <span className="text-sm text-muted">{catInfo(c).team}</span>
          </div>
        ))}
      </Card>
      <Card title="Data">
        <div className="flex flex-wrap gap-2 p-3">
          <button onClick={() => download("ripple-issues.csv", toCsv(list))} className="flex h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold">
            <Download size={15} /> Export all (CSV)
          </button>
          <button onClick={() => confirm("Clear all preview actions in this browser?") && clearOverlay()} className="flex h-10 items-center gap-1.5 rounded-xl bg-open/15 px-3 text-sm font-semibold text-open">
            <RotateCcw size={15} /> Reset preview actions
          </button>
        </div>
      </Card>
    </div>
  );
}

// ---------------- Issue drawer ----------------
function Drawer({ issue: i, all, onClose }: { issue: AdminIssue; all: AdminIssue[]; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [resNote, setResNote] = useState("");
  const [reason, setReason] = useState<RejectReason>("not_an_issue");
  const [dupOf, setDupOf] = useState("");
  const [copied, setCopied] = useState(false);
  const before = photoUrl(i.before_photo_path);
  const order = workOrderText(i, before);
  const siblings = all.filter((x) => x.id !== i.id && x.location_id === i.location_id && x.status !== "rejected");
  const set = useCallback((patch: Parameters<typeof writeOverlay>[1], text: string, type: Parameters<typeof writeOverlay>[2] extends infer E ? (E extends { type: infer T } ? T : never) : never) => writeOverlay(i.id, patch, { type, text }), [i.id]);

  async function uploadAfter(f?: File) {
    if (!f) return;
    const { dataUrl } = await prepareImage(f);
    set({ after_photo: dataUrl }, "Uploaded an after photo", "after_photo");
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-canvas shadow-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b hairline bg-surface p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={STATUS_UI[i.status].color}>{STATUS_UI[i.status].label}</Badge>
              <Badge color={PRIORITY_COLOR[i.priority]}>{cap(i.priority)}</Badge>
              {i.duplicate_of && <Badge color="var(--color-muted)">Duplicate</Badge>}
            </div>
            <h2 className="mt-2 text-xl font-bold leading-snug">{i.title}</h2>
            <p className="text-sm text-muted">
              {catInfo(i.category).label} · {timeAgo(i.created_at)} · {i.reporter_count} reporter{i.reporter_count > 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Photos */}
          <div className="grid grid-cols-2 gap-2">
            <Photo src={before} label="Before" />
            <label className="relative cursor-pointer">
              <Photo src={i.after_photo} label="After" empty="Upload after photo" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAfter(e.target.files?.[0])} />
            </label>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-surface p-3 text-xs text-muted">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" /> AI before/after check is paused to save credits. It compares both photos and says whether the fix looks done; the admin still decides.
          </div>

          {/* Facts */}
          <Card title="Details">
            <Fact icon={<MapPin size={15} />} label="Location">
              {i.locationLabel}
              {i.lat && i.lng && (
                <a href={`https://maps.google.com/?q=${i.lat},${i.lng}`} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-semibold text-accent">
                  Directions <ExternalLink size={12} />
                </a>
              )}
            </Fact>
            {i.lat && i.lng && <Fact label="Coordinates">{`${i.lat.toFixed(5)}, ${i.lng.toFixed(5)}`}</Fact>}
            {i.description && <Fact label="Student note / AI summary">{i.description}</Fact>}
            <Fact label="Problem type">
              <Select
                value={i.category}
                onChange={(c) => set({ category: c, assigned_team: routeFor(c, i.location_id, i.floor).office }, `Re-routed to ${catInfo(c).label} (${routeFor(c, i.location_id, i.floor).office})`, "rerouted")}
                options={[...new Set([i.category, ...categoryIds()])].map((c) => [c, catInfo(c).label])}
              />
            </Fact>
            <Fact label="Priority">
              <Select value={i.priority} onChange={(p) => set({ priority: p as Priority }, `Priority set to ${p}`, "priority")} options={PRIORITIES.map((p) => [p, cap(p)])} />
            </Fact>
            <Fact label="Office">
              <Select value={i.office} onChange={(o) => set({ assigned_team: o }, `Office changed to ${o}`, "rerouted")} options={[...new Set([i.office, ...OFFICES])].map((o) => [o, o])} />
            </Fact>
            <Fact label="Assignee">
              <input
                defaultValue={i.assignee ?? ""}
                placeholder="Technician or crew"
                onBlur={(e) => e.target.value.trim() !== (i.assignee ?? "") && set({ assignee: e.target.value.trim() }, `Assignee set to ${e.target.value.trim() || "nobody"}`, "assigned")}
                className="h-9 w-full rounded-lg bg-surface-2 px-2 text-sm outline-none"
              />
            </Fact>
          </Card>

          {/* Actions */}
          <Card title="Actions">
            <div className="space-y-3 p-3">
              {i.status === "open" && (
                <Btn onClick={() => set({ status: "assigned", assigned_team: i.office }, `Assigned to ${i.office}`, "assigned")} primary>
                  <ArrowUpRight size={16} /> Assign to {i.office}
                </Btn>
              )}
              {(i.status === "open" || i.status === "assigned") && (
                <div className="space-y-2 rounded-xl bg-surface-2 p-3">
                  <textarea value={resNote} onChange={(e) => setResNote(e.target.value)} placeholder="Resolution note for students (e.g. Elevator repaired, inspected)" rows={2} className="w-full rounded-lg bg-surface p-2 text-sm outline-none" />
                  <Btn
                    onClick={() => set({ status: "resolved", resolved_at: new Date().toISOString(), resolution_note: resNote.trim() || "Fixed" }, `Resolved: ${resNote.trim() || "Fixed"}`, "resolved")}
                    color="var(--color-resolved)"
                  >
                    <Check size={16} /> Mark resolved {i.after_photo ? "" : "(no after photo)"}
                  </Btn>
                  <p className="text-[11px] text-muted">With the backend, resolving sends every reporter the &ldquo;Fixed&rdquo; alert.</p>
                </div>
              )}
              {(i.status === "resolved" || i.status === "rejected") && (
                <Btn onClick={() => set({ status: "open", resolved_at: undefined, rejected_reason: undefined }, "Reopened", "reopened")}>
                  <RotateCcw size={16} /> Reopen
                </Btn>
              )}
              {i.status !== "rejected" && i.status !== "resolved" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2 rounded-xl bg-surface-2 p-3">
                    <Select value={reason} onChange={(r) => setReason(r as RejectReason)} options={Object.entries(REJECT)} />
                    <Btn onClick={() => set({ status: "rejected", rejected_reason: reason }, `Rejected: ${REJECT[reason]}`, "rejected")} color="var(--color-open)">
                      <XCircle size={16} /> Reject
                    </Btn>
                  </div>
                  <div className="space-y-2 rounded-xl bg-surface-2 p-3">
                    <Select value={dupOf} onChange={setDupOf} options={[["", siblings.length ? "Duplicate of…" : "No other issue here"], ...siblings.map((s) => [s.id, s.title] as [string, string])]} />
                    <Btn onClick={() => dupOf && set({ duplicate_of: dupOf, status: "rejected", rejected_reason: "duplicate" }, `Merged into "${all.find((x) => x.id === dupOf)?.title}"`, "merged")} disabled={!dupOf}>
                      Merge duplicate
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Work order */}
          <Card title="Work order" sub="Send to the office in their existing system" action={<FileText size={16} className="text-muted" />}>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted">{order}</pre>
            <div className="flex gap-2 border-t hairline p-3">
              <Btn
                onClick={() => {
                  navigator.clipboard?.writeText(order);
                  setCopied(true);
                  set({}, "Copied work order", "work_order");
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <ClipboardCopy size={15} /> {copied ? "Copied" : "Copy"}
              </Btn>
              <a
                href={`mailto:?subject=${encodeURIComponent(`Ripple work order: ${i.title}`)}&body=${encodeURIComponent(order)}`}
                onClick={() => set({}, "Opened email draft", "work_order")}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-sm font-semibold"
              >
                <Mail size={15} /> Email draft
              </a>
            </div>
          </Card>

          {/* Notes */}
          <Card title="Internal notes" sub="Visible to offices only">
            {i.notes.map((n, k) => (
              <div key={k} className={`px-3 py-2 text-sm ${k ? "border-t hairline" : ""}`}>
                <p>{n.text}</p>
                <p className="text-xs text-muted">
                  {n.by} · {timeAgo(n.at)}
                </p>
              </div>
            ))}
            <div className="flex gap-2 border-t hairline p-3">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" className="h-10 flex-1 rounded-xl bg-surface-2 px-3 text-sm outline-none" />
              <button
                onClick={() => {
                  if (!note.trim()) return;
                  addNote(i.id, note.trim());
                  setNote("");
                }}
                className="grid h-10 w-10 place-items-center rounded-xl bg-cardinal text-white"
                aria-label="Add note"
              >
                <MessageSquare size={16} />
              </button>
            </div>
          </Card>

          {/* Timeline */}
          <Card title="Timeline">
            {[...i.events].reverse().map((e, k) => (
              <div key={k} className={`flex gap-3 px-3 py-2 text-sm ${k ? "border-t hairline" : ""}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cardinal" />
                <div className="min-w-0 flex-1">
                  <p>{e.text}</p>
                  <p className="text-xs text-muted">
                    {e.by} · {new Date(e.at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {i.resolved_at && <p className="border-t hairline px-3 py-2 text-xs text-muted">Time to fix: {fmtHours(hoursBetween(i.created_at, i.resolved_at))}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------- small UI ----------------
function Title({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Card({ title, sub, action, children, className = "" }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b hairline px-3 py-2.5">
        <div>
          <p className="text-sm font-bold">{title}</p>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, color, Icon }: { label: string; value: string | number; color: string; Icon: typeof Inbox }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <Icon size={16} style={{ color }} />
      <p className="mt-2 text-2xl font-extrabold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Row({ i, onClick, wide }: { i: AdminIssue; onClick: () => void; wide?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-t hairline px-3 py-3 text-left first:border-t-0 hover:bg-surface-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[i.priority] }} title={`${i.priority} priority`} />
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent">
        <CategoryIcon category={i.category} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{i.title}</p>
        <p className="truncate text-xs text-muted">
          {i.locationLabel} · {i.office}
          {i.assignee ? ` · ${i.assignee}` : ""}
        </p>
      </div>
      {wide && (
        <span className="hidden items-center gap-1 text-xs text-muted md:flex">
          <Users size={12} /> {i.reporter_count}
        </span>
      )}
      <span className="hidden w-16 text-right text-xs text-muted md:block">{timeAgo(i.created_at)}</span>
      <Badge color={STATUS_UI[i.status].color}>{STATUS_UI[i.status].label}</Badge>
    </button>
  );
}

function HealthRow({ b, detailed }: { b: ReturnType<typeof buildingHealth>[number]; detailed?: boolean }) {
  const c = b.score >= 80 ? "var(--color-resolved)" : b.score >= 55 ? "var(--color-assigned)" : "var(--color-open)";
  return (
    <div className={`grid items-center gap-2 border-t hairline px-3 py-2.5 text-sm first:border-t-0 ${detailed ? "md:grid-cols-[1fr_70px_70px_70px_90px_80px]" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-9 text-right text-lg font-extrabold tabular-nums" style={{ color: c }}>
          {b.score}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{b.name}</p>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${b.score}%`, background: c }} />
          </div>
          {b.chronic.length > 0 && <p className="mt-1 text-[11px] text-open">Repeat problem: {b.chronic.join(", ")}</p>}
        </div>
      </div>
      {detailed && (
        <>
          <span className="text-muted md:text-ink">{b.open}</span>
          <span>{b.assigned}</span>
          <span>{b.fixed}</span>
          <span>{fmtHours(b.avgFix)}</span>
          <span style={{ color: b.access ? "#0a84ff" : undefined }}>{b.access}</span>
        </>
      )}
    </div>
  );
}

function Fact({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 border-t hairline px-3 py-2 text-sm first:border-t-0">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {icon} {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Photo({ src, label, empty }: { src: string | null; label: string; empty?: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-center text-xs text-muted">
          <span className="flex flex-col items-center gap-1">
            <Upload size={18} /> {empty ?? "No photo"}
          </span>
        </div>
      )}
      <span className="glass absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">{label}</span>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, primary, color, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; color?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 ${primary || color ? "text-white" : "bg-surface-2"}`}
      style={primary ? { background: "var(--color-cardinal)" } : color ? { background: color } : undefined}
    >
      {children}
    </button>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-xl bg-surface px-2 text-sm outline-none focus:ring-2 focus:ring-cardinal">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-4 text-sm text-muted">{text}</p>;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
