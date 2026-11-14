// P3 — real-AI test (README §9 "Test early"): Prompt 1 on test photos + one duplicate check.
// USES THE ANTHROPIC API (1 call per photo + 1 for duplicates). Does nothing without --go.
//
//   node --no-warnings --env-file=.env.local scripts/test-ai.mjs          # dry run: shows the plan
//   node --no-warnings --env-file=.env.local scripts/test-ai.mjs --go     # real calls
//   ... --go --only=01.jpg,dup                                           # just some of them
//
// test-photos/ is git-excluded. Layout:
//   test-photos/photos.json  [{ file, location, expect }]
//   test-photos/small/<file> (≤ 300 KB JPEG, max 1280 px — same as the app's compression)
//   duplicate test: "dup": { "new": "06.jpg", "candidates": ["05.jpg", "07.jpg", "01.jpg"] } in test-photos/dup.json (optional)
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { analyzePhoto, categoryDef, DEFAULT_CATEGORIES, matchDuplicates } from "../lib/ai.ts";

const GO = process.argv.includes("--go");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(","); // e.g. --only=01.jpg,dup
const DIR = "test-photos";
const photos = JSON.parse(fs.readFileSync(path.join(DIR, "photos.json"), "utf8")).filter((p) => !ONLY || ONLY.includes(p.file));
const dupPath = path.join(DIR, "dup.json");
const dup = fs.existsSync(dupPath) && (!ONLY || ONLY.includes("dup")) ? JSON.parse(fs.readFileSync(dupPath, "utf8")) : null;
const b64 = (f) => fs.readFileSync(path.join(DIR, "small", f)).toString("base64");

// Categories exactly as the live route sees them (read-only)
let categories = DEFAULT_CATEGORIES;
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (url && key) {
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).from("routing").select("*");
  if (!error && data?.length) categories = data.map(categoryDef);
}
console.log(`model: ${process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"} | categories: ${categories.map((c) => c.id).join(", ")}`);
console.log(`plan: ${photos.length} analyze call(s)${dup ? " + 1 duplicate call" : ""}${GO ? "" : "  (DRY RUN, add --go to call the API)"}\n`);

for (const p of photos) {
  console.log(`■ ${p.file} @ ${p.location}\n  expect: ${p.expect}`);
  if (!GO) continue;
  const t0 = Date.now();
  try {
    const r = await analyzePhoto({ imageBase64: b64(p.file), locationName: p.location, categories });
    console.log(`  got:    ${r.is_issue ? "ISSUE" : "NOT AN ISSUE"} | ${r.category} | ${r.priority} | conf ${r.confidence}` +
      (r.suggested_new_category ? ` | suggests new: ${r.suggested_new_category.id} ("${r.suggested_new_category.label}")` : ""));
    console.log(`          "${r.title}" — ${r.description}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`  ERROR:  ${e.message}`);
  }
  console.log("");
}

if (dup) {
  console.log(`■ duplicates: new ${dup.new} vs ${dup.candidates.join(", ")}\n  expect: ${dup.expect ?? ""}`);
  if (GO) {
    try {
      const v = await matchDuplicates(b64(dup.new), dup.candidates.map((f) => ({ issue_id: f, imageBase64: b64(f) })));
      for (const m of v) console.log(`  ${m.issue_id}: ${m.same_issue && m.confidence >= 0.6 ? "MATCH" : "no match"} (same=${m.same_issue}, conf ${m.confidence}) — ${m.reason}`);
    } catch (e) {
      console.log(`  ERROR:  ${e.message}`);
    }
  }
}
