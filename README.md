# Ripple — 24-hour build plan

**AI@USC Hackathon, Nov 14–15, 2026.** This is the only plan. If you change a shared contract (schema, API, types), update this file and tell the team.

**Ripple:** students photograph a campus problem, confirm what others already reported, the right team fixes it, and everyone who reported it gets "Fixed."

---

## 1. Deadlines and rules

| When (PT) | What |
|---|---|
| Sun **2:00 AM** | Feature freeze: bug fixes, phone testing, seed data, demo prep only |
| Sun **9:00 AM** | Participant check-in deadline |
| Sun **10:30 AM** | **We submit** (Devpost deadline is 11:00 AM) |
| Sun 11 AM–2 PM | First-round judging; top 10 pitch 3:00–4:30 PM (3 min max) |

**Devpost needs:** description (problem, solution, tech stack, challenges, future goals) · prototype link · demo video ≤ 3 min · slide deck · ≥ 1 screenshot · all teammates added.

**Rules:**
1. All code and assets are created during Nov 14–15. Open-source libraries and public APIs are fine. No code from earlier projects.
2. **AI never blocks a report.** If the AI call fails or times out, the student picks the category manually.
3. **Never commit secrets.** Keys live in `.env.local` and Vercel environment settings only.
4. Anything mocked is labeled in the UI (e.g. "Demo office dashboard").

**Judging:** Impact 30% · Technical & AI 25% · Feasibility 25% · UX 20%.

---

## 2. What we build

### The one loop that must work
**Report → AI description → duplicate confirmation → team assignment → after-photo resolution → "Fixed" notification**

**Done means:** two phones report the same problem → both join one issue (reporter count = 2) → admin assigns it → admin uploads an after photo, AI checks it, admin confirms → **both phones show "Fixed"**. Works repeatedly on the deployed Vercel URL.

**Coverage:** 3 categories (§5) · 3–5 seeded campus locations.

### In scope
- Photo capture with on-device face blur + preview
- Location: nearest seeded building from GPS; student confirms building and floor
- AI suggests title, category, description, priority; student can edit
- Duplicate suggestion; student taps "Same issue" or "New issue"
- Live map with status colors and reporter counts
- Demo office dashboard (labeled "Demo") with category-based assignment
- Before/after AI check; admin confirms resolution
- In-app "Fixed" notification while the app is open

### Out of scope (do not build)
3D buildings · login/SSO · push notifications · manual redaction tool · model training · native app · state libraries · Ask / Help / Lost & Found / Lantern (roadmap slide only, unless §12 gate is met)

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind | UI and API routes in one app |
| Hosting | **Vercel** | HTTPS is required for camera + GPS on phones |
| Database | **Supabase Postgres** | |
| Live updates | **Supabase Realtime** (`postgres_changes`) on `issues` | |
| Photo storage | **Supabase Storage** | Public buckets `report-photos`, `resolution-photos` (faces blurred before upload) |
| Identity | **Supabase anonymous sign-in** | One ID per device = one reporter |
| AI | **Claude** (vision) via `@anthropic-ai/sdk` | Server only; JSON via a forced tool call; model id in `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) |
| Face blur | `@mediapipe/tasks-vision` FaceDetector | In the browser before upload; pixelate (§9) |
| Map | MapLibre GL JS + OpenFreeMap | Style `https://tiles.openfreemap.org/styles/liberty`, no key |
| Camera | `<input type="file" accept="image/*" capture="environment">` | Works on iOS and Android |
| Compression | `browser-image-compression` | ≤ 300 KB, max 1280 px, JPEG |

```bash
npm i @supabase/supabase-js @anthropic-ai/sdk @mediapipe/tasks-vision maplibre-gl browser-image-compression
```

### Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only
ANTHROPIC_API_KEY=              # server only
ANTHROPIC_MODEL=claude-sonnet-5-5
ADMIN_PASSCODE=                 # server only
```

### Setup (first hour)
- [ ] Next.js app → this repo → Vercel; camera works on a real phone over HTTPS
- [ ] Supabase: Authentication → Providers → **enable Anonymous sign-ins**
- [ ] Supabase Storage: create **public** buckets `report-photos` and `resolution-photos`
- [ ] Run `supabase/schema.sql`, then `supabase/seed.sql` in the SQL editor; confirm Realtime is on for `issues`
- [ ] Add env vars to `.env.local` and Vercel

---

## 4. Architecture

```
Phone (Next.js client)
 ├─ anonymous sign-in (Supabase) → user id = reporter_id
 ├─ camera → compress → face blur → preview
 ├─ POST /api/analyze     → AI suggestion
 ├─ POST /api/duplicates  → candidate matches
 ├─ POST /api/reports     → save photo + issue/report rows
 └─ Realtime subscription on `issues` → map + "Fixed" toast

