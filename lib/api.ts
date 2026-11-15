// P1 client data layer. Screens call ONLY these functions.
// Each one uses the real API route / Supabase when it exists, and a labeled MOCK otherwise,
// so the UI works end to end before P2 and P3 land their pieces.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, getLocation, locationName, registerLocations, registerRouting } from "./campus";
import { blurFaces as realBlur, preloadFaceDetector } from "./faceBlur";
import type {
  Location,
  AnalyzeRequest,
  AnalyzeResult,
  DuplicateMatch,
  DuplicatesRequest,
  Issue,
  ReportRequest,
  ReportResponse,
} from "./types";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** MOCK = no Supabase configured yet. Reads/writes go to a local demo store. */
export const MOCK = !SUPA_URL || !SUPA_ANON || process.env.NEXT_PUBLIC_USE_MOCK === "1";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- Supabase (real mode) ----------
// TODO(P2): swap for lib/supabase-browser.ts when it lands.
let sb: SupabaseClient | null = null;
function supa() {
  if (!sb) sb = createClient(SUPA_URL!, SUPA_ANON!);
  return sb;
}
async function accessToken(): Promise<string> {
  const { data } = await supa().auth.getSession();
  if (data.session) return data.session.access_token;
  const res = await supa().auth.signInAnonymously();
  if (res.error || !res.data.session) throw new ApiError(401, "Could not start a session");
  return res.data.session.access_token;
}
export async function ensureSession() {
  if (!MOCK) await accessToken();
}

