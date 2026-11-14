// P3 — POST /api/admin/verify-fix (README §8). Requires x-admin-passcode.
// Saves the after photo to resolution-photos/{issueId}.jpg, asks Claude to compare it with
// the before photo, stores the verdict. AI is advisory: if Claude is unavailable we still
// save the photo and return resolved=false with a reason, so the admin can confirm manually.
import { NextResponse } from "next/server";
import { verifyFix, type FixVerdict } from "@/lib/ai";
import { photoBase64, publicUrl, supabaseAdmin } from "@/lib/ai-storage";

export const maxDuration = 30;
const MAX_B64 = 4_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass || req.headers.get("x-admin-passcode") !== pass) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { issueId?: string; imageBase64?: string } | null;
  if (!body?.issueId || !UUID.test(body.issueId) || typeof body.imageBase64 !== "string" || body.imageBase64.length < 100) {
    return NextResponse.json({ error: "issueId (uuid) and imageBase64 are required" }, { status: 400 });
  }
  if (body.imageBase64.length > MAX_B64) return NextResponse.json({ error: "image too large" }, { status: 413 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const { data: issue, error } = await sb
      .from("issues")
      .select("id, title, description, before_photo_path, status")
      .eq("id", body.issueId)
      .maybeSingle();
    if (error) throw error;
    if (!issue) return NextResponse.json({ error: "issue not found" }, { status: 404 });

    const afterPath = `${issue.id}.jpg`;
    const up = await sb.storage
      .from("resolution-photos")
      .upload(afterPath, Buffer.from(body.imageBase64, "base64"), { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;
    const after_photo_url = `${publicUrl(sb, "resolution-photos", afterPath)}?v=${Date.now()}`;

    let verdict: FixVerdict;
    const before = issue.before_photo_path ? await photoBase64(sb, "report-photos", issue.before_photo_path) : null;
    if (!before) {
      verdict = { same_location: false, resolved: false, confidence: 0, reason: "No before photo to compare. Confirm manually." };
    } else {
      try {
        verdict = await verifyFix({ beforeBase64: before, afterBase64: body.imageBase64, title: issue.title, description: issue.description });
      } catch (err) {
        console.warn("[api/admin/verify-fix] AI unavailable:", err);
        verdict = { same_location: false, resolved: false, confidence: 0, reason: "AI check unavailable. Confirm manually." };
      }
    }

    const upd = await sb
      .from("issues")
      .update({ after_photo_path: afterPath, ai_fix_verdict: verdict, updated_at: new Date().toISOString() })
      .eq("id", issue.id);
    if (upd.error) throw upd.error;

    return NextResponse.json({ ...verdict, after_photo_url });
  } catch (err) {
    console.error("[api/admin/verify-fix]", err);
    return NextResponse.json({ error: "Something went wrong saving the after photo" }, { status: 500 });
  }
}
