// Help SC client: reads (anon key + RLS) and realtime from Supabase; writes through /api/help/*.
import { HandHelping, MessageCircleQuestion, PackageCheck, Search, type LucideIcon } from "lucide-react";
import { ApiError, authHeaders, browserClient, MOCK } from "./api";
import { LOCATIONS } from "./campus";
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

// ---------- Demo mode (until supabase/help.sql has been run) ----------
let demo = false;
/** True when the Help SC tables don't exist yet and sample posts are shown instead. */
export const isHelpDemo = () => demo;
const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /help_(posts|replies)/.test(e.message ?? ""));

function demoPosts(): HelpPost[] {
  const at = (name: string) => LOCATIONS.find((l) => l.name.startsWith(name)) ?? { id: "leavey", name, lat: 34.02178, lng: -118.28294 };
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const inH = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const mk = (id: string, kind: HelpKind, title: string, body: string | null, where: string, floor: string | null, min: number, replies: number, status: HelpPost["status"] = "open"): HelpPost => {
    const l = at(where);
    return { id, kind, author_id: `demo-author-${id}`, title, body, photo_path: null, location_id: l.id, location_name: l.name, lat: l.lat, lng: l.lng, floor, status, resolved_reply_id: status === "resolved" ? `${id}-r1` : null, helper_id: null, reply_count: replies, created_at: ago(min), updated_at: ago(min), expires_at: inH(kind === "ask" ? 2 : kind === "favor" ? 20 : 300) };
  };
  return [
    mk("demo-1", "ask", "How busy is Leavey 2nd floor right now?", "Looking for a table with an outlet for 2 hours.", "Leavey", "2", 6, 2),
    mk("demo-2", "favor", "Need a USB-C charger for 20 min", "Laptop at 4%, sitting by the windows.", "Salvatori Computer Science", "2", 12, 1),
    mk("demo-3", "found", "Found a set of keys with a Trojan lanyard", "Left them at the front desk.", "Wallis Annenberg", null, 40, 0),
    mk("demo-4", "lost", "Lost black AirPods case", "Probably near the bike racks outside, around noon.", "Grace Ford Salvatori", null, 125, 1),
    mk("demo-5", "ask", "Is the Ginsburg study lounge open tonight?", null, "Ginsburg", "1", 70, 1, "resolved"),
  ];
}
function demoReplies(postId: string): HelpReply[] {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const r = (n: number, body: string, min: number): HelpReply => ({ id: `${postId}-r${n}`, post_id: postId, author_id: `demo-helper-${postId}-${n}`, body, photo_path: null, created_at: ago(min) });
  const all: Record<string, HelpReply[]> = {
    "demo-1": [r(1, "About half full. Lots of open outlets along the windows.", 4), r(2, "Quiet zone is packed, group tables have space.", 2)],
    "demo-2": [r(1, "I have one! I'm at the table by the stairs, blue backpack.", 8)],
    "demo-4": [r(1, "Saw a black case on the bench by the GFS bike racks about an hour ago.", 30)],
    "demo-5": [r(1, "Yes, open until midnight. Just walked past.", 60)],
  };
  return all[postId] ?? [];
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
  if (missingTable(error)) {
    demo = true;
    return demoPosts();
  }
  if (error) throw new ApiError(500, error.message);
  demo = false;
  return data as HelpPost[];
}

