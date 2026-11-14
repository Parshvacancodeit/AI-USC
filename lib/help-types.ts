// Help SC (Ask, Favors, Lost & Found): shared types + constants. Schema: supabase/help.sql.

export type HelpKind = "ask" | "favor" | "lost" | "found";
export const HELP_KINDS: HelpKind[] = ["ask", "favor", "lost", "found"];
export type HelpStatus = "open" | "resolved" | "closed";

/** How long a post stays live. */
export const EXPIRY_HOURS: Record<HelpKind, number> = { ask: 3, favor: 24, lost: 24 * 14, found: 24 * 14 };

/** Karma for the student whose reply resolved the post. */
export const HELP_KARMA: Record<HelpKind, number> = { ask: 5, favor: 15, lost: 20, found: 10 };

export interface HelpPost {
  id: string;
  kind: HelpKind;
  author_id: string;
  title: string;
  body: string | null;
  photo_path: string | null;
  location_id: string;
  location_name: string;
  lat: number;
  lng: number;
  floor: string | null;
  status: HelpStatus;
  resolved_reply_id: string | null;
  helper_id: string | null;
  reply_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface HelpReply {
  id: string;
  post_id: string;
  author_id: string;
  body: string | null;
  photo_path: string | null;
  created_at: string;
}

// ---------- API contracts ----------
export interface HelpLocationInput {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// POST /api/help/posts → 200 { id } | 422 HelpBlocked
export interface CreatePostRequest {
  kind: HelpKind;
  title: string;
  body?: string;
  imageBase64?: string; // JPEG, faces blurred on device, no data: prefix
  location: HelpLocationInput;
  floor?: string;
}

// POST /api/help/replies → 200 { id } | 422 HelpBlocked
export interface CreateReplyRequest {
  postId: string;
  body?: string;
  imageBase64?: string;
}

// POST /api/help/resolve → 200 { status }
export interface ResolveRequest {
  postId: string;
  action: "resolve" | "close" | "reopen";
  replyId?: string; // the reply that helped (resolve only)
}

/** 422 body when the safety check blocks a post or reply. */
export interface HelpBlocked {
  error: string; // reason to show the student
  blocked: true;
  emergency: boolean; // true → show "Call USC DPS 213-740-4321 or 911"
}
