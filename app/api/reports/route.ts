// POST /api/reports (README §8): save photo → create issue if new → add this device's report.
import { NextResponse } from "next/server";
import { getUserFromRequest, supabaseAdmin } from "@/lib/supabase-server";
import { catInfo } from "@/lib/campus";
import { logEvent } from "@/lib/admin-server";
import { routeFor } from "@/lib/routing";
import { cleanRisk } from "@/lib/ai";
import type { NewIssueInput, Priority } from "@/lib/types";

export const maxDuration = 30;

const CATEGORY_ID = /^[a-z][a-z0-9_]{1,39}$/;
const ON_CAMPUS = (lat: number, lng: number) => lat > 34.012 && lat < 34.03 && lng > -118.3 && lng < -118.275;
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const MAX_BYTES = 1_500_000;

type Body = {
  imageBase64?: string;
  existingIssueId?: string;
  newIssue?: NewIssueInput;
  note?: string;
  aiSuggestion?: object;
  aiUsed?: boolean;
};

const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  let reporterId: string | null;
  try {
    reporterId = await getUserFromRequest(req);
  } catch {
    return bad(500, "Server is not configured");
  }
  if (!reporterId) return bad(401, "Sign-in required");

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.imageBase64) return bad(400, "imageBase64 is required");
  const photo = Buffer.from(body.imageBase64, "base64");
  if (photo.length === 0 || photo.length > MAX_BYTES) return bad(413, "Photo is empty or too large");
  if (!body.existingIssueId && !body.newIssue) return bad(400, "existingIssueId or newIssue is required");

  const db = supabaseAdmin();
  const reportId = crypto.randomUUID();
  let issueId = body.existingIssueId ?? "";
  let isNew = false;

  if (body.existingIssueId) {
    const { data: issue } = await db.from("issues").select("id, status").eq("id", issueId).maybeSingle();
    if (!issue) return bad(404, "Issue not found");
    const { data: dup } = await db.from("reports").select("id").eq("issue_id", issueId).eq("reporter_id", reporterId).maybeSingle();
    if (dup) return bad(409, "already_reported");
  } else {
    const n = body.newIssue!;
    const title = n.title?.trim().slice(0, 120);
    if (!title || title.length < 3) return bad(400, "Title is required");
    if (!CATEGORY_ID.test(n.category ?? "")) return bad(400, "Invalid category");

    // Location: existing row, or a campus building / spot sent by the app (validated, then saved)
    const { data: loc } = await db.from("locations").select("id").eq("id", n.locationId).maybeSingle();
    if (!loc) {
      const l = n.location;
      const ok = l && l.id === n.locationId && /^[\w-]{2,64}$/.test(l.id) && typeof l.name === "string" && l.name.trim().length > 1 && Number.isFinite(l.lat) && Number.isFinite(l.lng) && ON_CAMPUS(l.lat, l.lng);
      if (!ok) return bad(400, "Unknown location");
      const floors = Array.isArray(l.floors) ? l.floors.filter((f) => typeof f === "string" && f.length <= 4).slice(0, 30) : [];
      const { error } = await db.from("locations").upsert({ id: l.id, name: l.name.trim().slice(0, 80), lat: l.lat, lng: l.lng, floors }, { onConflict: "id", ignoreDuplicates: true });
      if (error) return bad(500, `Could not save location: ${error.message}`);
    }

    // Problem type: existing routing row, or a new one proposed by the AI
    const { data: route } = await db.from("routing").select("category").eq("category", n.category).maybeSingle();
    if (!route) {
      const { error } = await db.from("routing").upsert({ category: n.category, team_name: catInfo(n.category).team }, { onConflict: "category", ignoreDuplicates: true });
      if (error) return bad(500, `Could not save problem type: ${error.message}`);
    }
    issueId = crypto.randomUUID();
    isNew = true;
  }

  const photoPath = `${issueId}/${reportId}.jpg`;
  const up = await db.storage.from("report-photos").upload(photoPath, photo, { contentType: "image/jpeg", upsert: false });
  if (up.error) return bad(502, `Photo upload failed: ${up.error.message}`);

  let routed: { office: string; why: string } | null = null;
  if (isNew) {
    const n = body.newIssue!;
    routed = routeFor(n.category, n.locationId, n.floor); // P3: auto-route; status stays "open" = waiting for supervisor
    const { error } = await db.from("issues").insert({
      assigned_team: routed.office,
      id: issueId,
      location_id: n.locationId,
      floor: n.floor ?? null,
      category: n.category,
      title: n.title.trim().slice(0, 120),
      description: n.description?.trim().slice(0, 1000) || null,
      priority: PRIORITIES.includes(n.priority) ? n.priority : "medium",
      before_photo_path: photoPath,
    });
    if (error) {
      await db.storage.from("report-photos").remove([photoPath]);
      return bad(500, `Could not create issue: ${error.message}`);
    }
  }

  const { error: repErr } = await db.from("reports").insert({
    id: reportId,
    issue_id: issueId,
    reporter_id: reporterId,
    photo_path: photoPath,
    note: body.note?.slice(0, 500) ?? null,
    ai_suggestion: body.aiSuggestion ?? null,
    ai_used: body.aiUsed ?? false,
  });
  if (repErr) {
    await db.storage.from("report-photos").remove([photoPath]);
    if (repErr.code === "23505") return bad(409, "already_reported");
    return bad(500, `Could not save report: ${repErr.message}`);
  }

  if (routed) await logEvent(issueId, "Ripple", "rerouted", `Auto-routed to ${routed.office}`, { why: routed.why }).catch(() => {});

  // P3 Dispatch Copilot: save the AI triage risk + category confidence (separate, error-tolerant update so a
  // missing column or malformed suggestion never breaks a report).
  if (isNew && body.aiSuggestion && typeof body.aiSuggestion === "object") {
    const sug = body.aiSuggestion as { risk?: unknown; confidence?: unknown };
    const risk = cleanRisk(sug.risk);
    const conf = typeof sug.confidence === "number" && Number.isFinite(sug.confidence) ? Math.max(0, Math.min(1, sug.confidence)) : null;
    if (risk || conf !== null) {
      const { error: aiErr } = await db.from("issues").update({ ...(risk ? { ai_risk: risk } : {}), ...(conf !== null ? { ai_confidence: conf } : {}) }).eq("id", issueId);
      if (aiErr) console.warn("[api/reports] couldn't save AI risk:", aiErr.message);
    }
  }

  const { data: after } = await db.from("issues").select("reporter_count").eq("id", issueId).single();
  return NextResponse.json({ issueId, reporterCount: after?.reporter_count ?? 1 });
}