Admin (/admin, passcode)
 ├─ POST /api/admin/assign
 ├─ POST /api/admin/verify-fix  → AI before/after verdict
 └─ POST /api/admin/resolve

Server (Next.js API routes)
 ├─ Supabase service-role client (all writes)
 └─ Claude (vision)
```

Clients only **read** from Supabase (and receive Realtime). **All writes go through API routes** with the service-role key, so RLS stays simple and no storage upload policies are needed.

```
app/
  page.tsx                     # map + "Report a problem" + my issues
  report/page.tsx              # report flow (§6)
  issue/[id]/page.tsx          # photo, status, reporter count
  admin/page.tsx               # demo office dashboard
  api/analyze/route.ts
  api/duplicates/route.ts
  api/reports/route.ts
  api/admin/assign/route.ts
  api/admin/verify-fix/route.ts
  api/admin/resolve/route.ts
components/
  CampusMap.tsx                # client-only (next/dynamic, ssr: false)
  IssueCard.tsx  StatusBadge.tsx  Toast.tsx  StepHeader.tsx
lib/
  supabase-browser.ts          # anon client + ensureAnonSession()
  supabase-server.ts           # service-role client + getUserFromRequest()
  ai.ts                        # Claude client + 3 prompts + schemas (server)
  ai-storage.ts                # P3 service-role helper for photos (until P2 lands supabase-server.ts)
  faceBlur.ts                  # MediaPipe + pixelate (client)
  image.ts                     # compress, toBase64
  geo.ts                       # haversine + nearestLocation
  types.ts                     # shared types (owner: P2)
supabase/
  schema.sql
  seed.sql
```

---

## 5. Categories and routing

**Verify real USC office names before the demo.** USG judges will notice invented offices.

**Categories are dynamic.** The source of truth is the `routing` table: one row per category
(`category` id, `label`, `description`, `team_name`, `team_email`). Adding a row adds a category everywhere
(AI prompt, report form, map filters, routing); no code change. The AI may also propose a new category
(`suggested_new_category` in `/api/analyze`); an admin decides whether to add it as a row.

Starting set (placeholder offices, verify):

| category | label | Covers (`description`) | Routed to (placeholder, verify) |
|---|---|---|---|
| `elevator_access` | Elevator / accessibility | Elevators, ramps, automatic doors, blocked accessible paths | Facilities: Elevators & Accessibility |
| `broken_equipment` | Broken equipment | Lights, doors, furniture, water fountains, restrooms, leaks | Facilities: Maintenance |
| `tech` | Tech | Printers, Wi-Fi, screens/projectors, charging stations | ITS |
| `grounds` | Grounds & outdoor | Bike racks, benches, outdoor paths and pavement, landscaping, irrigation, outdoor lighting | Facilities: Grounds |
| `cleanliness` | Trash & cleanliness | Overflowing or knocked-over trash, litter, spills, dirty restroom, out of soap or paper towels, pests (usually low–medium) | Facilities: Custodial |
| `safety_hazard` | Safety hazard | Broken glass, exposed wiring, wet floor with no sign, trip hazards, dark path at night, broken handrail (usually high–urgent) | Facilities: Maintenance |
| `other` | Other | Any other campus facilities problem | Ripple triage (USG) |

**Not handled by Ripple:** fires, injuries, medical emergencies, anyone in danger, crimes, and reports about people.
`/api/analyze` returns `emergency: true` for these; the report screen shows **"Call USC DPS: 213-740-4321 (24/7) or 911"**
and creates no report. A report about a person comes back `is_issue: false`.

Status: `open` (red) → `assigned` (amber) → `resolved` (green).

---

## 6. Database — owner: P2

### `supabase/schema.sql`
```sql
create extension if not exists pgcrypto;

