// POST /api/reports (README §8): save photo → create issue if new → add this device's report.
import { NextResponse } from "next/server";
import { getUserFromRequest, supabaseAdmin } from "@/lib/supabase-server";
import type { Category, NewIssueInput, Priority } from "@/lib/types";

export const maxDuration = 30;

const CATEGORIES: Category[] = ["elevator_access", "broken_equipment", "tech"];
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
    if (!CATEGORIES.includes(n.category)) return bad(400, "Unknown category");
    const { data: loc } = await db.from("locations").select("id, floors").eq("id", n.locationId).maybeSingle();
    if (!loc) return bad(400, "Unknown location");
    issueId = crypto.randomUUID();
    isNew = true;
  }

  const photoPath = `${issueId}/${reportId}.jpg`;
  const up = await db.storage.from("report-photos").upload(photoPath, photo, { contentType: "image/jpeg", upsert: false });
  if (up.error) return bad(502, `Photo upload failed: ${up.error.message}`);

  if (isNew) {
    const n = body.newIssue!;
    const { error } = await db.from("issues").insert({
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

  const { data: after } = await db.from("issues").select("reporter_count").eq("id", issueId).single();
  return NextResponse.json({ issueId, reporterCount: after?.reporter_count ?? 1 });
}
