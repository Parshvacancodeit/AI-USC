// P3. Server only. Save an after photo and run Claude's before/after check (shared by /api/admin/verify-fix
// and the office page /api/fix/[token]). AI is advisory and never blocks: on failure the verdict says so.
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyFix, type FixVerdict } from "./ai";
import { photoBase64, publicUrl } from "./ai-storage";

export type FixCheck = FixVerdict & { after_photo_url: string; ai: boolean };

export async function saveAndCheckFix(
  db: SupabaseClient,
  issue: { id: string; title: string; description: string | null; before_photo_path: string | null },
  afterBase64: string,
): Promise<FixCheck> {
  const afterPath = `${issue.id}.jpg`;
  const up = await db.storage.from("resolution-photos").upload(afterPath, Buffer.from(afterBase64, "base64"), { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`Photo upload failed: ${up.error.message}`);
  const after_photo_url = `${publicUrl(db, "resolution-photos", afterPath)}?v=${Date.now()}`;

  let verdict: FixVerdict;
  let ai = false;
  const before = issue.before_photo_path ? await photoBase64(db, "report-photos", issue.before_photo_path) : null;
  if (!before) {
    verdict = { same_location: false, resolved: false, confidence: 0, reason: "No before photo to compare. Confirm manually." };
  } else {
    try {
      verdict = await verifyFix({ beforeBase64: before, afterBase64, title: issue.title, description: issue.description });
      ai = true;
    } catch (err) {
      console.warn("[fix-check] AI unavailable:", err);
      verdict = { same_location: false, resolved: false, confidence: 0, reason: "AI check unavailable. Confirm manually." };
    }
  }
  const upd = await db.from("issues").update({ after_photo_path: afterPath, ai_fix_verdict: verdict, updated_at: new Date().toISOString() }).eq("id", issue.id);
  if (upd.error) throw new Error(`Could not save verdict: ${upd.error.message}`);
  return { ...verdict, after_photo_url, ai };
}
