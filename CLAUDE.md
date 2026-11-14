# RIPPLE — Project Brief (AI@USC Hackathon, Nov 14–15, 2026)

> **How to use this file:** Paste it into your Claude chat at the start of a session, or save it as `CLAUDE.md` in the repo root so Claude Code reads it automatically. It is the single source of truth for scope, architecture, data model, API contracts and AI prompts. If you change a shared contract (schema, API shape, types), update this file and tell the team.

---

## 1. Context

**Event:** AI@USC Hackathon (HackSC + USC AI Committee, supported by USG/GSG), Ginsburg Hall.
**Aim of the hackathon:** Build an AI-powered tool that makes campus life better for USC students. USG intends to implement the strongest projects.

**Hard deadlines (Pacific Time):**
- Sunday Nov 15, **9:00 AM** — participant check-in deadline
- Sunday Nov 15, **11:00 AM** — Devpost submission deadline (**we submit by 10:30 AM**)
- 11 AM–2 PM first-round judging → top 10 teams pitch 3:00–4:30 PM (≤ 3 min each)

**Submission must include:** project description (problem, solution, tech stack, challenges, future goals) · working prototype link · demo video ≤ 3 min · slide deck (PDF or Google Slides) · at least one image · all teammates added on Devpost. Late or incomplete submissions are not judged.

**Rules that affect code:** All code, design assets and prototypes must be created during Nov 14–15. Open-source libraries, frameworks and public APIs are allowed. Do not paste in code from earlier personal projects.

**Judging weights — optimize for these:**
| Criterion | Weight | What it means for us |
|---|---|---|
| Impact & Campus Relevance | 30% | Real, visible friction (broken elevators, broken equipment). Use real USC examples. |
| Technical & AI Execution | 25% | AI must be accurate, secure, and essential. Handle failures gracefully. |
| Feasibility & Implementation | 25% | USG/campus departments could adopt it next semester. Reports go to existing offices. |
| User Experience & Design | 20% | Fast, clean, mobile-first, accessible. |

---

## 2. The product

**RIPPLE: the campus that helps itself.** A live campus map powered by student observations. Students photograph problems, confirm what others already reported, and get notified when the issue is fixed.

**The problem:** USC runs on 5+ offices and portals, so students don't know where to report things, and nobody can see what's broken right now. Examples: Parkside ran on one elevator for months; broken equipment goes unreported because no one knows who owns it.

**Adoption story (say this in the pitch):** USG runs Ripple. Reports are routed to the *existing* USC offices. USC doesn't have to change any system. Phase 1 pilot: Leavey Library + two residence halls.

**Long-term vision (roadmap slide ONLY — do not build):** Ask (ask a place a question), Help (small favors), lost-and-found photo matching, Lantern (gate-aware night routing / walk groups), Trojan Pass (verified identity + karma), 3D map.

---

## 3. Scope for the 24 hours

### The one loop that must work
**Report → AI description → Duplicate confirmation → Team assignment → After-photo resolution → Notification**

### Success criterion
Two phones report the same problem → both join one shared issue (reporter count = 2) → admin assigns it → admin uploads an after photo, AI checks it, admin confirms → **both phones get a "Fixed" notification**. This works repeatedly on the deployed site.

### Coverage
- **3 categories** (see §6)
- **3–5 campus locations** (seeded)

### In scope
- Photo capture/upload with on-device face blur + preview
- Location: nearest seeded building from GPS + student confirms building and floor
- AI suggestion of title, category, description, priority — student can edit
- Duplicate suggestion + student confirms "Same issue" / "New issue"
- Live map with status colors and distinct-reporter counts
- Demo office dashboard (clearly labeled "Demo") with category-based team assignment
- Before/after AI comparison; admin confirms resolution
- In-app live notification while the app is open

### Explicitly OUT of scope (do not build)
3D buildings · login/SSO · push notifications · manual redaction drawing tool · model training · PostGIS · native app · Ask/Help/Lost&Found/Lantern · state libraries (Redux etc.)

