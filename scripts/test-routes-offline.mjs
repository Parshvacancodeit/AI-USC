// P3 — offline test of the AI routes' contracts and fallbacks. Makes NO Claude calls and NO DB writes.
// 1) npm run build
// 2) ANTHROPIC_API_KEY=offline ANTHROPIC_BASE_URL=http://127.0.0.1:9 ADMIN_PASSCODE=offline-test npx next start -p 3100
//    (shell env beats .env.local, so Claude is pointed at a dead port; Supabase from .env.local is read-only here)
// 3) node scripts/test-routes-offline.mjs [http://localhost:3100]
const BASE = process.argv[2] ?? "http://localhost:3100";
const PASS = "offline-test";
const IMG = "/9j/" + "A".repeat(200); // looks like JPEG base64; never reaches Claude

let failed = 0;
async function check(name, path, { body, headers = {}, raw }, expectStatus, expectBody) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  const ok = res.status === expectStatus && (!expectBody || expectBody(json));
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(res.status).padEnd(3)} ${String(Date.now() - t0).padStart(5)}ms  ${name}${ok ? "" : "  → " + JSON.stringify(json)}`);
}

// /api/analyze — 400 bad input, 413 too big, 502 when AI is down (client shows manual form)
await check("analyze: not JSON", "/api/analyze", { raw: "nope" }, 400);
await check("analyze: missing image", "/api/analyze", { body: { locationName: "Leavey Library" } }, 400);
await check("analyze: image too large", "/api/analyze", { body: { imageBase64: "A".repeat(4_000_001) } }, 413);
await check("analyze: AI down → 502 + error", "/api/analyze",
  { body: { imageBase64: IMG, mimeType: "image/jpeg", locationName: "Leavey Library", floor: "2" } },
  502, (j) => typeof j?.error === "string");

// /api/duplicates — 400 bad input; no candidates → { matches: [] } without calling AI
await check("duplicates: missing fields", "/api/duplicates", { body: { imageBase64: IMG } }, 400);
await check("duplicates: no candidates → []", "/api/duplicates",
  { body: { imageBase64: IMG, mimeType: "image/jpeg", locationId: "leavey", category: "tech" } },
  200, (j) => Array.isArray(j?.matches) && j.matches.length === 0);

// /api/admin/verify-fix — 401 without passcode, 400 bad id, 404 unknown issue (no upload happens)
const id = "00000000-0000-4000-8000-000000000000";
await check("verify-fix: no passcode", "/api/admin/verify-fix", { body: { issueId: id, imageBase64: IMG } }, 401);
await check("verify-fix: wrong passcode", "/api/admin/verify-fix", { body: { issueId: id, imageBase64: IMG }, headers: { "x-admin-passcode": "wrong" } }, 401);
await check("verify-fix: bad issueId", "/api/admin/verify-fix", { body: { issueId: "abc", imageBase64: IMG }, headers: { "x-admin-passcode": PASS } }, 400);
await check("verify-fix: unknown issue → 404", "/api/admin/verify-fix", { body: { issueId: id, imageBase64: IMG }, headers: { "x-admin-passcode": PASS } }, 404);

// /api/admin/work-order — 401 without passcode, 400 without issueId
await check("work-order: no passcode", "/api/admin/work-order", { body: { issueId: id } }, 401);
await check("work-order: missing issueId", "/api/admin/work-order", { body: {}, headers: { "x-admin-passcode": PASS } }, 400);

console.log(failed ?`\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
