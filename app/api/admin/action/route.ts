// POST /api/admin/action — every office action from the console.
// Body: { issueId, patch?, event: { type, text }, note? }
// Writes the allowed fields to `issues`, logs `issue_events`, adds `issue_notes`.
// Resolving here fires the Realtime update that shows "Fixed" on reporters' phones.
import { NextResponse } from "next/server";
import { logEvent, requireAdmin } from "@/lib/admin-server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const maxDuration = 30;

const STATUSES = ["open", "assigned", "resolved", "rejected"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const REASONS = ["not_an_issue", "duplicate", "emergency_dps", "inappropriate", "outside_scope"];
const EVENT_TYPES = ["assigned", "status", "priority", "rerouted", "note", "after_photo", "resolved", "reopened", "rejected", "merged", "work_order", "acknowledged", "reminder"];

type Patch = {
  status?: string;
  assigned_team?: string;
  assignee?: string;
  priority?: string;
  category?: string;
  duplicate_of?: string;
  rejected_reason?: string;
  resolution_note?: string;
  after_photo?: string; // data URL or base64 JPEG
};

const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = (await req.json().catch(() => null)) as { issueId?: string; patch?: Patch; event?: { type?: string; text?: string }; note?: string } | null;
  if (!body?.issueId) return bad(400, "issueId is required");

  const db = supabaseAdmin();
  const { data: issue } = await db.from("issues").select("id, status, first_response_at").eq("id", body.issueId).maybeSingle();
  if (!issue) return bad(404, "Issue not found");

  const p = body.patch ?? {};
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};

  if (p.status !== undefined) {
    if (!STATUSES.includes(p.status)) return bad(400, "Invalid status");
    update.status = p.status;
    if (p.status === "assigned") update.assigned_at = now;
    if (p.status === "resolved") update.resolved_at = now;
    if (p.status === "open") {
      update.resolved_at = null;
      update.rejected_reason = null;
      update.duplicate_of = null;
    }
  }
  if (p.priority !== undefined) {
    if (!PRIORITIES.includes(p.priority)) return bad(400, "Invalid priority");
    update.priority = p.priority;
  }
  if (p.category !== undefined) {
    const { data: route } = await db.from("routing").select("category").eq("category", p.category).maybeSingle();
    if (!route) return bad(400, "Unknown problem type");
    update.category = p.category;
  }
  if (p.rejected_reason !== undefined) {
    if (!REASONS.includes(p.rejected_reason)) return bad(400, "Invalid reason");
    update.rejected_reason = p.rejected_reason;
  }
  if (p.duplicate_of !== undefined) {
    if (p.duplicate_of === body.issueId) return bad(400, "Can't merge into itself");
    const { data: target } = await db.from("issues").select("id").eq("id", p.duplicate_of).maybeSingle();
    if (!target) return bad(400, "Merge target not found");
    update.duplicate_of = p.duplicate_of;
  }
  if (p.assigned_team !== undefined) update.assigned_team = String(p.assigned_team).slice(0, 80);
  if (p.assignee !== undefined) update.assignee = String(p.assignee).slice(0, 80) || null;
  if (p.resolution_note !== undefined) update.resolution_note = String(p.resolution_note).slice(0, 500);

  if (p.after_photo) {
    const b64 = p.after_photo.includes(",") ? p.after_photo.slice(p.after_photo.indexOf(",") + 1) : p.after_photo;
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0 || bytes.length > 1_500_000) return bad(413, "Photo is empty or too large");
    const path = `${body.issueId}.jpg`;
    const up = await db.storage.from("resolution-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (up.error) return bad(502, `Photo upload failed: ${up.error.message}`);
    update.after_photo_path = path;
  }

  if (Object.keys(update).length) {
    if (!issue.first_response_at) update.first_response_at = now;
    update.updated_at = now;
    const { error } = await db.from("issues").update(update).eq("id", body.issueId);
    if (error) return bad(500, `Could not update issue: ${error.message}`);
  }

  if (body.note?.trim()) {
    const { error } = await db.from("issue_notes").insert({ issue_id: body.issueId, author_name: admin.name, text: body.note.trim().slice(0, 1000) });
    if (error) return bad(500, `Could not save note: ${error.message}`);
  }

  const ev = body.event;
  if (ev?.type && EVENT_TYPES.includes(ev.type)) await logEvent(body.issueId, admin.name, ev.type, ev.text ?? ev.type, Object.keys(update).length ? update : undefined);

  return NextResponse.json({ ok: true });
}