### Non-negotiable rules
1. **AI never blocks a report.** If Gemini errors or times out, the student picks the category manually and submits.
2. **Feature freeze at 2:00 AM Sunday.** After that: bug fixes, testing on real phones, seed data, demo prep only.
3. **Never commit secrets.** Keys live in **Replit Secrets** only.
5. **Everything runs on Replit** (we are competing for Best Use of Replit): hosting, database, photo storage and secrets. Don't add outside services for these.
4. **Be honest in the demo.** Anything mocked is labeled (e.g. "Demo office dashboard").

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript + Tailwind** | UI and API routes in one repo |
| Hosting | **Replit Deployments** (Autoscale) | The `.replit.app` URL is HTTPS, which camera + geolocation need on phones |
| Database | **Replit Database** (managed PostgreSQL) | Connection string is in the `DATABASE_URL` secret; query with `pg` |
| Live updates | **Polling** `GET /api/issues?since=<iso>` every 3 s | Simple and reliable on Autoscale; no websockets to break on stage |
| Photo storage | **Replit App Storage** (Object Storage) via `@replit/object-storage` | Keys: `report-photos/...`, `resolution-photos/...`. Served through `GET /api/photo/[...key]` (faces are blurred before upload) |
| Identity | **Device ID** | A random UUID created on first visit, kept in `localStorage`, sent as header `x-device-id`. One ID per device = "distinct reporter". |
| Secrets | **Replit Secrets** | All keys below |
| AI | **Gemini Flash** via `@google/genai` | Server-side only. Structured JSON output. Model name in `GEMINI_MODEL` env var — use the current Flash model listed in Google AI Studio. |
| Face blur | **`@mediapipe/tasks-vision` FaceDetector** | Runs in browser before upload. Pixelate with canvas (see §9). |
| Map | **MapLibre GL JS + OpenFreeMap** | Style URL: `https://tiles.openfreemap.org/styles/liberty`. No API key. |
| Camera | `<input type="file" accept="image/*" capture="environment">` | Works on iOS + Android, no library |
| Image compression | **`browser-image-compression`** | Target ≤ 300 KB, max 1280 px, JPEG |
| Email (optional) | **Resend** | Only if time; dashboard alone is acceptable |

### Packages
```bash
npm i pg @replit/object-storage @google/genai @mediapipe/tasks-vision maplibre-gl browser-image-compression
```

### Replit Secrets
```
DATABASE_URL=                   # set automatically when Replit Database is added — server only
GEMINI_API_KEY=                 # server only
GEMINI_MODEL=                   # e.g. current Gemini Flash model id from AI Studio
ADMIN_PASSCODE=                 # server only — demo dashboard gate
RESEND_API_KEY=                 # optional
```

---

## 5. Architecture

```
Phone (Next.js client)
 ├─ device id (UUID in localStorage) → sent as x-device-id = reporter_id
 ├─ camera → compress → MediaPipe face blur → preview
 ├─ POST /api/analyze      (image)            → AI suggestion
 ├─ POST /api/duplicates   (image, location, category) → candidate matches
 ├─ POST /api/reports      (image, issue fields | existing issueId) → saves photo + rows
 └─ poll GET /api/issues?since=<iso> every 3 s → map updates + "Fixed" toast

Admin (Next.js /admin, passcode)
 ├─ POST /api/admin/assign      → status 'assigned'
 ├─ POST /api/admin/verify-fix  (after image) → AI before/after verdict
 └─ POST /api/admin/resolve     → status 'resolved'

Server (Next.js route handlers, deployed on Replit)
 ├─ Replit Database (Postgres via `pg`, DATABASE_URL)
 ├─ Replit App Storage (`@replit/object-storage`) for photos
 └─ Gemini client
```

**Design decision:** The browser never talks to the database or storage directly. **All reads and writes go through API routes**, and photos are served by `GET /api/photo/[...key]`. No database credentials ever reach the client.

**Built on Replit (say this on Devpost and in the pitch):** Replit Deployments for hosting, Replit Database for data, Replit App Storage for photos, Replit Secrets for keys, Replit Agent for scaffolding, and the whole team building in one Replit project with GitHub sync. Take screenshots of each as you go.