create table locations (
  id text primary key,                 -- e.g. 'leavey'
  name text not null,
  lat double precision not null,
  lng double precision not null,
  floors text[] not null default '{}'
);

create table routing (
  category text primary key,
  team_name text not null,
  team_email text
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations(id),
  floor text,
  category text not null references routing(category),
  title text not null,
  description text,
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  status text not null default 'open'
    check (status in ('open','assigned','resolved')),
  assigned_team text,
  reporter_count int not null default 0,
  before_photo_path text,
  after_photo_path text,
  resolution_note text,
  ai_fix_verdict jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  reporter_id uuid not null,           -- Supabase anonymous user id
  photo_path text not null,
  note text,
  ai_suggestion jsonb,
  ai_used boolean not null default true,
  created_at timestamptz not null default now(),
  unique (issue_id, reporter_id)       -- one confirmation per device per issue
);

create or replace function refresh_reporter_count() returns trigger
language plpgsql as $$
begin
  update issues
     set reporter_count = (select count(distinct reporter_id) from reports where issue_id = new.issue_id),
         updated_at = now()
   where id = new.issue_id;
  return new;
end $$;

create trigger reports_count
after insert on reports
for each row execute function refresh_reporter_count();

-- RLS: clients may read; all writes go through the server (service role bypasses RLS)
alter table locations enable row level security;
alter table routing   enable row level security;
alter table issues    enable row level security;
alter table reports   enable row level security;

create policy "read locations" on locations for select using (true);
create policy "read routing"   on routing   for select using (true);
create policy "read issues"    on issues    for select using (true);
create policy "read reports"   on reports   for select using (true);

alter publication supabase_realtime add table issues;
```

### `supabase/seed.sql`
Get coordinates by dropping a pin on each building (Google Maps → right-click → copy coordinates). Don't guess.
```sql
insert into routing (category, team_name, team_email) values
  ('elevator_access',  'Facilities — Elevators & Accessibility', null),
  ('broken_equipment', 'Facilities — Maintenance',               null),
  ('tech',             'ITS',                                    null);

insert into locations (id, name, lat, lng, floors) values
  ('leavey',   'Leavey Library', 0, 0, '{B,1,2}'),
  ('ginsburg', 'Ginsburg Hall',  0, 0, '{1,2,3}'),
  ('parkside', 'Parkside',       0, 0, '{1,2,3,4}');
  -- add up to 2 more; replace 0,0 with real coordinates
