"use client";
// P3 — supervisor side of the office loop, inside the /admin issue drawer.
// open      → AI work order (editable) → Approve & send (email to demo inbox, tagged [Department])
// assigned  → sent / acknowledged status, office link; when the office submits a fix:
//             before/after + AI verdict → Confirm resolved (existing resolve) or Send back.
import { AlarmClock, Check, CheckCircle2, CircleAlert, ClipboardCopy, ExternalLink, Loader2, Mail, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { adminError, adminPost, type AdminIssue } from "@/lib/admin";
import { departmentFor } from "@/lib/departments";
import { isOverdue, overdueLabel, reminderCount } from "@/lib/sla";

type Draft = { subject: string; body: string; ai: boolean };
type SendResult = { sent: boolean; link: string; to: string; department: string; subject: string; error?: string };

export default function OfficeLoop({ issue: i, before, onResolve }: { issue: AdminIssue; before: string | null; onResolve: (note: string) => void }) {
  const dept = departmentFor(i.office);
  const sentEvent = [...i.events].reverse().find((e) => e.type === "work_order" && /\/fix\//.test(e.text));
  const linkEvent = [...i.events].reverse().find((e) => (e.type === "work_order" || e.type === "reminder" || e.type === "status") && /\/fix\//.test(e.text));
  const link = linkEvent?.text.match(/https?:\/\/\S+\/fix\/[\w-]+/)?.[0] ?? null;
  const overdue = isOverdue(i);
  const reminders = reminderCount(i);
  const acknowledged = i.events.some((e) => e.type === "acknowledged" || (e.type === "status" && e.text.startsWith("Acknowledged")));
  const verdict = i.ai_fix_verdict ?? null;
  const fixSubmitted = i.status === "assigned" && !!i.after_photo && !!verdict;

  if (i.status === "resolved" || i.status === "rejected") return null;
  if (i.status === "open" || (!sentEvent && !i.assigned_at)) return <Compose key={`${i.id}:${i.office}`} issue={i} dept={dept} />;

  return (
    <section className="overflow-hidden rounded-2xl bg-surface">
      <div className="flex items-center justify-between gap-2 border-b hairline px-3 py-2.5">
        <p className="text-sm font-bold">{fixSubmitted ? "Fix submitted" : "With the office"}</p>
        <span className="text-xs text-muted">
          {dept.name} · {dept.email}
        </span>
      </div>

      <ol className="space-y-1.5 p-3 text-sm">
        <Step done>{sentEvent ? `Work order ${sentEvent.text.startsWith("Email (demo)") ? "ready (demo link, email not sent)" : "emailed to the demo inbox"}` : `Assigned to ${i.office}`}</Step>
        <Step done={acknowledged}>{acknowledged ? "Office acknowledged" : "Waiting for the office to acknowledge"}</Step>
        <Step done={fixSubmitted}>{fixSubmitted ? "After photo submitted" : "Waiting for the after photo"}</Step>
      </ol>

      {overdue && !fixSubmitted && (
        <div className="mx-3 mb-3 rounded-xl bg-open/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-open">
            <AlarmClock size={15} /> Overdue
          </p>
          <p className="mt-0.5 text-xs text-open/90">{overdueLabel(i)}</p>
        </div>
      )}
      {(overdue || reminders > 0) && !fixSubmitted && !acknowledged && <ReminderBox key={i.id} issue={i} reminders={reminders} />}

      {link && <LinkRow link={link} demo={/^(Reminder: )?Email \(demo\)/.test(linkEvent!.text)} />}

      {fixSubmitted && <Review issue={i} before={before} verdict={verdict!} onResolve={onResolve} />}
    </section>
  );
}

function Compose({ issue: i, dept }: { issue: AdminIssue; dept: { name: string; email: string } }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    adminPost<{ subject: string; body: string; ai: boolean }>("/api/admin/work-order", { issueId: i.id, office: i.office })
      .then((w) => live && setDraft({ subject: w.subject, body: w.body, ai: w.ai }))
      .catch((e) => live && (setDraft({ subject: i.title, body: "", ai: false }), adminError(`Couldn't draft the work order: ${(e as Error).message}`)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [i.id, i.office, i.title]);

  async function send() {
    if (!draft) return;
    setSending(true);
    try {
      setResult(await adminPost<SendResult>("/api/admin/send-work-order", { issueId: i.id, subject: draft.subject, body: draft.body, office: i.office }));
      window.dispatchEvent(new Event("ripple:admin"));
    } catch (e) {
      adminError(`Couldn't send: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  if (result)
    return (
      <section className="space-y-2 rounded-2xl bg-surface p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-resolved">
          <CheckCircle2 size={16} /> {result.sent ? `Sent as ${result.subject.split("]")[0]}]` : "Email (demo)"}
        </p>
        <p className="text-xs text-muted">{result.sent ? `Delivered to the demo inbox for ${result.department} (${result.to}).` : `Email isn't configured, so nothing was sent. Open the office link below on a phone.${result.error ? ` (${result.error})` : ""}`}</p>
        <LinkRow link={result.link} demo={!result.sent} />
      </section>
    );

  const canSend = !!draft && draft.subject.trim().length >= 3 && draft.body.trim().length >= 10 && !sending && !loading;
  return (
    <section className="overflow-hidden rounded-2xl bg-surface">
      <div className="flex items-center justify-between gap-2 border-b hairline px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Sparkles size={14} className="text-accent" /> Work order
        </p>
        {draft && !loading && !draft.ai && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Template (AI unavailable)</span>}
      </div>
      <div className="space-y-2 p-3">
        <p className="text-xs text-muted">
          To: <b className="text-ink">{i.office}</b> &lt;{dept.email}&gt; · subject tagged [{dept.name}]
        </p>
        {loading ? (
          <div className="space-y-2">
            <div className="shimmer h-10 rounded-lg" />
            <div className="shimmer h-28 rounded-lg" />
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" /> Drafting with AI…
            </p>
          </div>
        ) : (
          <>
            <input
              value={draft?.subject ?? ""}
              onChange={(e) => setDraft((d) => d && { ...d, subject: e.target.value })}
              aria-label="Subject"
              className="h-10 w-full rounded-lg bg-surface-2 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-cardinal"
            />
            <textarea
              value={draft?.body ?? ""}
              onChange={(e) => setDraft((d) => d && { ...d, body: e.target.value })}
              aria-label="Body"
              rows={7}
              className="w-full rounded-lg bg-surface-2 p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-cardinal"
            />
          </>
        )}
        <button onClick={send} disabled={!canSend} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cardinal text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-40">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Approve &amp; send
        </button>
        <p className="text-[11px] text-muted">Nothing is sent until you approve. Demo: all email goes to the demo inbox, never to USC.</p>
      </div>
    </section>
  );
}

function Review({ issue: i, before, verdict: v, onResolve }: { issue: AdminIssue; before: string | null; verdict: NonNullable<AdminIssue["ai_fix_verdict"]>; onResolve: (note: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function sendBack() {
    setBusy(true);
    try {
      await adminPost("/api/admin/fix-review", { issueId: i.id, note });
      window.dispatchEvent(new Event("ripple:admin"));
    } catch (e) {
      adminError(`Couldn't send back: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border-t hairline p-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Before", before],
          ["After", i.after_photo],
        ].map(([label, src]) => (
          <figure key={label} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-2">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={label!} className="h-full w-full object-cover" />
            )}
            <figcaption className="glass absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">{label}</figcaption>
          </figure>
        ))}
      </div>
      <div className={`rounded-xl p-3 ${v.resolved ? "bg-resolved/10" : "bg-assigned/10"}`}>
        <p className={`flex items-center gap-1.5 text-sm font-bold ${v.resolved ? "text-resolved" : "text-assigned"}`}>
          {v.resolved ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          AI: {v.resolved ? `looks fixed · ${Math.round(v.confidence * 100)}%` : "not confirmed"}
          {!v.same_location && " · different spot?"}
        </p>
        <p className="mt-1 text-xs text-muted">{v.reason}</p>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): shown to students when resolved, or to the office when sent back" className="h-10 w-full rounded-lg bg-surface-2 px-3 text-sm outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onResolve(note.trim() || "Fixed")} disabled={busy} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-resolved text-sm font-semibold text-white disabled:opacity-50">
          <Check size={16} /> Confirm resolved
        </button>
        <button onClick={sendBack} disabled={busy} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Send back
        </button>
      </div>
      <p className="text-[11px] text-muted">The AI is advisory. Confirming sends every reporter the &ldquo;Fixed&rdquo; alert.</p>
    </div>
  );
}

function ReminderBox({ issue: i, reminders }: { issue: AdminIssue; reminders: number }) {
  const [draft, setDraft] = useState<{ subject: string; body: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const dept = departmentFor(i.office);

  async function draftIt() {
    setBusy("draft");
    try {
      setDraft(await adminPost<{ subject: string; body: string; ai: boolean }>("/api/admin/draft-reminder", { issueId: i.id }));
    } catch (e) {
      adminError(`Couldn't draft the reminder: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  async function send() {
    if (!draft) return;
    setBusy("send");
    try {
      const r = await adminPost<SendResult>("/api/admin/send-work-order", { issueId: i.id, subject: draft.subject, body: draft.body, office: i.office, kind: "reminder" });
      setSent(r.sent ? `Reminder sent to ${i.office}` : `Email (demo): reminder ready for ${i.office}`);
      setDraft(null);
      window.dispatchEvent(new Event("ripple:admin"));
    } catch (e) {
      adminError(`Couldn't send the reminder: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-3 mb-3 space-y-2 rounded-xl bg-surface-2 p-3">
      {reminders > 0 && <p className="text-xs text-muted">Reminders sent: {reminders}</p>}
      {sent && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-resolved">
          <CheckCircle2 size={15} /> {sent}
        </p>
      )}
      {!draft ? (
        <button onClick={draftIt} disabled={!!busy} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-semibold disabled:opacity-50">
          {busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} className="text-accent" />} Draft reminder (AI)
        </button>
      ) : (
        <>
          <p className="text-xs text-muted">
            To: {i.office} &lt;{dept.email}&gt; · subject &ldquo;[{dept.name}] Reminder: …&rdquo;{!draft.ai && " · Template (AI unavailable)"}
          </p>
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} aria-label="Reminder subject" className="h-10 w-full rounded-lg bg-surface px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-cardinal" />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Reminder body" rows={5} className="w-full rounded-lg bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-cardinal" />
          <button onClick={send} disabled={!!busy || draft.subject.trim().length < 3 || draft.body.trim().length < 10} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-cardinal text-sm font-semibold text-white disabled:opacity-40">
            {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send reminder
          </button>
        </>
      )}
    </div>
  );
}

function Step({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${done ? "" : "text-muted"}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-resolved text-white" : "border border-line"}`}>{done && <Check size={12} strokeWidth={3} />}</span>
      {children}
    </li>
  );
}

function LinkRow({ link, demo }: { link: string; demo: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 border-t hairline px-3 py-2.5">
      <Mail size={14} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-xs text-muted" title={link}>
        {demo ? "Office link (demo): " : "Office link: "}
        {link}
      </span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-surface-2 px-2 text-xs font-semibold"
      >
        <ClipboardCopy size={12} /> {copied ? "Copied" : "Copy"}
      </button>
      <a href={link} target="_blank" rel="noreferrer" className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-surface-2 px-2 text-xs font-semibold">
        <ExternalLink size={12} /> Open
      </a>
    </div>
  );
}