### Folder structure
```
app/
  page.tsx                    # Map + "Report a problem" button + my-issues list
  report/page.tsx             # Report flow (multi-step, see §8)
  issue/[id]/page.tsx         # Issue detail: photo, status, reporter count, timeline
  admin/page.tsx              # Demo office dashboard
  api/analyze/route.ts
  api/duplicates/route.ts
  api/reports/route.ts
  api/admin/assign/route.ts
  api/admin/verify-fix/route.ts
  api/admin/resolve/route.ts
  api/issues/route.ts         # GET ?since=<iso> → issues changed since (polling)
  api/photo/[...key]/route.ts # streams a photo from App Storage
components/
  CampusMap.tsx               # client-only (dynamic import, ssr: false)
  IssueCard.tsx  StatusBadge.tsx  Toast.tsx  StepHeader.tsx
lib/
  device.ts                   # getDeviceId() — create/read UUID in localStorage (client)
  db.ts                       # pg Pool from DATABASE_URL + query helper (server)
  storage.ts                  # @replit/object-storage upload/download helpers (server)
  gemini.ts                   # client + 3 prompt functions + schemas
  faceBlur.ts                 # MediaPipe init + pixelate
  image.ts                    # compress, toBase64, fetchAsBase64
  geo.ts                      # haversine + nearestLocation
  types.ts                    # shared types (owner: Person 2)
db/
  schema.sql
  seed.sql
```

---

## 6. Categories and routing

Three categories. **Verify real USC office names before the demo** — judges include USG reps and will notice invented offices. Until verified, names below are placeholders.

| category id | Covers | Routed to (placeholder — verify) |
|---|---|---|
| `elevator_access` | Elevators, ramps, automatic doors, blocked accessible paths | Facilities — Elevators & Accessibility |
| `broken_equipment` | Lights, doors, furniture, water fountains, restrooms, leaks | Facilities — Maintenance |
| `tech` | Printers, Wi-Fi, screens/projectors, charging stations | ITS |

---

## 7. Database (Replit Database, PostgreSQL) — owner: Person 2

### `db/schema.sql`
```sql
create extension if not exists pgcrypto;

create table locations (
  id text primary key,                 -- slug, e.g. 'leavey'
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
  before_photo_path text,              -- first report's photo
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
  reporter_id uuid not null,           -- device id from x-device-id header
  photo_path text not null,
  note text,
  ai_suggestion jsonb,
  ai_used boolean not null default true,
  created_at timestamptz not null default now(),
  unique (issue_id, reporter_id)       -- one confirmation per device per issue
);

-- keep reporter_count = number of distinct reporters
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

-- polling: GET /api/issues?since=... reads rows by updated_at
create index issues_updated_at on issues (updated_at);
```

**Every UPDATE to `issues` must also set `updated_at = now()`** (assign, verify-fix, resolve), or polling clients won't see the change.

### `db/seed.sql`
Fill coordinates by dropping a pin on each building (Google Maps → right-click → copy coordinates). Do **not** guess coordinates.
```sql
insert into routing (category, team_name, team_email) values
  ('elevator_access',  'Facilities — Elevators & Accessibility', null),
  ('broken_equipment', 'Facilities — Maintenance',               null),
  ('tech',             'ITS',                                    null);

insert into locations (id, name, lat, lng, floors) values
  ('leavey',   'Leavey Library',  0, 0, '{B,1,2}'),
  ('ginsburg', 'Ginsburg Hall',   0, 0, '{1,2,3}'),
  ('parkside', 'Parkside',        0, 0, '{1,2,3,4}');
  -- add up to 2 more; replace 0,0 with real coordinates
```

### Setup checklist (Replit)
- Create the Replit App (Next.js). Turn on **GitHub sync** to `Parshvacancodeit/AI-USC`.
- Add **Replit Database** (PostgreSQL). `DATABASE_URL` appears in Secrets automatically.
- Run `db/schema.sql`, then `db/seed.sql` in the Database tool's SQL runner.
- Add **App Storage** (Object Storage). No buckets to configure; we use key prefixes `report-photos/` and `resolution-photos/`.
- Add Secrets: `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_PASSCODE`.
- Deploy with **Autoscale** early (by 12 PM) so phones can test the camera over HTTPS on the `.replit.app` URL.

---

## 8. User flows

### Student report flow (`/report`) — owner: Person 1
1. **Capture** — file input with `capture="environment"`. Compress immediately.
2. **Privacy** — run face blur; show preview ("Faces blurred on your phone before upload"). Continue / Retake.
3. **Location** — preselect nearest seeded location via GPS (`geo.ts`), student confirms building + picks floor. GPS is unreliable indoors; the student's choice wins.
4. **AI suggestion** — call `/api/analyze`. Show editable title, category, description, priority. Loading state ≤ ~8 s; on error or `is_issue: false`, show manual form (category dropdown + title) with a gentle message.
5. **Duplicate check** — call `/api/duplicates`. If any match with `same_issue && confidence >= 0.6`, show card(s): photo, title, "N students reported" → buttons **"Yes, same issue"** / **"No, it's new"**.
6. **Submit** — `/api/reports` with either `existingIssueId` or new issue fields.
7. **Success** — "Reported. You'll get an update here when it's fixed." Link to issue page.