```

---

### Dispatch Copilot additions (P3) — `supabase/copilot.sql`, then `supabase/demo_history.sql`
```sql
alter table issues add column if not exists is_demo boolean not null default false;  -- seeded demo history
alter table issues add column if not exists ai_risk jsonb;        -- { safety_risk, notify_dps, act_today, reason, confidence }
alter table issues add column if not exists ai_confidence real;   -- AI category confidence at triage
alter table issues add column if not exists ai_insight jsonb;     -- cached recurrence insight
-- issue_events.type check now also allows 'acknowledged' and 'reminder'
```
`demo_history.sql` (generated by `scripts/gen-demo-history.mjs` with the app's `routeFor()`): 30 issues over 45 days, all
`is_demo = true`, `before_photo_path = null`. Patterns: 6 elevator issues at Parkside Apartments, 5 leaks at Waite Phillips
Hall (Building Maintenance is the slow office), 4 assigned-but-unacknowledged. Four rows are based on real reporting
(Daily Trojan: Parkside elevator modernization, Apr 2024; Pardee/Marks Tower without AC during the 2026 heat wave); dates and
counts are invented. `/admin` shows "Includes demo history for illustration." when demo rows are loaded.

---

### Dispatch Copilot in `/admin` (P3)
- **Risk panel**: AI triage risk (safety risk, notify DPS, act today) with reason + confidence. Advisory.
- **Why this office?**: client-side, from `routeFor().why`, building type (`placeKind`), problem type, AI category
  confidence; shows "Re-routed by <name>" when a supervisor changed the office. Rules, not AI.

## 7. Screens and flows

### Report flow (`/report`) — owner: P1
1. **Capture:** file input with `capture="environment"`; compress immediately.
2. **Privacy:** face blur; preview "Faces blurred on your phone before upload." Continue / Retake.
3. **Location:** preselect nearest seeded location from GPS; student confirms building and floor (student's choice wins).
4. **AI suggestion:** `/api/analyze`; editable title, category, description, priority. Loading ≤ ~8 s. On error or `is_issue: false` → manual form (category + title). On `emergency: true` → full-screen "This sounds like an emergency. Call USC DPS 213-740-4321 (24/7) or 911" with tap-to-call; no report is created.
5. **Duplicate check:** `/api/duplicates`. For matches with `same_issue && confidence >= 0.6`, show photo, title, "N students reported" → **"Yes, same issue"** / **"No, it's new."**
6. **Submit:** `/api/reports` with `existingIssueId` or new issue fields.
7. **Success:** "Reported. You'll get an update here when it's fixed."

### Map (`/`) — owner: P1
- MapLibre centered on USC. One pin per open/assigned issue (resolved shown faded for 24 h). Red / amber / green, badge = `reporter_count`.
- Tap a pin → bottom sheet: photo, title, status, count.
- "My issues" = issues this device reported.

### Notifications — owner: P2 (Realtime) + P1 (UI)
- Subscribe to `postgres_changes` UPDATE on `issues`.
- If an issue in "my issues" changes to `resolved` → toast "✅ Fixed: {title}" + `navigator.vibrate?.(200)` (Android only).
- Update map pins on any INSERT/UPDATE.

### Admin dashboard (`/admin`) — owner: P2
- Header: **"Demo office dashboard — in production, reports route to existing USC offices."**
- Passcode sent as `x-admin-passcode`; server checks `ADMIN_PASSCODE`.
- Tabs: Open / Assigned / Resolved. Card: photo, title, location/floor, priority, reporter count, suggested team.
- **Assign** → **Upload after photo** (shows AI verdict, before/after side by side) → **Confirm resolved**. AI is advisory; admin decides.

---

## 8. API contracts

JSON bodies. Images are base64 **after** compression and face blur (no `data:` prefix). Every route: `export const maxDuration = 30;`

### `POST /api/analyze` — P3
```ts
// req
{ imageBase64: string; mimeType: "image/jpeg"; locationName: string; floor?: string; note?: string }
// 200
{ is_issue: boolean; emergency: boolean; // emergency → show "Call DPS 213-740-4321 / 911", create NO report
  category: string;   // one of the routing.category ids
  title: string; description: string; priority: "low" | "medium" | "high" | "urgent"; confidence: number;
  suggested_new_category: { id: string; label: string } | null;  // set only when no category fit well
  risk: { safety_risk: boolean; notify_dps: boolean; act_today: boolean; reason: string; confidence: number } | null }
  // risk is advisory for the supervisor; /api/reports saves it to issues.ai_risk (+ confidence to issues.ai_confidence)
// 502 on AI failure → client shows manual form
{ error: string }
```

### `POST /api/duplicates` — P3 (AI) + P2 (query)
Server takes up to **3** candidates: same `location_id` + `category`, not resolved, created in the last 48 h, newest first. If none, return `[]` without calling the AI.
```ts
// req
{ imageBase64: string; mimeType: "image/jpeg"; locationId: string; category: string }
// 200
{ matches: { issue_id: string; same_issue: boolean; confidence: number; reason: string;
             title: string; reporter_count: number; photo_url: string }[] }
```

### `POST /api/reports` — P2
Header `Authorization: Bearer <supabase access token>`; server verifies with `supabaseAdmin.auth.getUser(token)` → `reporter_id`.
```ts
// join existing
{ imageBase64: string; existingIssueId: string; note?: string; aiSuggestion?: object; aiUsed: boolean }
// or create new
{ imageBase64: string; newIssue: { locationId: string; floor?: string; category: string;
  title: string; description?: string; priority: string }; note?: string; aiSuggestion?: object; aiUsed: boolean }
// 200
{ issueId: string; reporterCount: number }
// 409 if this device already reported this issue
{ error: "already_reported" }
```
Steps: upload to `report-photos/{issueId}/{reportId}.jpg` → insert issue if new (with `before_photo_path`) → insert report (trigger updates count).

### Admin — P2 (all require `x-admin-passcode`)
```ts
POST /api/admin/assign      { issueId }                 // status='assigned', assigned_team from routing
POST /api/admin/verify-fix  { issueId, imageBase64 }    // upload resolution-photos/{issueId}.jpg, Claude before/after
  → { same_location: boolean; resolved: boolean; confidence: number; reason: string; after_photo_url: string }
