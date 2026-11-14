# Ripple backend requirements (for P2)

The admin console (`/admin`) and the student app are built. The console runs in **preview mode**: it reads real
`issues`, but office actions are stored in the browser only. This doc lists everything the database and API need
so we can switch it to real. Nothing below has been applied to Supabase yet.

Status today (read-only check): tables `locations`, `routing` (with `label`, `description`), `issues`, `reports`;
buckets `report-photos`, `resolution-photos`; anonymous sign-in on; Realtime on `issues`.

---

## 1. Login and roles

| Who | How they sign in (production) | Today |
|---|---|---|
| Students | Supabase Auth, **USC email only** (magic link or Google SSO restricted to `usc.edu`). Keep anonymous sign-in for the demo. | Anonymous |
| Office staff | Same auth + a row in `staff` with a role | Passcode (`ADMIN_PASSCODE`) |

**New table `staff`**
```
user_id     uuid primary key references auth.users
name        text not null
email       text not null
role        text not null check (role in ('dispatcher','office_admin','usg_viewer','superadmin'))
office      text            -- e.g. 'Facilities — Maintenance'; null = all offices
created_at  timestamptz default now()
```
- `dispatcher`: sees and acts on issues for their `office`.
- `office_admin`: + edit routing for their office, export.
- `usg_viewer`: read-only, all offices (dashboard + building health).
- `superadmin`: everything, manage staff.

**New table `profiles`** (students, needed for login + rewards)
```
user_id      uuid primary key references auth.users
handle       text not null            -- anonymous display name, e.g. "Golden Spartan 82"
usc_email    text unique              -- null while anonymous
accessibility_alerts boolean default true
fixed_alerts boolean default true
created_at   timestamptz default now()
```

## 2. Changes to `issues`

```
status            add value 'rejected'   (open | assigned | resolved | rejected)
assignee          text                   -- technician / crew name
duplicate_of      uuid references issues(id)
rejected_reason   text check (rejected_reason in ('not_an_issue','duplicate','emergency_dps','inappropriate','outside_scope'))
assigned_at       timestamptz
first_response_at timestamptz            -- first office action (SLA metric)
updated_by        uuid references auth.users
```
Keep `assigned_team` as the office. When the problem type is changed, `assigned_team` follows the new `routing` row.

## 3. Audit trail: new table `issue_events`

Every office action and every student report writes one row. Powers the Timeline and Activity views.
```
id         uuid primary key default gen_random_uuid()
issue_id   uuid not null references issues(id) on delete cascade
actor_id   uuid references auth.users      -- null for system
actor_name text not null                   -- shown in UI
type       text not null check (type in ('created','confirmed','assigned','status','priority','rerouted','note','after_photo','verified','resolved','reopened','rejected','merged','work_order'))
text       text not null                   -- human summary, e.g. "Assigned to ITS"
data       jsonb                           -- old/new values, AI verdict, etc.
created_at timestamptz default now()
```

## 4. Internal notes: new table `issue_notes`
```
id uuid pk, issue_id uuid fk, author_id uuid fk, author_name text, text text not null, created_at timestamptz default now()
```
Staff-only (RLS), never sent to students.

## 5. Routing (offices)

Already exists. Add:
```
team_email   text      -- where work orders go (verify real USC office addresses)
sla_hours    int       -- target time to fix, for "overdue" flags
active       boolean default true
```

## 6. API routes the console will call

All require a staff session (check `staff.role` + `office`), write an `issue_events` row, and use the service role.

| Route | Body | Does |
|---|---|---|
| `POST /api/admin/assign` | `{ issueId, office?, assignee? }` | status → assigned, set office/assignee, `assigned_at` |
| `POST /api/admin/update` | `{ issueId, priority?, category?, office?, assignee? }` | edit fields; category change re-routes |
| `POST /api/admin/resolve` | `{ issueId, note?, afterPhotoBase64? }` | upload `resolution-photos/{issueId}.jpg`, status → resolved, `resolved_at`. **Realtime update makes every reporter's phone show "Fixed".** |
| `POST /api/admin/reopen` | `{ issueId, reason? }` | status → open, clear `resolved_at` |
| `POST /api/admin/reject` | `{ issueId, reason }` | status → rejected |
| `POST /api/admin/merge` | `{ issueId, intoIssueId }` | `duplicate_of`, move reports' count to target, status → rejected (duplicate) |
| `POST /api/admin/notes` | `{ issueId, text }` | add internal note |
| `POST /api/admin/verify-fix` | exists (P3) | AI before/after check; advisory only. **AI is paused to save credits.** |
| `POST /api/admin/work-order` | exists (P3) | AI work order text; console has a template fallback |
| `POST /api/admin/work-order/send` | `{ issueId }` | email to `routing.team_email` (Resend or Supabase SMTP) |
| `GET /api/admin/export.csv` | filters | server CSV export (console exports client-side today) |

## 7. Row Level Security

- `issues`, `locations`, `routing`: public **read** stays (map). Writes only via server routes.
- `reports`: public read of `issue_id, reporter_id, created_at` only (leaderboard); no client writes.
- `issue_events`, `issue_notes`, `staff`: read for staff only; `issue_events` of type `created/assigned/resolved` may be shown to the reporting student.
- `profiles`: a user reads/updates only their own row; `handle` readable by all (leaderboard).

## 8. Rewards (karma, tiers, badges, leaderboard)

**Today:** nothing is stored. The Me tab computes karma on the fly from `reports` + `issues`
(`lib/karma.ts`): +10 first to report, +5 confirm, +20 when it's fixed. Identity = the anonymous user id, so karma
is lost if the phone's browser data is cleared.

**Needed for login:**
- `profiles` (above) holds the handle.
- **New table `karma_events`** (so points can't be faked and survive device changes):
  ```
  id uuid pk, user_id uuid fk, issue_id uuid fk, kind text check (kind in ('first','confirm','fixed','bonus','penalty')),
  points int not null, created_at timestamptz default now(), unique (user_id, issue_id, kind)
  ```
  Written by `/api/reports` (first/confirm) and `/api/admin/resolve` (fixed, for every reporter).
  `penalty` when staff reject a report as inappropriate.
- **View `leaderboard`**: `select user_id, handle, sum(points) ... group by user_id order by 2 desc` (weekly + all-time).
- Anti-abuse: rate limit reports per user (e.g. 10/hour), no points for rejected reports.

## 9. Locations

`locations` now grows automatically (P1): a report at a new building inserts `osm-w…`/`osm-r…` rows; an outdoor spot
inserts `spot-…` with exact `lat/lng` and a name like "Near Beigler Hall of Engineering (southwest side)".
Optional columns: `kind text ('building','spot')`, `parent_building text` for spots.

## 10. Notifications

- In-app "Fixed" alert: Realtime `UPDATE` on `issues` (works today once resolve writes to the DB).
- Accessibility alerts: when an `elevator_access` issue opens, notify users with `profiles.accessibility_alerts`.
- Optional later: email to reporters on fix (needs USC email from login).

## 11. Metrics the console shows (all derivable from the tables above)

Open, in progress, fixed today, median time to fix, accessibility issues open, reports last 24 h, active issues per
office, building health score (open load by priority, repeat problems with 3+ reports, average fix time over 3 days),
audit trail, CSV export.
