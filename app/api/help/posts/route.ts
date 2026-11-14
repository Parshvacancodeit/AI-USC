// POST /api/help/posts — create an Ask / Favor / Lost / Found post (README §8 Help SC).
// Signed-in (anonymous) students only. AI safety check first; 422 { blocked, emergency } if refused.
import { NextResponse } from "next/server";
import { moderateHelp } from "@/lib/ai";
import { EXPIRY_HOURS, HELP_KINDS, type CreatePostRequest } from "@/lib/help-types";
import { authed, bad, blocked, cleanText, decodePhoto, ON_CAMPUS, recentCount } from "@/lib/help-server";

export const maxDuration = 30;
const MAX_POSTS_PER_HOUR = 5;

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  const { db, userId } = a;

  const b = (await req.json().catch(() => null)) as Partial<CreatePostRequest> | null;
  if (!b || !HELP_KINDS.includes(b.kind as never)) return bad(400, "kind must be ask, favor, lost or found");
  const title = cleanText(b.title, 120);
  const body = cleanText(b.body, 600) || null;
  if (title.length < 3) return bad(400, "Add a short title");
  const l = b.location;
  if (!l || typeof l.id !== "string" || !/^[\w-]{2,64}$/.test(l.id) || typeof l.name !== "string" || !Number.isFinite(l.lat) || !Number.isFinite(l.lng) || !ON_CAMPUS(l.lat, l.lng))
    return bad(400, "Pick a spot on campus");
  const photo = decodePhoto(b.imageBase64);
  if (photo instanceof NextResponse) return photo;

  if ((await recentCount(db, "help_posts", userId)) >= MAX_POSTS_PER_HOUR) return bad(429, "You've posted a lot this hour. Try again later.");

  const verdict = await moderateHelp({ kind: b.kind!, context: "post", title, body: body ?? undefined, imageBase64: photo ? photo.toString("base64") : undefined });
  if (!verdict.allowed) return blocked(verdict.reason, verdict.emergency);

  const id = crypto.randomUUID();
  let photo_path: string | null = null;
  if (photo) {
    photo_path = `${id}.jpg`;
    const up = await db.storage.from("help-photos").upload(photo_path, photo, { contentType: "image/jpeg", upsert: false });
    if (up.error) return bad(502, `Photo upload failed: ${up.error.message}`);
  }
  const { error } = await db.from("help_posts").insert({
    id,
    kind: b.kind,
    author_id: userId,
    title,
    body,
    photo_path,
    location_id: l.id,
    location_name: cleanText(l.name, 120) || "USC campus",
    lat: l.lat,
    lng: l.lng,
    floor: cleanText(b.floor, 4) || null,
    expires_at: new Date(Date.now() + EXPIRY_HOURS[b.kind!] * 3600_000).toISOString(),
  });
  if (error) {
    if (photo_path) await db.storage.from("help-photos").remove([photo_path]);
    console.error("[api/help/posts]", error);
    return bad(500, "Could not save your post");
  }
  return NextResponse.json({ id });
}
