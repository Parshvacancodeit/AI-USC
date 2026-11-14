# Notes for whoever builds /admin (Parshva / P2) — from P3

Agent: read this before building the admin side. README §7 "Admin dashboard" and §8 "Admin" are the spec; this file only lists what's missing and how to wire the P3 AI routes into it. Delete this file when everything is done.

## Status (Sat Nov 14, after `24fc75d`)
- [ ] `app/admin/page.tsx` — **not built**. "Demo office dashboard" (README §7): passcode, tabs Open / Assigned / Resolved, issue cards.
- [ ] `POST /api/admin/assign` — **not built** (README §8): `status='assigned'`, `assigned_team` from `routing`.
- [ ] `POST /api/admin/resolve` — **not built** (README §8): `status='resolved'`, `resolved_at=now()`. This is what shows "✅ Fixed" on phones.
- [x] `POST /api/admin/verify-fix` — P3, done.
- [x] `POST /api/admin/work-order` — P3, done.

Without assign + resolve + /admin, the demo loop (README §2) stops at "report saved". Feature freeze is **2 AM**.

All admin routes take header `x-admin-passcode` (server checks `ADMIN_PASSCODE`; set it in `.env.local` and Vercel).

## Card flow
**Assign** → **Upload after photo** (verify-fix) → **Confirm resolved**, plus **Generate work order** on any card.

## Wire-up: Upload after photo → `POST /api/admin/verify-fix`
- Body `{ issueId, imageBase64 }`. Compress first with `prepareImage(file)` from `lib/image.ts` (base64, no `data:` prefix).
- Response `{ same_location, resolved, confidence, reason, after_photo_url }`.
- Show before photo and `after_photo_url` side by side, then the verdict, e.g. "AI: Resolved (0.92) — light is working again" or "AI: Not resolved — {reason}".
- AI is advisory: always let the admin press **Confirm resolved** (→ `/api/admin/resolve`) whatever the verdict.
- If the AI is down you still get 200 with `resolved:false` and reason "AI check unavailable. Confirm manually."
- Errors: 401 → "Wrong passcode", 404 → "Issue not found", 413 → "Photo too large", 503 → "Supabase not configured", else "Upload failed, try again".

## Wire-up: "Generate work order" → `POST /api/admin/work-order`
- Body `{ issueId }`. Response `{ subject, body, urgency_note, to, team_name, ai }`.
- While loading (~2–8 s): disable the button, label "Drafting…".
- On success show:
  - **Subject:** {subject} (bold)
  - {body} in a `whitespace-pre-wrap` box (plain text, no markdown)
  - {urgency_note} as a small line underneath
  - `To: {team_name}` and, if `to` is not null, ` ({to})`
  - if `ai === false`: small grey tag "Template (AI unavailable)". The fields are still complete.
- **Copy** button: `navigator.clipboard.writeText("Subject: " + subject + "\n\n" + body)`, then "Copied ✓" for 2 s.
- **Email** link only when `to` is set:
  `href={"mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body)}`, tap target ≥ 44 px.
- Errors: 401 → "Wrong passcode", 404 → "Issue not found", anything else → "Couldn't load the issue, try again". AI failure never errors; it falls back to the template.

## Data notes
- `routing.team_email` is null for all 3 rows, so `to` is null and the Email link stays hidden until real emails are added (verify real USC offices, README §5).
- Please add `app/api/admin/work-order/**` to the P3 row in AGENTS.md.
- Questions about the AI routes → ask Bhavya (P3).