POST /api/admin/resolve     { issueId, note? }          // status='resolved', resolved_at=now()
POST /api/admin/work-order  { issueId, office? }        // P3: Claude drafts a work order for the routed office (text only, read-only)
  → { subject: string; body: string; urgency_note: string; to: string; team_name: string; department: string; ai: boolean }
  // office: supervisor override, else issues.assigned_team. to = demo department email. ai=false → template. Never 500s because of AI.
POST /api/admin/send-work-order { issueId, subject, body, office? }   // P3: supervisor "Approve & send"
  → { sent: boolean; link: string; to: string; department: string; office: string; subject: string; error?: string }
  // creates a fix_tokens link (7 days), emails DEMO_OFFICE_INBOX with subject "[Department] …", status='assigned', issue_events.
  // Email off/failed → sent=false, still returns the link (admin shows "Email (demo)").
POST /api/admin/fix-review  { issueId, note? }          // P3: "Send back" a submitted fix (clears after photo + verdict)
```
Resolve fires the Realtime update that shows "Fixed" on phones.

### Office loop (P3) — report → supervisor → office → supervisor → "Fixed"
1. `/api/reports` creates the issue with `assigned_team = routeFor(category, location, floor).office`, status `open`
   (= waiting for supervisor), and logs "Auto-routed to <office>".
2. `/admin`: the work order is drafted by Claude; the supervisor edits it, changes the office, or rejects.
   Nothing is sent until **Approve & send**.
3. Email goes **only** to `DEMO_OFFICE_INBOX` (Resend REST), subject `[Department] …`, recipient shown as
   `<dept>@ripple-demo.test` (`lib/departments.ts`). Never real USC addresses.
4. Office opens `/fix/<token>` (no login): **Acknowledge**, then **Upload after photo** → Claude before/after check,
   verdict saved to `issues.ai_fix_verdict`. The office never resolves.
5. `/admin` shows "Fix submitted": before/after + AI verdict → **Confirm resolved** (existing resolve) or **Send back**.
6. Resolve → Realtime → "Fixed" toast on every phone that reported it.
```ts
GET  /api/fix/[token]                                  → { office, department, acknowledged_at, fix_submitted_at, issue: {…, verdict} }
POST /api/fix/[token] { action: "acknowledge" }        → same summary
POST /api/fix/[token] { action: "submit_fix", imageBase64 } → same summary with verdict
// 404 invalid link · 410 expired · 409 already resolved/rejected
```
Schema: `supabase/fix_tokens.sql` (table `fix_tokens`: token_hash (sha256), issue_id, office, expires_at,
acknowledged_at, fix_submitted_at; plus demo `routing.team_email`). Env: `RESEND_API_KEY`, `EMAIL_FROM`,
`DEMO_OFFICE_INBOX`, `APP_URL`.

---

### Help SC — Ask, Favors, Lost & Found (team-approved stretch, Sat)
Schema: `supabase/help.sql` (`help_posts`, `help_replies`, bucket `help-photos`). Types: `lib/help-types.ts`.
Clients read with the anon key (public RLS select) + Realtime; all writes go through these routes with
`Authorization: Bearer <supabase access token>`:
```ts
POST /api/help/posts    { kind: "ask"|"favor"|"lost"|"found", title, body?, imageBase64?, location:{id,name,lat,lng}, floor? } → { id }
POST /api/help/replies  { postId, body?, imageBase64? } → { id }
POST /api/help/resolve  { postId, action: "resolve"|"close"|"reopen", replyId? } → { status }   // author only
// 422 { error, blocked: true, emergency } when the AI safety check refuses (emergency → show DPS 213-740-4321 / 911)
```
Posts expire: ask 3 h, favor 24 h, lost/found 14 d. Limits: 5 posts and 20 replies per user per hour.
AI safety check (`moderateHelp` in `lib/ai.ts`): blocks posts about people, dating, money, contact/ID numbers,
harassment, academic dishonesty; emergencies → DPS. Local rules run first and are the fallback if Claude is down.

---

## 9. AI and face blur — owner: P3

### Claude call pattern (`lib/ai.ts`)
Each prompt is one `messages.create` call with the image(s) as base64 `image` blocks and **structured outputs**:
`output_config: { format: { type: "json_schema", schema }, effort }` (every object has `additionalProperties: false`).
Do **not** use forced `tool_choice` (`{type:"tool"}` / `"any"`): Claude Sonnet 5.5 rejects it with a 400.
`fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) re-runs a declined request on a fallback model.
Effort `low` for analyze/work order, `medium` for duplicate/verify comparisons. 12 s timeout, 1 retry; on failure the
route returns 502 (analyze) or `[]` (duplicates). Measured Sat: ~2.8k input + ~150 output tokens, 2–3 s per analyze call.