export async function getPost(id: string): Promise<{ post: HelpPost | null; replies: HelpReply[] }> {
  if (id.startsWith("demo-")) {
    demo = true;
    return { post: demoPosts().find((p) => p.id === id) ?? null, replies: demoReplies(id) };
  }
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
  if (demo) throw new ApiError(503, "Demo mode: posting turns on once the Help SC database is set up.");
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
  return s.kind === "off_campus" || !s.location.id ? null : s;
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

// ---------- Sections (each is its own feed inside the Help SC tab) ----------
export type SectionId = "ask" | "favors" | "lost-found";
export type SectionMeta = {
  id: SectionId;
  title: string;
  blurb: string;
  kinds: HelpKind[];
  Icon: LucideIcon;
  tint: string;
  cta: string;
  newKind: HelpKind;
  empty: string;
};

export const SECTIONS: Record<SectionId, SectionMeta> = {
  ask: {
    id: "ask",
    title: "Ask",
    blurb: "Ask about a place. Trojans who are there answer.",
    kinds: ["ask"],
    Icon: MessageCircleQuestion,
    tint: "#0a84ff",
    cta: "Ask a question",
    newKind: "ask",
    empty: "No open questions. Ask how busy a place is, if it's open, or what's going on.",
  },
  favors: {
    id: "favors",
    title: "Favors",
    blurb: "Small help from students nearby. Earn karma for helping.",
    kinds: ["favor"],
    Icon: HandHelping,
    tint: "#30d158",
    cta: "Ask for a favor",
    newKind: "favor",
    empty: "No open favors. Need a charger, an umbrella or a hand with something?",
  },
  "lost-found": {
    id: "lost-found",
    title: "Lost & Found",
    blurb: "Lost something on campus, or found something?",
    kinds: ["lost", "found"],
    Icon: PackageCheck,
    tint: "#ffb020",
    cta: "Post an item",
    newKind: "lost",
    empty: "Nothing lost or found right now.",
  },
};
export const SECTION_ORDER: SectionId[] = ["ask", "favors", "lost-found"];
export const sectionOf = (k: HelpKind): SectionId => (k === "ask" ? "ask" : k === "favor" ? "favors" : "lost-found");

// ---------- Live feed extras ----------
/** Replies from the last few hours (for "latest reply" previews in the feed). */
export async function listRecentReplies(hours = 24): Promise<HelpReply[]> {
  if (MOCK || demo) return [];
  const { data } = await browserClient()
    .from("help_replies")
    .select("*")
    .gte("created_at", new Date(Date.now() - hours * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(300);
  return (data as HelpReply[]) ?? [];
}

export type RelatedItem = { postId: string; replyId: string | null; text: string; place: string; created_at: string; why: string };

/** AI-picked recent posts/replies that help with this post ([] on any failure). */
export async function fetchRelated(postId: string): Promise<RelatedItem[]> {
  if (MOCK || demo || postId.startsWith("demo-")) return [];
  try {
    const res = await fetch("/api/help/related", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ postId }) });
    if (!res.ok) return [];
    return ((await res.json()) as { items: RelatedItem[] }).items ?? [];
  } catch {
    return [];
  }
}

/** Short place name for compact UI. */
export const shortPlace = (n: string) => n.replace(/ of Letters, Arts and Sciences$/, "").replace(/ of Engineering/, "");

// ---------- Votes (Reddit-style). Server: /api/help/vote, schema: supabase/help_votes.sql ----------
const VOTE_KEY = "ripple-help-votes";
export function myVotes(): Record<string, 1 | -1> {
  try {
    return JSON.parse(localStorage.getItem(VOTE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
export async function votePost(postId: string, value: 1 | 0 | -1): Promise<number> {
  const all = myVotes();
  if (value === 0) delete all[postId];
  else all[postId] = value;
  try {
    localStorage.setItem(VOTE_KEY, JSON.stringify(all));
  } catch {}
  const r = await send<{ score: number }>("/api/help/vote", { postId, value });
  return r.score;
}
/** Score if the DB has votes set up (help_posts.score), else null → hide vote UI. */
export const scoreOf = (p: HelpPost) => ((p as HelpPost & { score?: number }).score ?? null);
/** Reddit-style "hot": score + replies, decayed by age. */
export function hot(p: HelpPost) {
  const s = (scoreOf(p) ?? 0) + p.reply_count * 0.6 + 1;
  const h = (Date.now() - +new Date(p.created_at)) / 3_600_000;
  return s / Math.pow(h + 2, 1.4);
}
