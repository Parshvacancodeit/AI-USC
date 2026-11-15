// P3. Server only. One-time office links: the raw token goes in the email; only its sha256 is stored (fix_tokens).
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_DAYS = 7;
export const newToken = () => randomBytes(24).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t);

/** Public base URL for links: APP_URL, else the request's own origin. */
export function appUrl(req: Request) {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
}
