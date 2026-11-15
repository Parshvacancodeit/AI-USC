// P3 — POST /api/admin/verify-fix (README §8). Staff only (x-admin-passcode).
// Saves the after photo to resolution-photos/{issueId}.jpg and stores Claude's before/after verdict.
// AI is advisory: if Claude is unavailable the photo is still saved and resolved=false says "confirm manually".
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { saveAndCheckFix } from "@/lib/fix-check";
import { supabaseAdmin } from "@/lib/ai-storage";

export const maxDuration = 30;
const MAX_B64 = 4_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = (await req.json().catch(() => null)) as { issueId?: string; imageBase64?: string } | null;
  if (!body?.issueId || !UUID.test(body.issueId) || typeof body.imageBase64 !== "string" || body.imageBase64.length < 100) {
    return NextResponse.json({ error: "issueId (uuid) and imageBase64 are required" }, { status: 400 });
  }
  if (body.imageBase64.length > MAX_B64) return NextResponse.json({ error: "image too large" }, { status: 413 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data: issue, error } = await sb.from("issues").select("id, title, description, before_photo_path").eq("id", body.issueId).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load the issue" }, { status: 500 });
  if (!issue) return NextResponse.json({ error: "issue not found" }, { status: 404 });
  try {
    const r = await saveAndCheckFix(sb, issue, body.imageBase64.replace(/^data:[^,]+,/, ""));
    const { ai: _ai, ...out } = r;
    void _ai;
    return NextResponse.json(out);
  } catch (err) {
    console.error("[api/admin/verify-fix]", err);
    return NextResponse.json({ error: "Something went wrong saving the after photo" }, { status: 500 });
  }
}
