# Notes for P2 (Supabase) — from P3

P2's agent: please read this, act on it, then tell your human what's done. Delete this file (or tick the boxes) when everything is done.
Checked read-only on Sat Nov 14 by P3. Tables, columns, routing rows and both public buckets match README §6.

## Please confirm in the Supabase dashboard (P3 couldn't check these from code)
- [ ] **Anonymous sign-ins enabled:** Authentication → Sign In / Providers → "Allow anonymous sign-ins". Without it `/api/reports` has no reporter id.
- [ ] **Realtime on for `issues`:** Database → Publications → `supabase_realtime` includes `issues` (README §6 `alter publication ...`). Without it phones never show "Fixed".

## Vercel env vars
- [ ] `NEXT_PUBLIC_SUPABASE_URL` must be the **base URL** `https://<project>.supabase.co`. Don't use the `.../rest/v1/` API URL; every query fails with "Invalid path specified in request URL".
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret) in Vercel → Settings → Environment Variables, then redeploy.

## Locations mismatch (P1 + P2 agree, then one of you fixes it)
- `locations` table has 3 rows: `leavey`, `ginsburg`, `parkside`.
- `lib/campus.ts` (P1) lists 5: those 3 + **`rth` (Ronald Tutor Hall)** and **`sal` (Salvatori CS Center)**.
- A report at `rth`/`sal` fails the `issues.location_id` foreign key. Either add them to `supabase/seed.sql` + the DB, or drop them from `lib/campus.ts`.
- Coordinates also differ between the two (Ginsburg by ~230 m, Parkside by ~100 m). Pick one set (pin dropped in Google Maps) and use it in both.

## What P3's routes need from P2 (already satisfied, don't rename)
- `issues`: `id, location_id, category, title, description, status, reporter_count, before_photo_path, after_photo_path, ai_fix_verdict, created_at, updated_at`
- `/api/reports` should store the report photo path in `issues.before_photo_path` relative to the `report-photos` bucket (e.g. `{issueId}/{reportId}.jpg`). `/api/duplicates` and `/api/admin/verify-fix` download it from there.
- When `lib/supabase-server.ts` lands, tell P3 so `lib/ai-storage.ts` can switch to it.

## Admin side
- See `NOTES_FOR_ADMIN.md`: `/admin` page, `/api/admin/assign` and `/api/admin/resolve` are not built yet, plus how to wire the P3 AI routes into the dashboard.
