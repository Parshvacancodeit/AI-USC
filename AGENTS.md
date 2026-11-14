# Rules for every AI coding agent on this repo

Three humans each run their own agent (Claude Code, Cursor, Codex…). All agents follow this file.

## 0. Before writing any code
1. **Ask your human which role they are: P1, P2 or P3** (unless they already said). Only edit files your role owns.
2. **Read `README.md`.** It is the spec. Do not invent features, tables, routes or fields that are not in it.
3. `git pull --rebase` first, every session.

## 1. Who owns what
| Role | Person | Files you may edit |
|---|---|---|
| **P1 Frontend** | Parshva (@Parshvacancodeit) | `app/page.tsx`, `app/report/**`, `app/issue/**`, `components/**`, `app/globals.css`, `lib/api.ts` (client data layer + mocks), `lib/campus.ts` (UI constants) |
| **P2 Backend** | ________ | `lib/types.ts`, `lib/supabase-*.ts`, `lib/geo.ts`, `supabase/**`, `app/api/reports/**`, `app/api/admin/assign/**`, `app/api/admin/resolve/**`, `app/admin/**` |
| **P3 AI** | Bhavya | `lib/ai.ts`, `lib/ai-storage.ts`, `lib/faceBlur.ts`, `lib/image.ts`, `app/api/analyze/**`, `app/api/duplicates/**`, `app/api/admin/verify-fix/**` |
| Shared (ask the team first) | | `package.json`, `package-lock.json`, `app/layout.tsx`, `next.config.ts`, `README.md`, `AGENTS.md` |

Need a change in someone else's file? **Don't edit it.** Tell your human what to ask for in the team chat.

## 2. Contracts = README is law
- DB schema → README §6. API request/response shapes → README §8. Prompts → README §9.
- Shared TypeScript types live in `lib/types.ts` (P2 writes them from README §6 + §8, first thing).
- If a contract must change: update README first, tell the team, then code.

## 3. Never block on others: mock first
- Until a route/function exists, use a mock with the exact README shape, marked `// MOCK: remove when <route> lands`.
- P1 until P3 ships blur: `const blurFaces = async (f: File) => f; // MOCK`.

## 4. Git (small and often)
```bash
git pull --rebase
npm run build          # must pass before every push
git add <only your files> && git commit -m "P1: camera preview"
git push
```
- Commit message starts with your role (`P1:`, `P2:`, `P3:`).
- Work on `main`, commit every 30–60 min. Never force-push. Never rewrite others' commits.
- On a rebase conflict in a file you don't own: keep **their** version.

## 5. Hard rules
- No secrets in code or commits. Server-only keys (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_PASSCODE`) never in client components.
- No new npm packages without the team agreeing (then one person adds it and pushes package files immediately).
- Mobile-first: 390 px wide, tap targets ≥ 44 px. Loading + error state on every async step.
- `CampusMap` via `next/dynamic` with `ssr: false`.
- Out of scope list in README §2 is off limits.