### Map (`/`) — owner: Person 1
- MapLibre centered on USC campus, OpenFreeMap liberty style.
- One pin per non-resolved issue (resolved issues shown faded for 24 h). Color: open = red, assigned = amber, resolved = green. Badge shows `reporter_count`.
- Tap pin → bottom sheet with photo, title, status, count, "Me too" (goes to report flow prefilled? — stretch).
- "My issues" list = issues where `reports.reporter_id = my uid`.

### Notifications — owner: Person 2 (`/api/issues`) + Person 1 (UI)
- Poll `GET /api/issues?since=<last updated_at seen>` every 3 s while the app is open (pause when the tab is hidden).
- If a returned issue is in "my issues" and its `status` changed to `resolved` → toast "✅ Fixed: {title}" + `navigator.vibrate?.(200)` (Android only; ignore on iOS).
- Also add or update map pins for every returned issue.

### Admin dashboard (`/admin`) — owner: Person 2
- Header label: **"Demo office dashboard — in production, reports route to existing USC offices."**
- Passcode prompt; passcode sent as header `x-admin-passcode` on admin API calls; server checks `ADMIN_PASSCODE`.
- Columns or tabs: Open / Assigned / Resolved. Each card: photo, title, location/floor, priority, reporter count, suggested team (from `routing`).
- **Assign** button → `/api/admin/assign`.
- **Upload after photo** → `/api/admin/verify-fix` → show AI verdict (resolved? confidence, reason, side-by-side before/after).
- **Confirm resolved** → `/api/admin/resolve`. AI is advisory; admin decides.

---

## 9. API contracts

All request/response bodies are JSON. Images are sent as base64 **after** compression and face blur (no `data:` prefix). All routes: `export const maxDuration = 30;`

### `POST /api/analyze` — owner: Person 3
```ts
// req
{ imageBase64: string; mimeType: "image/jpeg"; locationName: string; floor?: string; note?: string }
// res 200
{ is_issue: boolean; category: "elevator_access" | "broken_equipment" | "tech";
  title: string; description: string; priority: "low" | "medium" | "high" | "urgent"; confidence: number }
// res 502 on AI failure → client falls back to manual form
{ error: string }
```

### `POST /api/duplicates` — owner: Person 3 (AI) + Person 2 (query)
Server fetches up to **3** candidate issues: same `location_id` + `category`, `status != 'resolved'`, `created_at > now() - 48h`, newest first. Downloads their `before_photo_path` images and asks Gemini.
```ts
// req
{ imageBase64: string; mimeType: "image/jpeg"; locationId: string; category: string }
// res 200 (empty array if no candidates — skip the Gemini call)
{ matches: { issue_id: string; same_issue: boolean; confidence: number; reason: string;
             title: string; reporter_count: number; photo_url: string }[] }
```

### `POST /api/reports` — owner: Person 2
Header `x-device-id: <uuid>`. Server validates it is a UUID and uses it as `reporter_id`.
```ts
// req — either join an existing issue...
{ imageBase64: string; existingIssueId: string; note?: string; aiSuggestion?: object; aiUsed: boolean }
// ...or create a new one
{ imageBase64: string; newIssue: { locationId: string; floor?: string; category: string;
  title: string; description?: string; priority: string }; note?: string; aiSuggestion?: object; aiUsed: boolean }
// res 200
{ issueId: string; reporterCount: number }
// res 409 if this device already reported this issue
{ error: "already_reported" }
```
Server steps: upload photo to App Storage key `report-photos/{issueId}/{reportId}.jpg` → insert issue (if new, with `before_photo_path`) → insert report (trigger updates count).

### `GET /api/issues?since=<iso>` — owner: Person 2
```ts
// res 200 — issues with updated_at > since (all non-resolved + resolved in last 24 h if since is omitted)
{ issues: Issue[]; serverTime: string }   // client stores serverTime as the next `since`
// "my issues": GET /api/issues?mine=1 with x-device-id header
```

### `GET /api/photo/[...key]`
Streams the object from Replit App Storage with `Content-Type: image/jpeg` and a short cache header. `photo_url` fields in responses point here, e.g. `/api/photo/report-photos/{issueId}/{reportId}.jpg`.

### `POST /api/admin/assign`
```ts
{ issueId: string }  → sets status='assigned', assigned_team = routing.team_name; optional Resend email
```

