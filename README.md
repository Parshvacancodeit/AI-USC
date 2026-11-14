# Ripple: the campus that helps itself

> Snap it. We route it. You see it fixed.
>
> Built for the **AI@USC Hackathon** (HackSC x USC AI Committee), Nov 14–15, 2026. *For Trojans, by Trojans.*

Ripple turns students into USC's live eyes. A student photographs anything broken, blocked or full. Ripple blurs faces **on the phone**, uses AI to understand the problem and find exactly where it is, merges duplicate reports into one incident, sends it to the office that can fix it, and **proves the fix happened** with a before/after photo. Everyone who reported it gets notified and earns points.

---

## Table of contents

1. [The problem](#1-the-problem)
2. [The solution](#2-the-solution)
3. [How it helps students](#3-how-it-helps-students)
4. [User flows](#4-user-flows)
5. [Office routing and assignment](#5-office-routing-and-assignment)
6. [Incident lifecycle](#6-incident-lifecycle)
7. [Verification and the rewards system](#7-verification-and-the-rewards-system)
8. [The AI pipeline](#8-the-ai-pipeline)
9. [Lost and found](#9-lost-and-found)
10. [USG dashboard](#10-usg-dashboard)
11. [Privacy, security and moderation](#11-privacy-security-and-moderation)
12. [Architecture and tech stack](#12-architecture-and-tech-stack)
13. [Data model](#13-data-model)
14. [API and realtime events](#14-api-and-realtime-events)
15. [The 3D campus map](#15-the-3d-campus-map)
16. [Hackathon scope](#16-hackathon-scope)
17. [Implementation plan](#17-implementation-plan)
18. [Demo script](#18-demo-script)
19. [Judging criteria](#19-judging-criteria)
20. [FAQ](#20-faq)
21. [Risks and fallbacks](#21-risks-and-fallbacks)
22. [Adoption roadmap](#22-adoption-roadmap)
23. [Repo structure and setup](#23-repo-structure-and-setup)
24. [Sources](#24-sources)

---

## 1. The problem

When something breaks at USC, students have to know **which office** to tell and **which portal** that office uses. Facilities, Housing, IT, Hospitality, Transportation and DPS each have their own channel. So most problems are never reported, the same problem is reported many times in different places, and nobody can see what others already know.

| What happened | Source |
|---|---|
| Parkside ran on **one elevator for about 3 months** (Spring 2024), stranding residents with disabilities | [Daily Trojan](https://dailytrojan.com/?p=207328) |
| The University Religious Center has no elevator; a student on crutches nearly fell (Mar 2026) | [Daily Trojan](https://dailytrojan.com/2026/03/11/stairway-to-faith-and-community-roadblock-for-students/) |
| Students "fight for seats" in Leavey at midterms and finals, with no live view of open space | [Daily Trojan](https://dailytrojan.com/2024/04/09/extend-operating-hours-during-finals/) |
| Gates close at 8pm while some classes end at 9:30pm; students seen climbing a fence | [Daily Trojan](https://dailytrojan.com/2025/09/29/watt-way-entrance-no-longer-24-7/) |
| Bike racks full or removed; University Park leads LA in bike thefts | [Daily Trojan](https://dailytrojan.com/2025/09/26/usc-dps-cameras-theft-rates/) |
| Dining hall complaints (dirty plates, bugs) surface only through news stories | [Annenberg Media](https://www.uscannenbergmedia.com/2026/04/20/usc-students-report-dirty-plates-bugs-and-bad-cake-in-dining-halls/) |
| About 1,000 staff layoffs mean offices are stretched; anything that cuts their workload is attractive | [Daily Trojan](https://dailytrojan.com/2026/05/01/layoffs-delay-dornsife-viterbi-student-registration/) |

**The gap isn't a missing office.** It's the missing link between the students who *see* a problem and the people who can *fix* it.

---

## 2. The solution

One app, one photo, no need to know which office.

| Step | What happens |
|---|---|
| **Snap** | Student takes a live photo of the issue |
| **Protect** | Faces and license plates are blurred on the phone before upload |
| **Understand** | AI identifies the issue type, severity and accessibility impact |
| **Locate** | AI reads room numbers and signs to pin the issue on the right floor; GPS and one tap as a fallback |
| **Merge** | Duplicate reports become one incident with a confirmation count ("+14") |
| **Route** | The incident is assigned to the right office with a clean work order |
| **Fix** | The office marks it fixed; AI checks a new photo against the original |
| **Close the loop** | Everyone who reported or confirmed it gets "Fixed" and points |

**Why ChatGPT or Gemini can't replace it:** Ripple's data doesn't exist anywhere until a student creates it. No search engine or chatbot can know that an elevator is broken *right now*, that 23 residents confirmed the same AC failure, or that it was actually fixed.

---

## 3. How it helps students

"By Trojans" = students are the eyes. "For Trojans" = students get these back:

1. **Know before you go.** "Leavey L3 full, 12 min ago, +6" saves a wasted walk.
2. **Accessibility.** A student on crutches is alerted that an elevator is down, with an alternate accessible entrance, *before* reaching the stairs.
3. **Your complaint finally counts.** One email gets ignored. One incident with 23 photo confirmations, visible on a USG dashboard, does not.
4. **Get your stuff back.** A found item's photo is matched to your lost report automatically.
5. **See that it mattered.** Every reporter gets "Fixed" with the after photo, plus points.

---

## 4. User flows

### 4.1 Reporter (student)
1. Open Ripple and tap **Report**. The camera opens directly.
2. Take a photo. Faces blur instantly on screen.
3. Ripple shows what it understood: *"Elevator out of service · High · Accessibility impact · RTH, floor 3 · Facilities."* The student can correct type or floor with one tap.
4. If a matching open incident exists: *"Looks like this was already reported (+5). Confirm it?"* → **Confirm** or **It's different**.
5. Submit. The pin appears on the live map for everyone.
6. Later: *"Acknowledged by Facilities"* → *"In progress"* → *"Fixed ✅"* with the after photo and points.

### 4.2 Any student (viewer)
- The live map and feed show open incidents near them, filtered by type (Access, Broken, Blocked, Full, Dead zone).
- **Accessibility alerts** (opt-in): notified when an accessibility issue affects a building they use, with an alternate route.

### 4.3 Office staff (Facilities, Housing, IT, Hospitality, Transportation)
1. Open the **Office Portal**: a queue of incidents assigned to their office, sorted by severity and age.
2. Each incident shows the location, blurred photos, AI summary, confirmation count and a ready work order.
3. **Acknowledge** → **In progress** → **Mark fixed** (optionally with a photo).
4. Offices not yet on Ripple receive the same work order by **email** (see [5.4](#54-how-the-office-receives-it)).

### 4.4 USG
- The **USG dashboard** shows building health, time-to-fix per office and building, overdue incidents, chronic problems and accessibility downtime. It's evidence for advocacy and resolutions.

---

## 5. Office routing and assignment

This is the core of "you don't need to know which office."

### 5.1 Two inputs decide the office
1. **Issue category**, from the AI.
2. **Building type**, from our building table: residence hall, academic, dining, library, athletic, outdoor/path, parking.

### 5.2 Routing matrix (v1, to be confirmed with USG and offices)

| Issue category | Residence hall | Academic / library | Dining venue | Outdoor / paths / gates | Parking / transport |
|---|---|---|---|---|---|
| Elevator, door, ramp (access) | Housing | Facilities | Facilities | Facilities | Transportation |
| Plumbing, leak, AC, lights, fountain | Housing | Facilities | Hospitality | Facilities | Transportation |
| Classroom tech (projector, mic, wifi) | IT | IT | IT | IT | IT |
| Cleanliness, pests, food safety | Housing | Facilities | Hospitality | Facilities | Transportation |
| Blocked path, construction, gate | Facilities | Facilities | Facilities | Facilities | Transportation |
| Bike racks, shuttle stop | Transportation | Transportation | Transportation | Transportation | Transportation |
| "Full" (seating, line, racks) | No ticket; live status only | No ticket; live status only | No ticket; live status only | No ticket; live status only | No ticket; live status only |
| Safety hazard (exposed wiring, broken glass) | Facilities + DPS (non-emergency) copy | Facilities + DPS copy | Facilities + DPS copy | Facilities + DPS copy | Transportation + DPS copy |

Other routing rules:
- **Accessibility impact = true** → also copied to the accessibility services office (to be confirmed) and severity is at least High.
- **Emergencies** (fire, injury, someone in danger) are never routed through Ripple. The app shows **Call DPS** immediately.
- The matrix lives in a config table (`routing_rules`), so offices and USG can change it without code.

### 5.3 How assignment works
1. When a new incident is created (not a merge into an existing one), the routing function looks up `routing_rules` with `(category, building_type)`.
2. The incident gets `office_id`, `due_at` (from the SLA below) and a generated **work order**.
3. The incident appears in that office's queue in the Office Portal **and** is emailed to the office's intake address.
4. When confirmations cross thresholds (5, 15), the office gets an updated summary: "+15 confirmations, severity raised."

### 5.4 How the office receives it

| Channel | When | Content |
|---|---|---|
| **Office Portal** (Ripple web page) | Offices that adopt Ripple | Live queue, one-click status updates |
| **Email** | Every office from day one, including those not on Ripple | Formatted work order + link to the incident + a "mark fixed" link |
| **Ticketing integration** (future) | After the pilot | Push into the office's existing system via API |

**Generated work order example:**

```
RIPPLE INCIDENT #R-1042: Elevator out of service
Office:        Facilities
Severity:      HIGH (accessibility impact)
Location:      Ralph and Goldy Lewis Hall (RTH), Floor 3, main elevator bank
Reported:      Nov 15, 9:12 AM · 14 student confirmations
AI summary:    "Out of Service" sign posted on elevator doors; elevator not responding.
Photos:        3 (faces blurred) · link
Impact:        Students with mobility needs cannot reach floors 2–4.
Due (SLA):     Nov 16, 9:12 AM
Actions:       Acknowledge · In progress · Mark fixed  →  https://ripple.app/i/R-1042
```

### 5.5 SLAs and escalation

| Severity | Examples | Target to acknowledge | Target to fix |
|---|---|---|---|
| High | Elevator out, accessibility blocked, safety hazard | 4 hours | 24 hours |
| Medium | AC broken, leak, projector dead | 1 day | 3 days |
| Low | Printer out, cosmetic damage | 3 days | 7 days |

**Escalation:**
- Past the acknowledge target → reminder email to the office.
- Past the fix target → marked **Overdue** on the USG dashboard and the office lead is emailed.
- Severity also rises automatically with confirmations: 5+ → at least Medium, 15+ → High.

---

## 6. Incident lifecycle

```
            ┌─────────────┐
 photo ───▶ │  submitted  │
            └──────┬──────┘
          AI check │
       ┌───────────┴───────────┐
       ▼                       ▼
 ┌──────────┐            ┌──────────┐
 │ rejected │            │   open   │◀──────────────┐
 └──────────┘            └────┬─────┘               │
                 office acks  │                     │
                              ▼                     │
                       ┌──────────────┐             │
                       │ acknowledged │             │
                       └──────┬───────┘             │
                              ▼                     │
                       ┌──────────────┐             │
                       │ in_progress  │             │
                       └──────┬───────┘             │
           office marks fixed │                     │
                              ▼                     │
                ┌───────────────────────────┐       │
                │ fixed_pending_verification │       │
                └────────────┬──────────────┘       │
       new photo + AI check  │                      │
            ┌────────────────┴─────────────┐        │
            ▼                              ▼        │
      ┌──────────┐                   ┌──────────┐   │
      │ verified │                   │ reopened │───┘
      └──────────┘                   └──────────┘
```

- **rejected:** the AI or a moderator decided it isn't a valid issue (selfie, meme, reporting a person). No points.
- **verified:** the office marked it fixed **and** a fresh photo passed the AI before/after check (or a 48h window passed with no new reports). Points are paid.
- **reopened:** a student reports the same issue after "fixed." It goes back to open with priority.

---

## 7. Verification and the rewards system

### 7.1 Two-step verification
1. **AI check at submission:** Is it a real, recent photo of a campus issue? Is it a valid category? Is anyone being reported? Invalid → rejected.
2. **Office confirmation:** staff acknowledge (proving it's real) and later mark it fixed.
3. **Fix verification:** a new photo is compared with the original by the vision model ("Is the issue in photo A resolved in photo B?"). Pass → **verified**.

### 7.2 Points (paid only after verification)

| Action | Points | Paid when |
|---|---|---|
| First report of a new incident | +10 | Office acknowledges it |
| Confirming an existing incident | +3 | Office acknowledges it |
| Incident verified fixed | +5 bonus to reporter and confirmers | Fix verified |
| Fix-verification photo | +5 | Before/after check passes |
| Returning a lost item | +15 | Owner confirms the match |
| Report rejected as fake or spam | −10 | Moderator or AI rejection with high confidence |

### 7.3 Anti-gaming rules
- Live camera photos only; no gallery uploads.
- Max 10 reports per user per day; confirmations capped per incident (one per user).
- No points for a report until an office acknowledges it.
- Repeated rejections → temporary suspension.
- Points can't be transferred.

### 7.4 What points are for
- **Leaderboards** by residence hall and by student org (friendly competition drives use).
- **Badges:** "Campus Guardian," "Accessibility Ally," "Lost & Found Hero."
- **USG-sponsored rewards** (to be agreed): merch, event priority, recognition at USG meetings.

---

## 8. The AI pipeline

| Step | Where it runs | Technology |
|---|---|---|
| Face and plate blur | Phone (browser) | MediaPipe Tasks Vision face detector + canvas blur |
| Understand the issue | Server | Vision LLM (e.g. `claude-sonnet-5-5`) with a strict JSON schema |
| Read signs and room numbers | Server | The same vision call returns `sign_text` |
| Duplicate detection | Browser or server | CLIP image embeddings + building/type/time filters |
| Fix verification | Server | Vision LLM comparing before and after photos |
| Lost & found matching | Browser or server | CLIP embeddings + text similarity |

### 8.1 Understanding: structured output

```json
{
  "is_valid_issue": true,
  "rejection_reason": null,
  "category": "access | facility | classroom_tech | cleanliness | blocked | transport | full | safety_hazard",
  "subtype": "elevator_out",
  "severity": "low | medium | high",
  "accessibility_impact": true,
  "summary": "Out of Service sign posted on elevator doors; elevator not responding.",
  "sign_text": "RTH 3rd Floor",
  "floor_guess": 3,
  "confidence": 0.86
}
```

Prompt rules:
- Return JSON only.
- Reject photos of people as the subject, crime reports and emergencies (tell the app to show "Call DPS").
- Never invent a location; use `sign_text` only if it's visible.

### 8.2 Locating
1. **GPS** gives the building, the nearest building footprint within 40 m.
2. **`sign_text` / `floor_guess`** give the floor and room if readable.
3. If confidence is low → the student taps the floor (one tap). The student can always correct it.

### 8.3 Merging duplicates
A new report merges into an open incident when:
- same `building_code`, and
- same `category` (and compatible `subtype`), and
- the incident is open and within 24 h, and
- image embedding cosine similarity ≥ 0.80 **or** same floor.

The student sees "Already reported, confirm?" and decides. If they say "It's different," a new incident is created.

### 8.4 Fix verification
Input: the original photo and the new photo. Output:
```json
{ "resolved": true, "same_location": true, "confidence": 0.9, "note": "Out of Service sign removed; elevator doors open." }
```
- `resolved && same_location && confidence ≥ 0.7` → **verified**.
- Otherwise the incident stays in `fixed_pending_verification` until another photo arrives or 48 h pass with no new reports.

---

## 9. Lost and found

1. **Lost report:** description, category (phone, AirPods, ID, keys…), area and time, optional reference photo.
2. **Found report:** photo of the item and where it was left (e.g. "SAL front desk").
3. **Matching:** CLIP image similarity + category + distance + time window → ranked candidates.
4. Score ≥ threshold → the owner is pinged: *"Possible match: AirPods, SAL front desk, 2:10pm."*
5. The owner confirms ownership with a detail only they'd know (e.g. a case sticker), and the finder gets +15.
6. **No IDs or cards are shown in full.** Photos of USC IDs or cards are blurred except the name initial.

---

## 10. USG dashboard

| Panel | What it shows |
|---|---|
| Building health score | 0–100, from open incidents, severity and overdue count |
| Time-to-fix | Median per office and per building, trend over the semester |
| Overdue incidents | Past SLA, by office |
| Chronic problems | Same asset or location failing repeatedly ("this fountain: 5 times since Sept") |
| Accessibility downtime | Total hours accessibility issues stayed open |
| Semester replay (stretch) | Timeline animation of incidents opening (red) and closing (green) |

**Building health score (v1):**
```
score = 100
      - 8  × open_high
      - 4  × open_medium
      - 1  × open_low
      - 10 × overdue
clamped to [0, 100]
```

---

## 11. Privacy, security and moderation

| Concern | How Ripple handles it |
|---|---|
| People in photos | Faces and plates are blurred **on the device before upload**; only blurred images are stored |
| Reporting people | Not allowed. The AI rejects photos where a person is the subject; no "suspicious person" category |
| Crime and emergencies | Out of scope. The app shows **Call DPS** immediately |
| Fake or spam reports | USC login only, live photos only, rate limits, AI validation, office confirmation before points |
| Data access | Students see blurred photos and summaries; offices see their own queue; USG sees aggregates |
| Location privacy | Only the issue location is stored, never a user's location history |
| Accessibility info accuracy | Labeled "student-reported, confirmed by N students," never presented as official |
| AI mistakes | Every AI field can be corrected with one tap; offices see confidence scores |
| Data retention | Photos deleted 90 days after an incident is verified; aggregates kept |

---

## 12. Architecture and tech stack

```
 Phone (Next.js PWA)                     Server (Next.js API routes on Replit)
 ┌──────────────────────────┐            ┌──────────────────────────────────┐
 │ Camera capture            │            │ /api/report                      │
 │ MediaPipe face blur  ─────┼── blurred ─▶│   → vision LLM (JSON)            │
 │ CLIP embedding (optional) │   photo    │   → locate, merge, route         │
 │ MapLibre 3D map           │            │   → Supabase insert              │
 │ Realtime subscription ◀───┼────────────┤ /api/verify-fix → vision LLM     │
 └──────────────────────────┘            │ /api/lost-found/match            │
                                          │ email work orders (Resend/SMTP)  │
 Office Portal / USG Dashboard            └───────────────┬──────────────────┘
 (same Next.js app, role-based)                           │
                                          ┌───────────────▼──────────────────┐
                                          │ Supabase                          │
                                          │ Postgres + pgvector · Storage ·   │
                                          │ Auth (@usc.edu) · Realtime        │
                                          └───────────────────────────────────┘
```

| Layer | Choice | Why |
|---|---|---|
| Hosting | **Replit** | One place to build and deploy; eligible for Best Use of Replit |
| Frontend | **Next.js (React)**, mobile-first PWA | Phone and big screen from one codebase |
| Backend | Next.js API routes | No separate server |
| Database | **Supabase Postgres + pgvector** | SQL + vector similarity in one place |
| Storage | Supabase Storage | Blurred photos only |
| Auth | Supabase Auth, email OTP restricted to `@usc.edu` | Verified Trojans only |
| Realtime | Supabase Realtime | Live pins, alerts, "Fixed" notifications |
| On-device privacy | MediaPipe Tasks Vision | Blur before upload |
| Vision AI | Vision LLM via API (e.g. Claude Sonnet 5.5) | No training data needed |
| Embeddings | CLIP (transformers.js in browser) or an embeddings API | Duplicates, lost & found |
| Map | **MapLibre GL JS + OpenFreeMap tiles** | Free, no API key, 3D buildings from OpenStreetMap |
| Email | Resend or SMTP | Work orders to offices |

---

## 13. Data model

```sql
-- Buildings (seeded by hand for the demo area + OSM footprints)
create table buildings (
  code text primary key,              -- e.g. 'GHH', 'LVL', 'RTH', 'SAL'
  name text not null,
  building_type text not null,        -- residence | academic | library | dining | athletic | outdoor | parking
  floors int not null default 1,
  lat double precision, lng double precision,
  footprint geojson                   -- polygon for map + x-ray floors
);

-- Offices and routing
create table offices (
  id serial primary key,
  name text not null,                 -- Facilities, Housing, IT, Hospitality, Transportation
  intake_email text not null
);

create table routing_rules (
  category text not null,
  building_type text not null,
  office_id int references offices(id),
  cc_office_id int references offices(id),
  primary key (category, building_type)
);

-- Users
create table users (
  id uuid primary key,                -- Supabase auth id
  usc_email text unique not null,
  display_name text,
  role text not null default 'student',   -- student | office_staff | usg | admin
  office_id int references offices(id),   -- for office_staff
  points int not null default 0,
  accessibility_alerts boolean default false
);

-- Incidents (one per real-world problem)
create table incidents (
  id text primary key,                -- 'R-1042'
  category text not null,
  subtype text,
  severity text not null,             -- low | medium | high
  accessibility_impact boolean default false,
  building_code text references buildings(code),
  floor int,
  lat double precision, lng double precision,
  summary text,
  status text not null default 'open',   -- open | acknowledged | in_progress | fixed_pending_verification | verified | reopened | rejected
  office_id int references offices(id),
  confirmations int not null default 1,
  work_order text,
  due_at timestamptz,
  opened_at timestamptz default now(),
  acknowledged_at timestamptz,
  fixed_at timestamptz,
  verified_at timestamptz
);

-- Reports (every photo a student submits; many per incident)
create table reports (
  id uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id),
  user_id uuid references users(id),
  kind text not null,                 -- original | confirm | fix_photo
  photo_url text not null,            -- blurred
  embedding vector(512),
  ai_json jsonb,
  created_at timestamptz default now()
);

-- Lost & found
create table lost_found (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  kind text not null,                 -- lost | found
  item_category text,
  description text,
  photo_url text,
  embedding vector(512),
  location_text text,
  building_code text references buildings(code),
  status text default 'open',         -- open | matched | returned
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  lost_id uuid references lost_found(id),
  found_id uuid references lost_found(id),
  score real,
  confirmed boolean default false
);

-- Points ledger (auditable)
create table point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  incident_id text references incidents(id),
  reason text,                        -- first_report | confirm | fixed_bonus | fix_photo | lost_found_return | penalty
  points int not null,
  created_at timestamptz default now()
);
```

---

## 14. API and realtime events

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/report` | Blurred photo + GPS → AI understand → locate → merge-or-create → route → returns incident + "confirm?" suggestion |
| POST | `/api/report/confirm` | Attach a report to an existing incident |
| PATCH | `/api/incidents/:id/status` | Office: acknowledge, in progress, mark fixed |
| POST | `/api/incidents/:id/verify-fix` | New photo → AI before/after → verified or pending |
| POST | `/api/lost-found` | Create a lost or found entry → returns ranked matches |
| POST | `/api/lost-found/:matchId/confirm` | Owner confirms the match → points |
| GET | `/api/incidents?bbox=&status=` | Map data |
| GET | `/api/usg/summary` | Dashboard aggregates |

**Realtime channels (Supabase):**
- `incidents:*`: new, updated (status, confirmations) → map pins and ripples
- `notifications:user_id`: "Fixed," "Possible match," accessibility alerts, points

---

## 15. The 3D campus map

- **Engine:** MapLibre GL JS with OpenFreeMap vector tiles. Buildings are extruded in 3D from OpenStreetMap height data. **No Blender required.**
- **Style:** dark base, light-grey buildings, USC cardinal (#990000) for open incidents, green for fixes.
- **X-ray floors (Ginsburg Hall and Leavey only for the demo):** each floor is a separate `fill-extrusion` layer with `fill-extrusion-base` and `fill-extrusion-height` set per floor, with a small gap, so the building appears sliced. The affected floor is highlighted.
- **Pins and ripples:** an HTML marker per incident plus an animated expanding circle (red on new or confirmed, green on verified).
- **Missing heights:** hand-set heights for about 10 key buildings in the `buildings` table.
- **Attribution:** "© OpenStreetMap contributors" shown on the map.

---

## 16. Hackathon scope

### Built and demoed
- Report loop: snap → blur → understand → locate → merge → route → work order → office status → fix verification → notifications
- Rewards: points ledger, points shown in the "Fixed" notification, simple leaderboard
- Lost & found photo matching
- Office Portal (minimal queue + status buttons)
- USG dashboard (health score, time-to-fix, overdue, chronic)
- 3D map with x-ray floors for 2 buildings

### Vision only (on the roadmap slide)
- **Ask:** ask a place a question; students there answer with a photo
- **Favors:** small help between nearby students
- **Lantern:** walk-together groups after night classes
- **Trojan Pass:** verified identity wallet and badges
- Office ticketing integrations, native apps, campus-wide indoor maps

### Rules for the demo
- Fake demo data only ("Tommy Trojan"); no real personal information
- No imitation of official USC systems or branding; Ripple is presented as a student-built layer that feeds them

---

## 17. Implementation plan

### Roles

| Role | Owns |
|---|---|
| **AI / CV lead** | Face blur, vision prompt + JSON, locating from signs, merge logic, fix verification, lost & found matching |
| **Frontend lead** | Phone UI (camera, review card, confirm dialog, feed, notifications), Office Portal UI, big-screen layout, animations |
| **Backend + map lead** | Supabase schema + auth + realtime, API routes, routing rules + work orders + email, points ledger, MapLibre 3D map + x-ray floors, USG dashboard, pitch/video/deck |

### Prep (night before)
- [ ] Confirm hackathon rules on pre-written code with the organizers
- [ ] Create the Replit project (Next.js) and the Supabase project; run the schema
- [ ] Get an LLM API key; test one vision call on a photo of an "Out of Order" sign
- [ ] Seed `buildings` (about 15 around the venue), `offices`, `routing_rules`
- [ ] Get MapLibre + OpenFreeMap rendering USC in 3D
- [ ] Print demo props ("Out of Order," "Elevator Closed," "Wet Floor") and bring a lanyard for lost & found

### Build timeline

| Time | AI / CV | Frontend | Backend + map |
|---|---|---|---|
| Sat 10am–1pm | Vision JSON + face blur | Camera + review card | Auth, upload, `/api/report`, pins on map |
| 1–2pm | **Checkpoint 1:** snap → blurred → AI JSON → pin on map | | |
| 2–6pm | Merge logic, sign reading | Confirm dialog, feed, notifications | Routing + work orders + email; Office Portal API; x-ray floors |
| 6–7pm | **Checkpoint 2:** report → merge "+3" → office ack → visible live on 2 phones + big screen | | |
| 7–11pm | Fix verification, lost & found matching | Office Portal UI, lost & found screens | Points ledger, verify-fix flow, USG dashboard |
| 11pm–2am | Accuracy tuning | Polish and animations | Dashboard polish; deck |
| 2–7am | Sleep in shifts (2 awake) | | |
| **Sun 7am** | **Code freeze** → rehearse the demo 3× | | |
| 9–10:30am | Record the 3-min video | Screenshots | Devpost write-up + deck |
| 10:30–10:45am | **Submit** with all teammates added | | |

### Definition of done (demo-ready)
- [ ] A judge can snap a sign and see a pin on the correct floor within 10 seconds
- [ ] Three snaps of the same issue merge into one incident with "+3"
- [ ] The Office Portal can acknowledge and mark fixed
- [ ] A fix photo passes verification and every reporter's phone shows "Fixed" + points
- [ ] A found item matches a lost report and pings the owner
- [ ] The USG dashboard updates live
- [ ] The full demo runs 3 times in a row without failure

---

## 18. Demo script (3 minutes)

| Time | Beat | What happens |
|---|---|---|
| 0:00 | Hook | "Parkside ran on one elevator for three months. USC has five offices and five portals, so almost nobody reported it." |
| 0:20 | Report | A judge snaps a staged "Out of Order" sign. Faces in the background blur instantly. Ginsburg Hall goes x-ray on the big screen and the right floor pulses red. |
| 0:50 | Merge + route | Two more judges snap it → "+3," severity rises. The Facilities work order appears; the incident lands in the Office Portal queue. |
| 1:20 | Accessibility | Switch to "Elevator Closed." Opted-in users get an alert with the alternate accessible entrance. |
| 1:45 | Lost & found | A teammate's "lost" lanyard is found and snapped by a judge; the match pops on the owner's phone. |
| 2:05 | Fixed | A teammate (as Facilities) marks it fixed; the sign comes down; a judge snaps again; AI verifies. A green ripple spreads and every judge's phone shows "Fixed ✅ +15 points." |
| 2:35 | Close | USG dashboard (health score, time-to-fix) → vision slide (Ask, Favors, Lantern, Trojan Pass). "For Trojans, by Trojans. Ripple." |

---

## 19. Judging criteria

| Criterion | Weight | Ripple |
|---|---|---|
| Impact & campus relevance | 30% | Every student, every building, every day; accessibility as the emotional core; documented by campus press |
| Technical & AI execution | 25% | On-device privacy, vision understanding, locating from signs, embedding-based merging, before/after verification, photo matching; secure by design |
| Feasibility & implementation | 25% | USG runs it; offices get email work orders from day one; USC changes nothing at launch; AI costs a few cents per report |
| UX & design | 20% | 3D campus with x-ray floors and ripples; judges use it on their own phones |

---

## 20. FAQ

**Isn't this just a reporting app? USC already has request forms.**
USC has forms, and students don't use them because they don't know which office or form. Ripple needs one photo, protects privacy before upload, merges duplicates so an office gets one clean ticket instead of 14 emails, and proves the fix.

**Why can't students just use ChatGPT or Gemini?**
A chatbot can't know what's broken right now, how many students saw it, or whether it was fixed. That data only exists because students create it in Ripple.

**How does Ripple know which office to send it to?**
The AI classifies the issue; the building table knows the building type; a routing table maps (category, building type) → office. See [section 5](#5-office-routing-and-assignment). USG and offices can edit the table without code.

**What if an office doesn't use Ripple?**
They still get every work order by email, with a link to update status. The Office Portal is optional at first.

**What stops fake reports or point farming?**
USC login, live photos only, rate limits, AI validation, and points paid only after an office acknowledges the report. Rejected reports cost points.

**What about privacy?**
Faces and plates are blurred on the phone before upload. Only blurred photos are stored. No reporting people, no location history.

**Is it safe to rely on for accessibility?**
It's labeled "student-reported, confirmed by N students," and it supplements official channels. Emergencies always go to DPS.

**Why would students keep using it?**
They get value back: live status before walking somewhere, accessibility alerts, lost items returned, "Fixed" notifications, points and leaderboards.

**Who runs and pays for it?**
USG runs it. Costs are hosting plus a few cents of AI per report. Offices need no new software to start.

**Does this need many users to work?**
No. A single report already reaches the right office with a clean work order. More users add confirmations and better live status.

**What if the AI gets something wrong?**
Every AI field can be corrected with one tap; offices see confidence scores; fix verification falls back to time-based closure if photos disagree.

---

## 21. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Wifi fails on stage | Phone hotspot; pre-recorded demo video |
| AI misreads a photo | Rehearsed props; one-tap correction |
| 3D lags on phones | Phones show a flat map; the big screen shows 3D |
| Merge misfires | "Already reported, confirm?" dialog lets the student decide |
| No sign visible for the floor | GPS picks the building; the student taps the floor |
| iPhone push unsupported | In-app alerts via Supabase Realtime |
| OpenStreetMap lacks building heights | Hand-set heights for key buildings |

---

## 22. Adoption roadmap

| Phase | When | What |
|---|---|---|
| Pilot | Spring 2027, 1 month | One residence hall + Leavey Library; email routing to Housing and Facilities; USG dashboard |
| Expand | Rest of Spring 2027 | All residence halls and main academic buildings; Office Portal for Facilities and Housing |
| Integrate | Fall 2027 | Push into offices' existing ticketing systems; add Ask and Favors |
| Campus-wide | 2027–28 | Full indoor maps, Lantern walk groups, Trojan Pass identity and rewards |

**Success metrics for the pilot:**
- reports per week,
- median time-to-acknowledge and time-to-fix,
- percentage of incidents verified fixed,
- duplicate reports merged (staff time saved),
- student satisfaction.

---

## 23. Repo structure and setup

```
ripple/
├── app/
│   ├── page.tsx                 # live map + feed
│   ├── report/                  # camera → review → submit
│   ├── incident/[id]/           # incident detail
│   ├── lost-found/
│   ├── office/                  # Office Portal (role: office_staff)
│   ├── usg/                     # USG dashboard (role: usg)
│   └── api/
│       ├── report/route.ts
│       ├── report/confirm/route.ts
│       ├── incidents/[id]/status/route.ts
│       ├── incidents/[id]/verify-fix/route.ts
│       ├── lost-found/route.ts
│       └── usg/summary/route.ts
├── lib/
│   ├── blur.ts                  # MediaPipe face blur (client)
│   ├── vision.ts                # vision LLM calls + JSON schema
│   ├── locate.ts                # GPS → building, sign → floor
│   ├── merge.ts                 # duplicate detection
│   ├── route.ts                 # routing rules + work order + SLA
│   ├── points.ts                # points ledger
│   └── supabase.ts
├── components/
│   ├── CampusMap.tsx            # MapLibre 3D + x-ray floors + ripples
│   ├── CameraCapture.tsx
│   └── IncidentCard.tsx
├── supabase/
│   ├── schema.sql
│   └── seed.sql                 # buildings, offices, routing_rules, demo users
└── README.md
```

**Environment variables**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LLM_API_KEY=
EMAIL_API_KEY=
```

Never commit real keys. Use Replit Secrets.

**Run locally**
```bash
npm install
npm run dev
```

---

## 24. Sources

- [Parkside elevator outage](https://dailytrojan.com/?p=207328) (Daily Trojan)
- [University Religious Center accessibility](https://dailytrojan.com/2026/03/11/stairway-to-faith-and-community-roadblock-for-students/) (Daily Trojan, Mar 2026)
- [Leavey crowding at finals](https://dailytrojan.com/2024/04/09/extend-operating-hours-during-finals/) (Daily Trojan)
- [Watt Way gate hours](https://dailytrojan.com/2025/09/29/watt-way-entrance-no-longer-24-7/) (Daily Trojan, Sep 2025)
- [DPS report on thefts](https://dailytrojan.com/2025/09/26/usc-dps-cameras-theft-rates/) (Daily Trojan, Sep 2025)
- [Dining hall complaints](https://www.uscannenbergmedia.com/2026/04/20/usc-students-report-dirty-plates-bugs-and-bad-cake-in-dining-halls/) (Annenberg Media, Apr 2026)
- [Layoffs and advising delays](https://dailytrojan.com/2026/05/01/layoffs-delay-dornsife-viterbi-student-registration/) (Daily Trojan, May 2026)
- [AI@USC Hackathon venue map](https://hub.aiusc.org/map)

*Office names, routing rules, SLAs and rewards are proposals for the hackathon and must be confirmed with USG and the relevant USC offices before any real deployment.*