export function photoUrl(path: string | null, bucket = "report-photos"): string | null {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("http")) return path;
  return `${SUPA_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ---------- Images ----------
// TODO(P3): swap for lib/image.ts + lib/faceBlur.ts when they land.
export async function prepareImage(file: File): Promise<{ dataUrl: string; base64: string }> {
  // Canvas resize: fast on iPhone (no web worker, no library). Max 1280px, JPEG ~0.8.
  const bmp = await loadImage(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.82;
  let dataUrl = c.toDataURL("image/jpeg", q);
  while (dataUrl.length > 400_000 && q > 0.45) dataUrl = c.toDataURL("image/jpeg", (q -= 0.12));
  return { dataUrl, base64: dataUrl.split(",")[1] };
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** P3's on-device MediaPipe blur, capped so the UI never hangs (model preloads on app start). */
export async function blurFaces(dataUrl: string): Promise<{ dataUrl: string; facesBlurred: number }> {
  const fallback = new Promise<{ dataUrl: string; facesBlurred: number }>((r) => setTimeout(() => r({ dataUrl, facesBlurred: -1 }), 3000));
  return Promise.race([realBlur(dataUrl), fallback]);
}
export { preloadFaceDetector };

// ---------- Routes ----------
async function post<T>(path: string, body: unknown, mock: () => Promise<T>, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "You're offline");
  }
  if (res.status === 404) return mock(); // route not built yet
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "Something went wrong");
  return json as T;
}

export function analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
  return post("/api/analyze", req, async () => {
    await wait(1800); // MOCK
    return {
      is_issue: true,
      category: "elevator_access",
      title: `Elevator out of service at ${req.locationName}`,
      description: "\"Out of Order\" sign posted on the elevator doors. Students using wheelchairs or crutches have no way to upper floors.",
      priority: "high",
      confidence: 0.91,
    };
  });
}

export async function findDuplicates(req: DuplicatesRequest): Promise<DuplicateMatch[]> {
  const mock = async () => {
    await wait(900);
    const cutoff = Date.now() - 48 * 3600 * 1000;
    return {
      matches: readStore()
        .filter((i) => i.location_id === req.locationId && i.category === req.category && i.status !== "resolved" && +new Date(i.created_at) > cutoff)
        .slice(0, 3)
        .map((i) => ({
          issue_id: i.id,
          same_issue: true,
          confidence: 0.84,
          reason: "Same sign at the same spot in both photos",
          title: i.title,
          reporter_count: i.reporter_count,
          photo_url: photoUrl(i.before_photo_path) ?? "",
        })),
    };
  };
  const out = MOCK ? await mock() : await post<{ matches: DuplicateMatch[] }>("/api/duplicates", req, mock);
  return out.matches.filter((m) => m.same_issue && m.confidence >= 0.6);
}

export async function submitReport(req: ReportRequest): Promise<ReportResponse> {
  if (MOCK) return mockSubmit(req);
  const token = await accessToken();
  const out = await post<ReportResponse>("/api/reports", req, () => mockSubmit(req), { Authorization: `Bearer ${token}` });
  if ("newIssue" in req && req.newIssue.location) registerLocations([req.newIssue.location]);
  addMyIssue(out.issueId);
  return out;
}

// ---------- Reads + realtime ----------
let catalogLoaded: Promise<void> | null = null;
/** Loads the DB's locations + problem types into the campus registry (once). */
export function loadCatalog(): Promise<void> {
  if (MOCK) {
    try {
      registerLocations(JSON.parse(localStorage.getItem(LOC_KEY) ?? "[]"));
    } catch {}
    return Promise.resolve();
  }
  catalogLoaded ??= Promise.all([
    supa().from("locations").select("id,name,lat,lng,floors"),
    supa().from("routing").select("category,team_name"),
  ]).then(([l, r]) => {
    if (l.data) registerLocations(l.data as Location[]);
    if (r.data) registerRouting(r.data as { category: string; team_name: string }[]);
  });
  return catalogLoaded;
}

/** Fetches any locations the registry doesn't know yet (e.g. a spot someone just reported). */
async function ensureLocations(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => !getLocation(id));
  if (MOCK || missing.length === 0) return;
  const { data } = await supa().from("locations").select("id,name,lat,lng,floors").in("id", missing);
  if (data) registerLocations(data as Location[]);
}

export async function listIssues(): Promise<Issue[]> {
  await loadCatalog().catch(() => {});
  if (MOCK) return readStore();
  const { data, error } = await supa().from("issues").select("*").order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  await ensureLocations((data as Issue[]).map((i) => i.location_id)).catch(() => {});
  return data as Issue[];
}

/** All reports (for karma + leaderboard). */
export async function listReports(): Promise<{ issue_id: string; reporter_id: string; created_at: string }[]> {
  if (MOCK) return readStore().flatMap((i) => Array.from({ length: i.reporter_count }, (_, k) => ({ issue_id: i.id, reporter_id: myIssueIds().includes(i.id) && k === 0 ? "me" : `demo-${(i.id.length + k) % 7}`, created_at: i.created_at })));
  const { data } = await supa().from("reports").select("issue_id,reporter_id,created_at");
  return data ?? [];
}

/** This device's reporter id (Supabase anonymous user id). */
export async function myReporterId(): Promise<string> {
  if (MOCK) return "me";
  await accessToken();
  const { data } = await supa().auth.getSession();
  return data.session?.user.id ?? "";
}

export async function getIssue(id: string): Promise<Issue | null> {
  if (MOCK) return readStore().find((i) => i.id === id) ?? null;
  await loadCatalog().catch(() => {});
  const { data } = await supa().from("issues").select("*").eq("id", id).maybeSingle();
  if (data) await ensureLocations([(data as Issue).location_id]).catch(() => {});
  return (data as Issue) ?? null;
}

/** Calls back with every inserted/updated issue. Returns unsubscribe. */
export function subscribeIssues(cb: (issue: Issue) => void): () => void {
  if (MOCK) {
    const local = (e: Event) => cb((e as CustomEvent<Issue>).detail);
    const cross = (e: StorageEvent) => {
      if (e.key !== STORE_KEY || !e.newValue) return;
      const before = new Map<string, string>((JSON.parse(e.oldValue ?? "[]") as Issue[]).map((i) => [i.id, i.updated_at]));
      (JSON.parse(e.newValue) as Issue[]).forEach((i) => before.get(i.id) !== i.updated_at && cb(i));
    };
    window.addEventListener("ripple:issue", local);
    window.addEventListener("storage", cross);
    return () => {
      window.removeEventListener("ripple:issue", local);
      window.removeEventListener("storage", cross);
    };
  }
  const ch = supa()
    .channel(`issues-${Math.random().toString(36).slice(2)}`) // unique: several screens listen at once
    .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, (p) => {
      const issue = p.new as Issue;
      if (!issue?.id) return;
      ensureLocations([issue.location_id]).catch(() => {}).finally(() => cb(issue));
    })
    .subscribe();
  return () => void supa().removeChannel(ch);
}

// ---------- "My issues" (this device) ----------
const MY_KEY = "ripple-my-issues";
export function myIssueIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MY_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function addMyIssue(id: string) {
  const ids = myIssueIds();
  if (!ids.includes(id)) localStorage.setItem(MY_KEY, JSON.stringify([id, ...ids]));
}

// ---------- MOCK store (localStorage, syncs across tabs) ----------
const STORE_KEY = "ripple-demo-issues";
const LOC_KEY = "ripple-demo-locations";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();

function seed(): Issue[] {
  const base = { floor: null, description: null, after_photo_path: null, resolution_note: null, resolved_at: null, before_photo_path: null };
  return [
    { ...base, id: "demo-1", location_id: "leavey", floor: "2", category: "elevator_access", title: "Leavey elevator stuck on B level", description: "Doors won't open; sign says out of order.", priority: "high", status: "open", assigned_team: null, reporter_count: 4, created_at: ago(95), updated_at: ago(20) },
    { ...base, id: "demo-2", location_id: "ginsburg", floor: "1", category: "tech", title: "Lobby printer jammed", priority: "medium", status: "assigned", assigned_team: CATEGORIES.tech.team, reporter_count: 2, created_at: ago(300), updated_at: ago(60) },
    { ...base, id: "demo-3", location_id: "parkside", floor: "1", category: "broken_equipment", title: "Water fountain not working", priority: "low", status: "resolved", assigned_team: CATEGORIES.broken_equipment.team, reporter_count: 3, created_at: ago(1500), updated_at: ago(120), resolved_at: ago(120) },
  ];
}

function readStore(): Issue[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = seed();
  writeStore(s);
  return s;
}
function writeStore(list: Issue[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // quota: drop stored photos from older issues and retry
    localStorage.setItem(STORE_KEY, JSON.stringify(list.map((i, n) => (n > 2 ? { ...i, before_photo_path: null } : i))));
  }
}
function upsert(issue: Issue) {
  const list = readStore();
  const idx = list.findIndex((i) => i.id === issue.id);
  if (idx >= 0) list[idx] = issue;
  else list.unshift(issue);
  writeStore(list);
  window.dispatchEvent(new CustomEvent("ripple:issue", { detail: issue }));
}

async function mockSubmit(req: ReportRequest): Promise<ReportResponse> {
  await wait(900);
  const now = new Date().toISOString();
  let issue: Issue;
  if ("existingIssueId" in req) {
    if (myIssueIds().includes(req.existingIssueId)) throw new ApiError(409, "already_reported");
    const cur = readStore().find((i) => i.id === req.existingIssueId);
    if (!cur) throw new ApiError(404, "Issue not found");
    issue = { ...cur, reporter_count: cur.reporter_count + 1, updated_at: now };
  } else {
    const n = req.newIssue;
    if (n.location) {
      registerLocations([n.location]);
      try {
        const saved: Location[] = JSON.parse(localStorage.getItem(LOC_KEY) ?? "[]");
        localStorage.setItem(LOC_KEY, JSON.stringify([n.location, ...saved.filter((x) => x.id !== n.location!.id)].slice(0, 50)));
      } catch {}
    }
    issue = {
      id: `demo-${Date.now()}`,
      location_id: n.locationId,
      floor: n.floor ?? null,
      category: n.category,
      title: n.title,
      description: n.description ?? null,
      priority: n.priority,
      status: "open",
      assigned_team: null,
      reporter_count: 1,
      before_photo_path: `data:image/jpeg;base64,${req.imageBase64}`,
      after_photo_path: null,
      resolution_note: null,
      created_at: now,
      updated_at: now,
      resolved_at: null,
    };
  }
  upsert(issue);
  addMyIssue(issue.id);
  return { issueId: issue.id, reporterCount: issue.reporter_count };
}

/** MOCK-only demo controls (stand in for P2's admin dashboard). */
export function mockAdvance(id: string) {
  const cur = readStore().find((i) => i.id === id);
  if (!cur || cur.status === "resolved") return;
  const now = new Date().toISOString();
  upsert(
    cur.status === "open"
      ? { ...cur, status: "assigned", assigned_team: CATEGORIES[cur.category].team, updated_at: now }
      : { ...cur, status: "resolved", resolved_at: now, updated_at: now, resolution_note: "Repaired by facilities staff" },
  );
}
export function mockReset() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(MY_KEY);
  localStorage.removeItem(LOC_KEY);
  localStorage.removeItem("ripple-notified");
  location.reload();
}

export const describeLocation = (i: Pick<Issue, "location_id" | "floor">) =>
  `${locationName(i.location_id)}${!i.floor ? "" : i.floor === "Outside" ? " · Outside" : i.floor === "B" ? " · Basement" : ` · Floor ${i.floor}`}`;

// ---------- Session helpers (shared with Help SC, lib/help.ts) ----------
/** Browser Supabase client (anon key): public reads + Realtime. */
export const browserClient = () => supa();
/** `Authorization` header for our API routes (starts an anonymous session if needed). */
export async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await accessToken()}` };
}
/** This device's anonymous user id, or null before a session exists. */
export async function myUserId(): Promise<string | null> {
  if (MOCK) return null;
  const { data } = await supa().auth.getSession();
  return data.session?.user.id ?? null;
}
