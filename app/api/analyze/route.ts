// P3 — POST /api/analyze (README §8). 502 on AI failure → client shows the manual form.
// Categories come from the DB routing table; response may include suggested_new_category.
import { NextResponse } from "next/server";
import { AIUnavailableError, analyzePhoto } from "@/lib/ai";
import { loadCategories } from "@/lib/ai-storage";
import type { AnalyzeRequest } from "@/lib/types";

export const maxDuration = 30;
const MAX_B64 = 4_000_000; // ~3 MB image

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<AnalyzeRequest> | null;
  if (!body || typeof body.imageBase64 !== "string" || body.imageBase64.length < 100) {
    return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
  }
  if (body.imageBase64.length > MAX_B64) return NextResponse.json({ error: "image too large" }, { status: 413 });
  try {
    const result = await analyzePhoto({
      imageBase64: body.imageBase64,
      locationName: String(body.locationName ?? "USC campus").slice(0, 80),
      floor: body.floor ? String(body.floor).slice(0, 10) : undefined,
      note: body.note ? String(body.note).slice(0, 300) : undefined,
      categories: await loadCategories(),
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof AIUnavailableError ? err.message : "AI error";
    console.warn("[api/analyze]", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