### Prompt 1 — Analyze
```
You are triaging a photo that a USC student took of a campus facilities problem.
Location: {locationName}, floor {floor or "unknown"}. Student note: {note or "none"}.

Decide whether the photo shows a campus facilities problem. If it does not
(e.g. a selfie, food, a random object), set is_issue to false.

Choose exactly one category:
- {category}: {description}        ← one line per routing row, built at request time
If no category fits well, choose "other" (or the closest one) AND propose a new category in
new_category_id (snake_case) and new_category_label. If one fits, leave both empty.
EMERGENCY: fire/smoke, injury, medical emergency, anyone in danger, or a crime → emergency = true, is_issue = false.
About a person (behavior/appearance) rather than a facility → is_issue = false.
Risk (for /admin): safety_risk = could injure someone or blocks a safe exit; notify_dps = ONLY immediate danger
(fire/smoke, flooding near electrical, exposed live wiring, someone hurt or at risk); act_today = urgent/high or step-free
access blocked; reason ≤ 1 sentence, never describes people; confidence 0–1.

Priority:
- urgent: safety hazard (e.g. trip hazard, exposed wiring, flooding), or blocks access for wheelchair users
- high: blocks use of a shared space or service
- medium: degraded but still usable
- low: cosmetic

Write a title of at most 8 words and a description of at most 2 sentences.
Describe only what is visible. Never describe or identify people.
Set confidence between 0 and 1.
```
```ts
// tool input_schema (lib/ai.ts → analyzeSchema(ids))
{
  type: "object",
  properties: {
    is_issue: { type: "boolean" }, emergency: { type: "boolean" },
    category: { type: "string", enum: /* routing.category ids */ [] },
    title: { type: "string" }, description: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    confidence: { type: "number" },
    new_category_id: { type: "string" }, new_category_label: { type: "string" },
  },
  required: [/* all of the above */],
}
```

### Prompt 2 — Duplicate match
New photo first, then each candidate photo with its issue_id as a text label.
```
The FIRST image is a new report. The following images are existing open reports,
each labeled with its issue_id.

For each existing report, decide whether the new photo shows the SAME physical
problem — the same object or spot with the same fault — not merely the same
category or the same building. Different elevators, different printers or
different restrooms are NOT the same issue.

Return one entry per existing report with issue_id, same_issue, confidence (0–1)
and a one-sentence reason.
```
Schema: `{ matches: [{ issue_id, same_issue, confidence, reason }] }`. Show only `same_issue && confidence >= 0.6`.

### Prompt 3 — Verify fix
```
Image 1 is the BEFORE photo of a reported campus problem: "{title}" — {description}.
Image 2 is the AFTER photo uploaded by the responsible office.

1. same_location: does the after photo show the same place/object as the before photo?
2. resolved: is the reported problem visibly fixed in the after photo?
Be strict: if the after photo is unclear or shows a different place, resolved = false.
Give confidence (0–1) and a one-sentence reason.
```
Schema: `{ same_location, resolved, confidence, reason }`. Advisory only.

**Test early:** by 12 PM, run Prompt 1 on ~10 real campus photos (incl. 2 non-issues). Before the freeze, test duplicates with the same object from two angles and one similar-but-different object.

### Face blur (`lib/faceBlur.ts`)
```ts
import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

let detector: FaceDetector | null = null;
export async function getDetector() {
  if (detector) return detector;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.4,
  });
  return detector;
}
```
- Draw the image to a canvas, `detector.detect(canvas)`, and **pixelate** each box (pad ~20%; draw at ~1/16 size, scale back up with `imageSmoothingEnabled = false`).
- **Don't use `ctx.filter = "blur()"`**; it's unreliable on iOS Safari.
- Preload the detector when `/report` mounts.
- Limitation: the short-range model can miss distant faces. Say so honestly if asked.

---

