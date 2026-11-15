// P3 — POST /api/admin/send-work-order { issueId, subject, body, office? } (staff only).
// Supervisor approved: create a one-time office link, email the work order to DEMO_OFFICE_INBOX tagged
// [Department], set the issue to "assigned", log it. If email isn't configured or fails, still returns the link
// ({ sent: false, link }) so the demo can continue.
import { NextResponse } from "next/server";
import { logEvent, requireAdmin } from "@/lib/admin-server";
import { departmentFor } from "@/lib/departments";
import { sendDemoEmail } from "@/lib/email";
import { appUrl, hashToken, newToken, TOKEN_DAYS } from "@/lib/fix-tokens";
import { routeFor } from "@/lib/routing";
import { supabaseAdmin } from "@/lib/supabase-server";

export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (status: number, error: string) => NextResponse.json({ error }, { status });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const b = (await req.json().catch(() => null)) as { issueId?: string; subject?: string; body?: string; office?: string } | null;
  if (!b?.issueId || !UUID.test(b.issueId)) return bad(400, "issueId (uuid) is required");
  const subject = (b.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
  const text = (b.body ?? "").trim().slice(0, 3000);
  if (subject.length < 3 || text.length < 10) return bad(400, "Subject and body are required");

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return bad(503, "Supabase not configured");
  }
  const { data: issue } = await db.from("issues").select("id, status, category, location_id, floor, assigned_team, first_response_at").eq("id", b.issueId).maybeSingle();
  if (!issue) return bad(404, "Issue not found");
  if (issue.status === "resolved" || issue.status === "rejected") return bad(409, `This issue is ${issue.status}`);

  const office = (typeof b.office === "string" && b.office.trim().slice(0, 80)) || issue.assigned_team || routeFor(issue.category, issue.location_id, issue.floor).office;
  const dept = departmentFor(office);

  // One-time link for the office (only the hash is stored)
  const token = newToken();
  const ins = await db.from("fix_tokens").insert({ token_hash: hashToken(token), issue_id: issue.id, office, expires_at: new Date(Date.now() + TOKEN_DAYS * 86400_000).toISOString() });
  if (ins.error) {
    console.error("[send-work-order] fix_tokens:", ins.error);
    return bad(500, /fix_tokens/.test(ins.error.message) ? "Office links aren't set up yet (run supabase/fix_tokens.sql)" : "Could not create the office link");
  }
  const link = `${appUrl(req)}/fix/${token}`;

  const fullSubject = `[${dept.name}] ${subject}`;
  const emailText = `To: ${office} <${dept.email}>\n\n${text}\n\nOpen this job (no login needed): ${link}\nAcknowledge it, then upload an after photo when it's fixed. The link works for ${TOKEN_DAYS} days.\n\n— Ripple (demo). Sent to the demo inbox, not to a real USC office.`;
  const html = `<p style="color:#666">To: ${esc(office)} &lt;${esc(dept.email)}&gt;</p><p style="white-space:pre-wrap">${esc(text)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;background:#990000;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Open this job</a></p><p style="color:#666;font-size:13px">Acknowledge it, then upload an after photo when it's fixed. The link works for ${TOKEN_DAYS} days.<br>Ripple (demo): sent to the demo inbox, not to a real USC office.</p>`;
  const email = await sendDemoEmail({ subject: fullSubject, text: emailText, html });

  const now = new Date().toISOString();
  const upd = await db
    .from("issues")
    .update({ status: "assigned", assigned_team: office, assigned_at: now, updated_at: now, ...(issue.first_response_at ? {} : { first_response_at: now }) })
    .eq("id", issue.id);
  if (upd.error) return bad(500, `Could not update the issue: ${upd.error.message}`);

  await logEvent(
    issue.id,
    admin.name,
    "work_order",
    email.sent ? `Work order emailed to ${dept.name} (${dept.email}) via demo inbox. Office link: ${link}` : `Email (demo): work order for ${dept.name} (${dept.email}) not sent. Office link: ${link}`,
    { subject: fullSubject, to: dept.email, office, sent: email.sent, error: email.error ?? null, text: emailText },
  ).catch(() => {});

  return NextResponse.json({ sent: email.sent, link, to: dept.email, department: dept.name, office, subject: fullSubject, ...(email.error ? { error: email.error } : {}) });
}