### `POST /api/admin/verify-fix`
```ts
// req
{ issueId: string; imageBase64: string }
// server: upload to resolution-photos/{issueId}.jpg, set after_photo_path, call Gemini with before+after
// res
{ same_location: boolean; resolved: boolean; confidence: number; reason: string; after_photo_url: string }
```

### `POST /api/admin/resolve`
```ts
{ issueId: string; note?: string }  → status='resolved', resolved_at=now(), updated_at=now()  (next poll delivers the notification)
```

---

## 10. AI (Gemini) — owner: Person 3

### Client setup (`lib/gemini.ts`)
```ts
import { GoogleGenAI, Type } from "@google/genai";
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = process.env.GEMINI_MODEL!;

// pattern for every call:
const res = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
    { text: PROMPT },
  ]}],
  config: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
});
const data = JSON.parse(res.text ?? "{}");
```
Wrap every call in a timeout (~12 s) and try/catch. On failure return 502 so the client falls back.

### Prompt 1 — Analyze (triage)
```
You are triaging a photo that a USC student took of a campus facilities problem.
Location: {locationName}, floor {floor or "unknown"}. Student note: {note or "none"}.

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
Set confidence between 0 and 1.
```
Schema:
```ts
const ANALYZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_issue:    { type: Type.BOOLEAN },
    category:    { type: Type.STRING, enum: ["elevator_access", "broken_equipment", "tech"] },
    title:       { type: Type.STRING },
    description: { type: Type.STRING },
    priority:    { type: Type.STRING, enum: ["low", "medium", "high", "urgent"] },
    confidence:  { type: Type.NUMBER },
  },
  required: ["is_issue", "category", "title", "description", "priority", "confidence"],
};
```

### Prompt 2 — Duplicate match
Send the new photo first, then each candidate photo, with text labels between them.
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
Schema: `{ matches: [{ issue_id: string, same_issue: boolean, confidence: number, reason: string }] }`
Client shows a match only if `same_issue && confidence >= 0.6`.

### Prompt 3 — Verify fix (before/after)
```
Image 1 is the BEFORE photo of a reported campus problem: "{title}" — {description}.
Image 2 is the AFTER photo uploaded by the responsible office.

1. same_location: does the after photo show the same place/object as the before photo?
2. resolved: is the reported problem visibly fixed in the after photo?
Be strict: if the after photo is unclear or shows a different place, resolved = false.
Give confidence (0–1) and a one-sentence reason.
```
Schema: `{ same_location: boolean, resolved: boolean, confidence: number, reason: string }`
AI is advisory — the admin presses "Confirm resolved".

### Test early
Before 12 PM, test Prompt 1 on ~10 real campus photos (broken light, printer, elevator, plus 2 non-issues). Before the freeze, test duplicates with two photos of the same object from different angles, and one photo of a similar-but-different object.

---

## 11. Face blur (`lib/faceBlur.ts`) — owner: Person 3

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
- Draw the image to a canvas, run `detector.detect(canvas)`, and for each `detection.boundingBox` **pixelate** the region (draw it scaled down ~1/16 then back up with `imageSmoothingEnabled = false`), padding the box by ~20%.
- **Use pixelation, not `ctx.filter = "blur()"`** — canvas filters are unreliable on iOS Safari.
- Known limitation: the short-range model is tuned for nearby faces; distant faces may be missed. Mention honestly if asked; production would use a full-range model.
- Preload the detector when the report page mounts so it's ready by the time the photo is taken.

---

## 12. Team ownership (3 people)

| Person | Owns | After ~10 PM |
|---|---|---|
| **P1 — ________** | Student UI, report flow, map, notifications UI, mobile polish | Real-phone testing, UI bugs |
| **P2 — ________** | Replit Database schema/seed, App Storage helpers, `/api/reports`, `/api/issues` (polling), `/api/photo`, duplicates query, admin dashboard + admin APIs, `lib/types.ts` | Seed demo data, end-to-end testing |
| **P3 — ________** | Gemini client + 3 prompts, `/api/analyze`, duplicate AI, verify-fix AI, face blur | Demo script, slides, video, Devpost text |

**Shared files:** `lib/types.ts` and `db/schema.sql` are owned by P2 — others propose changes in chat. Merge to `main` small and often; redeploy on Replit after each working milestone.

