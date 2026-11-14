# Dynamic categories — what P1 and P2 need to change (from P3)

Agent: the team decided categories must not be limited to 3. README §5 is updated: **the `routing` table is the
single source of truth**, one row per category. P3's side is done (AI reads categories from `routing` at request
time and can suggest new ones). Your files still hard-code the 3 categories, so a new category would be **rejected
on save** and have **no label/icon in the UI**. Delete this file when everything is done.

## P2 — database + `/api/reports` + types

### 1. Run in Supabase SQL editor (and copy into `supabase/schema.sql` / `supabase/seed.sql`)
```sql
alter table routing add column if not exists label text;
alter table routing add column if not exists description text;

update routing set label = 'Elevator / accessibility',
  description = 'elevators, ramps, automatic doors, blocked accessible paths' where category = 'elevator_access';
update routing set label = 'Broken equipment',
  description = 'lights, doors, furniture, water fountains, restrooms, leaks' where category = 'broken_equipment';
update routing set label = 'Tech',
  description = 'printers, Wi-Fi, screens/projectors, charging stations' where category = 'tech';

insert into routing (category, label, description, team_name, team_email) values
  ('grounds',     'Grounds & outdoor',   'bike racks, pavement and broken bricks, benches, outdoor lighting, landscaping, irrigation', 'Facilities — Grounds', null),
  ('cleanliness', 'Trash & cleanliness', 'overflowing trash or recycling bins, litter, spills, graffiti, pests', 'Facilities — Custodial', null),
  ('other',       'Other',               'any other campus facilities problem that fits no other category', 'Facilities — Customer Service', null)
on conflict (category) do nothing;
```
Office names are placeholders: verify real USC offices (README §5). `issues.category` already has a foreign key
to `routing(category)`, so the DB itself rejects unknown categories; no CHECK constraint to change.

### 2. `lib/types.ts`
`export type Category = string;` (ids come from `routing`). Add to `AnalyzeResult`:
`suggested_new_category?: { id: string; label: string } | null;`

### 3. `app/api/reports/route.ts`
Remove the hard-coded `const CATEGORIES = [...]` check. Either look the id up in `routing`
(`select category ... eq category ... maybeSingle()` → 400 "Unknown category") or rely on the FK error.

### 4. Locations used in P3's test photos (not in `locations` yet)
Add them if we want real reports there. **Drop a pin for real coordinates; don't guess.**
- `ann`: Wallis Annenberg Hall (3630 Watt Way)
- `gfs`: Grace Ford Salvatori Hall (3601 Watt Way), USC Dornsife's main building (P1's `lib/campus.ts` calls it `sal`; pick one id)
- `rri`: Ray R. Irani Hall (1050 Childs Way)

## P1 — UI (`lib/campus.ts`, report form, map filters, feed, issue page, `components/Icon.tsx`)
- Load categories at runtime: `supabase.from("routing").select("category, label, description, team_name")`
  (public read is allowed by RLS). Cache in memory; fall back to the current 3 if the request fails.
- Keep an **icon map for known ids** and a default icon (e.g. `Tag`) for any other id:
  `elevator_access`, `broken_equipment`, `tech`, `grounds` (e.g. `Trees`/`Bike`), `cleanliness` (e.g. `Trash2`), `other` (`CircleHelp`).
- Replace `CATEGORIES[c]` lookups with the loaded list (label = `label ?? id`, team = `team_name`).
  Every place that indexes `CATEGORIES[...]` must tolerate an unknown id (`?.` + default) so a new row never crashes a screen.
- Report form: category `<select>` from the loaded list. If `/api/analyze` returns `suggested_new_category`, show a small
  hint under it: "AI suggests a new category: {label}". The student still picks an existing one (we only save existing ids).

## Admin (whoever builds /admin, optional)
Show `suggested_new_category` hints and an "Add category" form that inserts a `routing` row
(id, label, description, team_name, team_email) via a passcode-protected admin route. The AI uses it within ~60 s.
