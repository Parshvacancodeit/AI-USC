// P3 — POST /api/duplicates (README §8). Up to 3 candidates: same location + category,
// not resolved, created in the last 48 h. No candidates → [] without calling Gemini.
// If Supabase or Gemini is unavailable → { matches: [] } so the report still goes through as new.
import { NextResponse } from "next/server";
import { matchDuplicates } from "@/lib/ai";
import { photoBase64, publicUrl, supabaseAdmin } from "@/lib/ai-storage";
import type { DuplicateMatch, DuplicatesRequest } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<DuplicatesRequest> | null;
  if (!body || typeof body.imageBase64 !== "string" || !body.locationId || !body.category) {
    return NextResponse.json({ error: "imageBase64, locationId and category are required" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ matches: [] });

  try {
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: rows, error } = await sb
      .from("issues")
      .select("id, title, reporter_count, before_photo_path")
      .eq("location_id", body.locationId)
      .eq("category", body.category)
      .neq("status", "resolved")
      .gte("created_at", since)
      .not("before_photo_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) throw error;
    if (!rows?.length) return NextResponse.json({ matches: [] });

    const candidates = (
      await Promise.all(
        rows.map(async (r) => {
          const b64 = await photoBase64(sb, "report-photos", r.before_photo_path!);
          return b64 ? { issue_id: r.id as string, imageBase64: b64 } : null;
        }),
      )
    ).filter((c): c is { issue_id: string; imageBase64: string } => c !== null);
    if (!candidates.length) return NextResponse.json({ matches: [] });

    const verdicts = await matchDuplicates(body.imageBase64, candidates);
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    const matches: DuplicateMatch[] = verdicts.map((v) => {
      const r = byId.get(v.issue_id)!;
      return {
        ...v,
        title: r.title,
        reporter_count: r.reporter_count,
        photo_url: publicUrl(sb, "report-photos", r.before_photo_path!),
      };
    });
    return NextResponse.json({ matches });
  } catch (err) {
    console.warn("[api/duplicates] falling back to no matches:", err);
    return NextResponse.json({ matches: [] });
  }
}
