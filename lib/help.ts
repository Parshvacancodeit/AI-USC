// Help SC client: reads (anon key + RLS) and realtime from Supabase; writes through /api/help/*.
import { HandHelping, MessageCircleQuestion, PackageCheck, Search, type LucideIcon } from "lucide-react";
import { ApiError, authHeaders, browserClient, MOCK } from "./api";
import { locate, type Spot } from "./locate";
import type { CreatePostRequest, CreateReplyRequest, HelpBlocked, HelpKind, HelpPost, HelpReply, ResolveRequest } from "./help-types";

export type KindMeta = {
  label: string; // chip / filter
  noun: string; // "question"
  Icon: LucideIcon;
  tint: string;
  titleHint: string;
  bodyHint: string;
  replyHint: string;
  replyVerb: string; // button on the post
  doneLabel: string; // status chip when resolved
  creditLabel: string; // author button on a reply
  tip: string;
};

export const KIND: Record<HelpKind, KindMeta> = {
  ask: {
    label: "Ask",
    noun: "question",
    Icon: MessageCircleQuestion,
    tint: "#0a84ff",
    titleHint: "How busy is Leavey 2nd floor right now?",
    bodyHint: "Anything that helps people answer (optional)",
    replyHint: "Answer from where you are. A photo helps.",
    replyVerb: "Answer",
    doneLabel: "Answered",
    creditLabel: "Best answer",
    tip: "Questions stay live for 3 hours. Trojans nearby answer, often with a photo.",
  },
  favor: {
    label: "Favor",
    noun: "favor",
    Icon: HandHelping,
    tint: "#30d158",
    titleHint: "Need a USB-C charger for 20 min",
    bodyHint: "Where exactly, and for how long (optional)",
    replyHint: "Say how you can help and where to meet",
    replyVerb: "I can help",
    doneLabel: "Helped",
    creditLabel: "They helped",
    tip: "Small favors only. No money. Meet in public spots on campus.",
  },
  lost: {
    label: "Lost",
    noun: "lost item",
    Icon: Search,
    tint: "#ffb020",
    titleHint: "Lost black AirPods case",
    bodyHint: "Color, brand, when you last had it",
    replyHint: "Where did you see it?",
    replyVerb: "I've seen it",
    doneLabel: "Found",
    creditLabel: "They found it",
    tip: "Never post ID or card numbers. Check USC DPS Lost & Found too.",
  },
  found: {
    label: "Found",
    noun: "found item",
    Icon: PackageCheck,
    tint: "#bf5af2",
    titleHint: "Found a set of keys with a Trojan lanyard",
    bodyHint: "Where it is now (e.g. left at the front desk)",
    replyHint: "Describe it to prove it's yours (no ID numbers)",
    replyVerb: "It's mine",
    doneLabel: "Returned",
    creditLabel: "Returned to them",
    tip: "Hand valuables (wallets, IDs, phones) to the building front desk or DPS. Don't post identifying details.",
  },
};

export const DPS_PHONE = "213-740-4321";

export class HelpBlockedError extends ApiError {
  constructor(message: string, public emergency: boolean) {
    super(422, message);
  }
}

// ---------- Reads ----------
export function helpPhotoUrl(path: string | null) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/help-photos/${path}`;
}

export async function listPosts(): Promise<HelpPost[]> {
  if (MOCK) return [];
  const { data, error } = await browserClient()
    .from("help_posts")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new ApiError(500, error.message);
  return data as HelpPost[];
}

export async function getPost(id: string): Promise<{ post: HelpPost | null; replies: HelpReply[] }> {
  if (MOCK) return { post: null, replies: [] };
  const sb = browserClient();
  const [p, r] = await Promise.all([
    sb.from("help_posts").select("*").eq("id", id).maybeSingle(),
    sb.from("help_replies").select("*").eq("post_id", id).order("created_at", { ascending: true }),
  ]);
  if (p.error) throw new ApiError(500, p.error.message);
  return { post: (p.data as HelpPost) ?? null, replies: (r.data as HelpReply[]) ?? [] };
}

/** Live inserts/updates of posts, and new replies (optionally only for one post). Returns unsubscribe. */
export function subscribeHelp(cb: { post?: (p: HelpPost) => void; reply?: (r: HelpReply) => void }, postId?: string): () => void {
  if (MOCK) return () => {};
  const sb = browserClient();
  let ch = sb.channel(`help-${postId ?? "all"}-${Math.random().toString(36).slice(2, 8)}`);
  if (cb.post)
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table: "help_posts", ...(postId ? { filter: `id=eq.${postId}` } : {}) }, (e) => e.new && cb.post!(e.new as HelpPost));
  if (cb.reply)
    ch = ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "help_replies", ...(postId ? { filter: `post_id=eq.${postId}` } : {}) }, (e) => cb.reply!(e.new as HelpReply));
  ch.subscribe();
  return () => void sb.removeChannel(ch);
}

// ---------- Writes ----------
async function send<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "You're offline");
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 422 && (json as HelpBlocked).blocked) throw new HelpBlockedError(json.error, Boolean(json.emergency));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "Something went wrong");
  return json as T;
}

export const createPost = (req: CreatePostRequest) => send<{ id: string }>("/api/help/posts", req);
export const createReply = (req: CreateReplyRequest) => send<{ id: string }>("/api/help/replies", req);
export const resolvePost = (req: ResolveRequest) => send<{ status: string }>("/api/help/resolve", req);

// ---------- Location ----------
let posCache: { at: number; p: { lat: number; lng: number } | null } | null = null;

/** Phone position (cached 60 s). Null if denied/unavailable within 6 s. */
export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (posCache && Date.now() - posCache.at < 60_000) return Promise.resolve(posCache.p);
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const done = (p: { lat: number; lng: number } | null) => {
      posCache = { at: Date.now(), p };
      resolve(p);
    };
    navigator.geolocation.getCurrentPosition(
      (g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  });
}

/** Where the student is, as a campus spot (null if off campus / no GPS). */
export async function currentSpot(): Promise<Spot | null> {
  const p = await getPosition();
  if (!p) return null;
  const s = locate(p.lat, p.lng);
  return s.kind === "campus" ? null : s;
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

export function timeLeft(iso: string) {
  const ms = +new Date(iso) - Date.now();
  if (ms <= 0) return "Expired";
  const h = ms / 3600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min left` : h < 48 ? `${Math.round(h)} h left` : `${Math.round(h / 24)} days left`;
}
