// P3 — POST /api/admin/work-order (README §8). Requires x-admin-passcode.
// Drafts a work order for the office that owns the issue's category. Claude writes it; if Claude
// is unavailable we return the same fields from a plain template with ai: false. Never 500s because of AI.
import { NextResponse } from "next/server";
import { categoryDef, templateWorkOrder, writeWorkOrder, type WorkOrder, type WorkOrderInput } from "@/lib/ai";
import { loadCategories } from "@/lib/ai-storage";
import { departmentFor } from "@/lib/departments";
import { routeFor } from "@/lib/routing";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Priority } from "@/lib/types";

export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass || req.headers.get("x-admin-passcode") !== pass) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { issueId?: string; office?: string } | null;
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
  let teamName: string | null = null;
  let deptName = "";
  try {
    const { data: issue, error } = await db
      .from("issues")
      .select("id, title, description, category, priority, floor, reporter_count, created_at, status, assigned_team, location_id, locations(name)")
      .eq("id", body.issueId)
      .maybeSingle();
    if (error) throw error;
    if (!issue) return NextResponse.json({ error: "issue not found" }, { status: 404 });

    const [reports, routing, categories] = await Promise.all([
      db.from("reports").select("note").eq("issue_id", issue.id).order("created_at", { ascending: false }).limit(10),
      db.from("routing").select("team_name, team_email").eq("category", issue.category).maybeSingle(),
      loadCategories(),
    ]);
    if (reports.error) throw reports.error;
    if (routing.error) throw routing.error;

    const loc = issue.locations as unknown as { name: string } | { name: string }[] | null;
    const locationName = (Array.isArray(loc) ? loc[0]?.name : loc?.name) ?? "Unknown building";
    // Office: supervisor's choice (body.office) > auto-routed assigned_team > routing rules. Demo email per department.
    const office = (typeof body.office === "string" && body.office.trim().slice(0, 80)) || issue.assigned_team || routeFor(issue.category, issue.location_id, issue.floor).office;
    const dept = departmentFor(office);
    to = dept.email;
    teamName = office;
    deptName = dept.name;
    const cat = categories.find((c) => c.id === issue.category) ?? categoryDef({ category: issue.category });
    input = {
      teamName: teamName ?? routing.data?.team_name ?? "Facilities",
      locationName,
      floor: issue.floor,
      title: issue.title,
      description: issue.description,
      category: issue.category,
      categoryLabel: cat.label,
      categoryDescription: cat.description,
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
  return NextResponse.json({ ...order, to, team_name: input.teamName, department: deptName, ai });
}
