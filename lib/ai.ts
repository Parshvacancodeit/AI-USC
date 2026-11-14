// P3 — server only. Claude vision calls for README §9 (analyze, duplicate match, verify fix).
// Structured output via a forced tool call (the tool's input_schema = our JSON contract).
// Every function throws AIUnavailableError on any failure; routes turn it into 502 / [] so
// the client falls back. AI never blocks a report.
import Anthropic from "@anthropic-ai/sdk";
import type { AnalyzeResult, Category, Priority } from "./types";

export class AIUnavailableError extends Error {}

const CATEGORIES: Category[] = ["elevator_access", "broken_equipment", "tech"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
// Routes have maxDuration = 30 s. 12 s per attempt × (1 try + 1 retry) + backoff stays under it,
// so a slow Claude call ends as our clean 502 / [] fallback instead of a Vercel 504.
const TIMEOUT_MS = 12_000;

let client: Anthropic | null = null;
function setup() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AIUnavailableError("ANTHROPIC_API_KEY not set");
  client ??= new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  return { ai: client, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5" };
}

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: MediaType; data: string } };

/** Detect the real format from the first bytes; Claude rejects a mismatched media_type.
 *  Contract says JPEG, but stored photos or an un-recompressed upload may be PNG/WebP. */
function mediaType(b64: string): MediaType {
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR") && Buffer.from(b64.slice(0, 16), "base64").subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/jpeg";
}
const img = (raw: string): Block => {
  const data = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw; // tolerate a data: prefix
  return { type: "image", source: { type: "base64", media_type: mediaType(data), data } };
};
const txt = (text: string): Block => ({ type: "text", text });

/** One Claude call that must answer by calling `tool` with input matching `schema`. */
async function callJson<T>(content: Block[], tool: string, schema: Record<string, unknown>): Promise<T> {
  const { ai, model } = setup();
  try {
    const res = await ai.messages.create({
      model,
      max_tokens: 1024,
      tools: [{ name: tool, description: "Return the result.", input_schema: schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: tool },
      messages: [{ role: "user", content }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("no tool_use block");
    return block.input as T;
  } catch (err) {
    throw new AIUnavailableError(`Claude failed: ${(err as Error).message}`);
  }
}

const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

// ---------- Prompt 1: Analyze ----------
const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    is_issue: { type: "boolean" },
    category: { type: "string", enum: CATEGORIES },
    title: { type: "string" },
    description: { type: "string" },
    priority: { type: "string", enum: PRIORITIES },
    confidence: { type: "number" },
  },
  required: ["is_issue", "category", "title", "description", "priority", "confidence"],
};

export async function analyzePhoto(a: { imageBase64: string; locationName: string; floor?: string; note?: string }): Promise<AnalyzeResult> {
  const prompt = `You are triaging a photo that a USC student took of a campus facilities problem.
Location: ${a.locationName}, floor ${a.floor || "unknown"}. Student note: ${a.note || "none"}.

Decide whether the photo shows a campus facilities problem. If it does not
(e.g. a selfie, food, a random object), set is_issue to false.

Choose exactly one category:
- elevator_access: elevators, ramps, automatic doors, blocked accessible paths
- broken_equipment: lights, doors, furniture, water fountains, restrooms, leaks
- tech: printers, Wi-Fi, screens/projectors, charging stations

Priority:
- urgent: safety hazard, or blocks access for wheelchair users
- high: blocks use of a shared space or service
- medium: degraded but still usable
- low: cosmetic

Write a title of at most 8 words and a description of at most 2 sentences.
Describe only what is visible. Never describe or identify people.
Set confidence between 0 and 1.`;
  const o = await callJson<AnalyzeResult>([img(a.imageBase64), txt(prompt)], "report_triage", ANALYZE_SCHEMA);
  if (!CATEGORIES.includes(o.category) || !PRIORITIES.includes(o.priority)) {
    throw new AIUnavailableError("unexpected category/priority");
  }
  return {
    is_issue: Boolean(o.is_issue),
    category: o.category,
    title: str(o.title, 80),
    description: str(o.description, 400),
    priority: o.priority,
    confidence: clamp01(o.confidence),
  };
}

// ---------- Prompt 2: Duplicate match ----------
export type DupVerdict = { issue_id: string; same_issue: boolean; confidence: number; reason: string };

const DUP_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue_id: { type: "string" },
          same_issue: { type: "boolean" },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["issue_id", "same_issue", "confidence", "reason"],
      },
    },
  },
  required: ["matches"],
};

export async function matchDuplicates(newImage: string, candidates: { issue_id: string; imageBase64: string }[]): Promise<DupVerdict[]> {
  const content: Block[] = [
    txt(`The FIRST image is a new report. The following images are existing open reports,
each labeled with its issue_id.

For each existing report, decide whether the new photo shows the SAME physical
problem — the same object or spot with the same fault — not merely the same
category or the same building. Different elevators, different printers or
different restrooms are NOT the same issue.

Return one entry per existing report with issue_id, same_issue, confidence (0–1)
and a one-sentence reason.`),
    txt("NEW REPORT:"),
    img(newImage),
  ];
  for (const c of candidates) content.push(txt(`issue_id: ${c.issue_id}`), img(c.imageBase64));
  const o = await callJson<{ matches: DupVerdict[] }>(content, "duplicate_verdicts", DUP_SCHEMA);
  const ids = new Set(candidates.map((c) => c.issue_id));
  return (o.matches ?? [])
    .filter((m) => ids.has(m.issue_id)) // only trust ids we sent
    .map((m) => ({ issue_id: m.issue_id, same_issue: Boolean(m.same_issue), confidence: clamp01(m.confidence), reason: str(m.reason, 200) }));
}

// ---------- Prompt 3: Verify fix ----------
export type FixVerdict = { same_location: boolean; resolved: boolean; confidence: number; reason: string };

const FIX_SCHEMA = {
  type: "object",
  properties: {
    same_location: { type: "boolean" },
    resolved: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["same_location", "resolved", "confidence", "reason"],
};

export async function verifyFix(a: { beforeBase64: string; afterBase64: string; title: string; description?: string | null }): Promise<FixVerdict> {
  const prompt = `Image 1 is the BEFORE photo of a reported campus problem: "${a.title}" — ${a.description || "no description"}.
Image 2 is the AFTER photo uploaded by the responsible office.

1. same_location: does the after photo show the same place/object as the before photo?
2. resolved: is the reported problem visibly fixed in the after photo?
Be strict: if the after photo is unclear or shows a different place, resolved = false.
Give confidence (0–1) and a one-sentence reason.`;
  const o = await callJson<FixVerdict>([img(a.beforeBase64), img(a.afterBase64), txt(prompt)], "fix_verdict", FIX_SCHEMA);
  const same = Boolean(o.same_location);
  return { same_location: same, resolved: same && Boolean(o.resolved), confidence: clamp01(o.confidence), reason: str(o.reason, 200) };
}