## 10. Team

| Person | Owns | After ~10 PM |
|---|---|---|
| **P1 — ________** | Report flow, map, notification UI, mobile polish | Real-phone testing, UI bugs |
| **P2 — ________** | Supabase schema/seed, `/api/reports`, duplicates query, Realtime, admin dashboard + admin APIs, `lib/types.ts` | Seed demo data, end-to-end testing |
| **P3 — Bhavya** | Claude + 3 prompts, `/api/analyze`, duplicate AI, verify-fix AI, face blur | Demo script, slides, video, Devpost |

`lib/types.ts` and `supabase/schema.sql` are owned by P2; others propose changes in chat. Merge to `main` small and often; Vercel deploys a preview on every push.

---

## 11. Timeline (PT)

| Time | Milestone |
|---|---|
| **Sat 11 AM–12 PM** | P1: Next.js → repo → Vercel, camera works on a phone over HTTPS. P2: Supabase project, anonymous auth, buckets, schema + seed, Realtime. P3: Anthropic key, one photo → JSON. Share keys privately, never in the repo. |
| **12–5 PM** | A photo report saves and appears on another phone's map (no AI yet). |
| **5–10 PM** | AI suggestion + manual fallback, face blur, duplicate confirmation. |
| **10 PM–2 AM** | Admin dashboard, assign, after-photo verify, resolve, "Fixed" notification. |
| **Sun 2 AM** | **Feature freeze.** Test on 3 real phones (iOS + Android), fix bugs, seed demo data. |
| **3–7 AM** | Sleep in shifts. Devpost description + slide draft written before sleeping. |
| **7–9 AM** | **Check in by 9 AM.** Record backup demo video, finish slides, screenshots. |
| **9–10:30 AM** | Complete Devpost, all teammates added. **Submit by 10:30.** |

---

## 12. Stretch (only if the gate is met)

**Gate:** the full loop works on the deployed URL, on 3 phones, 3 times in a row, before ~9 PM Saturday. Build stretch work on a separate branch. Anything unfinished at 2 AM is hidden, not demoed.

In this order:
1. "+points" line in the Fixed toast (~30 min)
2. Simple USG stats on `/admin`: open issues per location, average time-to-fix (~2 h)
3. Ask: ask a place a question, others answer with a photo or text, shown via the same Realtime subscription (~3–4 h)

---

## 13. Demo

**Seed data:** 4–6 open/assigned issues using real photos the team takes on campus (no faces). Leave one fresh object for the live demo.

**Live loop (~90 s):**
1. Phone A reports → AI fills title/category/priority → submit → pin appears on Phone B's map.
2. Phone B (or a judge's phone) photographs the same thing → "Same issue?" → Yes → count = 2.
3. Admin: assign → upload after photo → AI "Resolved, 0.9" → Confirm.
4. Both phones show "✅ Fixed."

**Pitch (3 min):** problem with real USC examples (0:00–0:30) → live loop (0:30–2:00) → roadmap: Ask / Help / Lost & Found / Lantern (2:00–2:30) → adoption: USG runs it, reports go to existing offices, Leavey + two residence halls pilot (2:30–3:00).

**Backup:** pre-recorded video of the full loop.

**Be ready for:**
- *Why not the existing request system?* Students don't know which of 5+ offices owns a problem; Ripple routes it, merges duplicates and closes the loop.
- *Why not ChatGPT?* It can't know what's broken right now, how many students saw it, or whether it was fixed.
- *Fake reports?* One confirmation per device, AI rejects non-issues; USC email verification in production.
- *Privacy?* Faces blurred on the phone before upload; AI never describes people.
- *AI wrong?* It only suggests; the student and the admin confirm every decision.

---

## 14. Conventions

- TypeScript everywhere; small components; mobile-first (390 px wide, tap targets ≥ 44 px).
- Never import `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` or `ADMIN_PASSCODE` in client code.
- `CampusMap` loads with `next/dynamic` and `ssr: false`.
- Every async step has a loading state and an error state.
- No new dependencies without telling the team. Nothing outside §2 without asking the team.

---

## 15. Open decisions

- [ ] Names for P1 / P2 / P3
- [ ] Final 3–5 locations + real coordinates
- [ ] Verified USC office names (§5)
- [ ] Vercel deployment URL
- [ ] Live-demo object to photograph
