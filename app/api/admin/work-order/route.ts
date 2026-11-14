// P3 — POST /api/admin/work-order (README §8). Requires x-admin-passcode.
// Drafts a work order for the office that owns the issue's category. Claude writes it; if Claude
// is unavailable we return the same fields from a plain template with ai: false. Never 500s because of AI.
import { NextResponse } from "next/server";
import { templateWorkOrder, writeWorkOrder, type WorkOrder, type WorkOrderInput } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Category, Priority } from "@/lib/types";

export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass || req.headers.get("x-admin-passcode") !== pass) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { issueId?: string } | null;
  if (!body?.issueId || !UUID.test(body.issueId)) {
    return NextResponse.json({ error: "issueId (uuid) is required" }, { status: 400 });
  }

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let input: WorkOrderInput;
  let to: string | null;
  try {
    const { data: issue, error } = await db
      .from("issues")
      .select("id, title, description, category, priority, floor, reporter_count, created_at, status, locations(name)")
      .eq("id", body.issueId)
      .maybeSingle();
    if (error) throw error;
    if (!issue) return NextResponse.json({ error: "issue not found" }, { status: 404 });

    const [reports, routing] = await Promise.all([
      db.from("reports").select("note").eq("issue_id", issue.id).order("created_at", { ascending: false }).limit(10),
      db.from("routing").select("team_name, team_email").eq("category", issue.category).maybeSingle(),
    ]);
    if (reports.error) throw reports.error;
    if (routing.error) throw routing.error;

    const loc = issue.locations as unknown as { name: string } | { name: string }[] | null;
    const locationName = (Array.isArray(loc) ? loc[0]?.name : loc?.name) ?? "Unknown building";
    to = routing.data?.team_email ?? null;
    input = {
      teamName: routing.data?.team_name ?? "Facilities",
      locationName,
      floor: issue.floor,
      title: issue.title,
      description: issue.description,
      category: issue.category as Category,
      priority: issue.priority as Priority,
      reporterCount: issue.reporter_count,
      createdAt: issue.created_at,
      status: issue.status,
      notes: (reports.data ?? []).map((r) => r.note).filter((n): n is string => typeof n === "string" && n.trim() !== ""),
    };
  } catch (err) {
    console.error("[api/admin/work-order] db:", err);
    return NextResponse.json({ error: "Could not load the issue" }, { status: 500 });
  }

  let order: WorkOrder;
  let ai = true;
  try {
    order = await writeWorkOrder(input);
  } catch (err) {
    console.warn("[api/admin/work-order] AI unavailable, using template:", err);
    order = templateWorkOrder(input);
    ai = false;
  }
  return NextResponse.json({ ...order, to, team_name: input.teamName, ai });
}