**Replit prize evidence (P3 collects):** screenshots of Replit Agent scaffolding, the Database and App Storage panels, Secrets (values hidden), the Deployment page, and the team working in the same Replit App. These go in the Devpost "Built with Replit" section and one line of the video.

---

## 13. Timeline (clock time, PT)

| Time | Milestone |
|---|---|
| **11 AM–12 PM (Sat)** | Setup in parallel. **First: ask the Replit sponsor rep what they judge "Best Use of Replit" on.** P1: Replit App (Next.js) with Replit Agent → GitHub sync → Autoscale deploy, camera works on a real phone over HTTPS. P2: Replit Database + schema + seed, App Storage, `/api/issues` polling. P3: Gemini key in Secrets, one real photo → JSON. Keys only in Replit Secrets, never in chat or the repo. |
| **12–5 PM** | A photo report saves and appears on another phone's map (no AI yet). |
| **5–10 PM** | AI suggestion + manual fallback, face blur, duplicate confirmation. |
| **10 PM–2 AM** | Admin dashboard, assign, after-photo verify, resolve, live "Fixed" notification. |
| **2 AM (Sun)** | **FEATURE FREEZE.** Test on 3 real phones (iOS + Android), fix bugs, seed demo data. |
| **3–7 AM** | Sleep in shifts. Devpost description + slide draft written before sleeping. |
| **7–9 AM** | **Check in by 9 AM.** Record backup demo video, finish slides, screenshots. |
| **9–10:30 AM** | Complete Devpost submission, all teammates added. **Submit by 10:30.** |

---

## 14. Demo plan

**Seed data:** 4–6 realistic open/assigned issues across the seeded locations, using real photos the team takes on campus (no faces). Leave one fresh object for the live demo (e.g. a specific light or printer we photograph live).

**Live demo (≈ 90 s of the 3-min pitch):**
1. Phone A reports the problem → AI fills title/category/priority → submit → pin appears on Phone B's map instantly.
2. Phone B (or a judge's phone) photographs the same thing → "Is this the same issue?" → Yes → count goes to 2.
3. Admin dashboard: assign to team → upload after photo → AI says "Resolved, 0.9" → Confirm.
4. Both phones show "✅ Fixed".

**Pitch structure (3 min):** Problem (0:00–0:30, real USC examples) → Live loop (0:30–2:00) → Roadmap: Ask / Help / Lost & Found / Lantern (2:00–2:30) → Adoption: USG runs it, Phase 1 pilot, offices receive reports, USC changes nothing (2:30–3:00).

**Backup:** Pre-recorded video of the full loop in case Wi-Fi or Gemini fails during judging.

**Questions to be ready for:**
- *Why not the existing facilities request system?* → Students don't know which of 5+ offices owns a problem; Ripple routes it for them, merges duplicates, and closes the loop with the reporter.
- *Fake/spam reports?* → One confirmation per device, AI rejects non-issues, confirmation counts act as trust; USC email verification in production.
- *Privacy?* → Faces blurred on the phone before upload; AI instructed never to describe people.
- *Cold start?* → Every single report is useful on its own because it reaches the office.
- *AI wrong?* → AI only suggests; the student and the admin confirm every decision.

---

## 15. Conventions for Claude (and humans)

- TypeScript everywhere. Keep components small. Mobile-first: design for a 390 px-wide screen, big tap targets (≥ 44 px), readable contrast.
- Never import `DATABASE_URL`, `GEMINI_API_KEY` or `ADMIN_PASSCODE` in client components. Server-only code lives in `app/api/**` and `lib/db.ts` / `lib/storage.ts` / `lib/gemini.ts`.
- `CampusMap` must be loaded with `next/dynamic` and `ssr: false` (MapLibre needs `window`).
- Every async UI step has a loading state and an error state. No silent failures.
- Don't add new dependencies without telling the team.
- Don't build anything from the "out of scope" list. If a feature isn't in §3, ask the team first.
- Keep demo-only shortcuts clearly labeled in the UI.

---

## 16. Open decisions (fill in as a team)

- [ ] Names for P1 / P2 / P3
- [ ] Final 3–5 locations + verified coordinates
- [ ] Verified USC office names for routing (§6)
- [x] Hosting: **Replit** (Deployments, Database, App Storage, Secrets) for Best Use of Replit
- [ ] Repo URL (https://github.com/Parshvacancodeit/AI-USC) + Replit deployment URL
- [ ] What the Replit sponsor says they judge on
- [ ] Live-demo object to photograph
