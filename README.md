# Ripple: the campus that helps itself

> Snap it. We route it. You see it fixed.
>
> Built at the **AI@USC Hackathon** (HackSC x USC AI Committee), Nov 14–15, 2026. *For Trojans, by Trojans.*

Ripple is a live campus map powered by student observations. Students photograph problems, confirm what others already reported, and get notified when the issue is fixed. Reports go to the office that already owns the problem, so USC doesn't have to change any system.

**This README is the product overview: what Ripple is, why it matters, and how it would be adopted.**
**The build spec (scope, schema, API contracts, AI prompts, team ownership, timeline) is [`CLAUDE.md`](CLAUDE.md). If the two ever disagree, `CLAUDE.md` wins.**

---

## The problem

USC runs on 5+ offices and portals: Facilities, Housing, IT, Hospitality, Transportation. Students don't know where to report things, the same problem gets reported many times or not at all, and nobody can see what's broken right now.

| What happened | Source |
|---|---|
| Parkside ran on **one elevator for about 3 months** (Spring 2024), stranding residents with disabilities | [Daily Trojan](https://dailytrojan.com/?p=207328) |
| The University Religious Center has no elevator; a student on crutches nearly fell (Mar 2026) | [Daily Trojan](https://dailytrojan.com/2026/03/11/stairway-to-faith-and-community-roadblock-for-students/) |
| Students "fight for seats" in Leavey at midterms and finals | [Daily Trojan](https://dailytrojan.com/2024/04/09/extend-operating-hours-during-finals/) |
| Dining hall complaints (dirty plates, bugs) surface only through news stories | [Annenberg Media](https://www.uscannenbergmedia.com/2026/04/20/usc-students-report-dirty-plates-bugs-and-bad-cake-in-dining-halls/) |
| About 1,000 staff layoffs mean offices are stretched; anything that cuts their workload is attractive | [Daily Trojan](https://dailytrojan.com/2026/05/01/layoffs-delay-dornsife-viterbi-student-registration/) |

**The gap isn't a missing office.** It's the missing link between the students who see a problem and the people who can fix it.

---

## The solution: one loop

**Report → AI description → duplicate confirmation → team assignment → after-photo resolution → notification**

| Step | What happens |
|---|---|
| **1. Report** | A student takes a photo. Faces are blurred **on the phone** before upload. GPS suggests the nearest building; the student confirms building and floor. |
| **2. AI description** | AI suggests a title, category, description and priority. The student can edit everything. If the AI fails, the student picks the category by hand. **AI never blocks a report.** |
| **3. Duplicate confirmation** | If an open issue looks like the same problem, the student sees it and taps **"Yes, same issue"** or **"No, it's new."** Same issue → the reporter count goes up. |
| **4. Team assignment** | The issue is routed to the team that owns that category and appears on the office dashboard. |
| **5. After-photo resolution** | The office uploads an "after" photo. AI compares before and after; the office confirms. AI is advisory, people decide. |
| **6. Notification** | Everyone who reported it gets **"Fixed"** live in the app. |

**Why ChatGPT or Gemini can't replace it:** Ripple's data doesn't exist anywhere until a student creates it. No chatbot can know that an elevator is broken right now, how many students saw it, or whether it was actually fixed.

---

## How it helps students

1. **Your report reaches the right office.** No need to know which of five portals to use.
2. **Your complaint counts.** One email gets ignored; one issue with 20 confirmations does not.
3. **Accessibility.** Elevator and ramp issues are high priority by default.
4. **You see that it mattered.** Every reporter is notified when it's fixed, with the after photo.
5. **Know before you go.** The live map shows what's broken right now.

---

## Categories and routing

Three categories for the hackathon. **Office names are placeholders and must be verified before the demo** (USG judges will notice invented offices).

| Category | Covers | Routed to (placeholder, verify) |
|---|---|---|
| `elevator_access` | Elevators, ramps, automatic doors, blocked accessible paths | Facilities: Elevators & Accessibility |
| `broken_equipment` | Lights, doors, furniture, water fountains, restrooms, leaks | Facilities: Maintenance |
| `tech` | Printers, Wi-Fi, screens/projectors, charging stations | ITS |

**How routing scales after the hackathon:** routing is a table (category → team), so offices and USG can change it without code. In production it would also use the building type (residence hall → Housing, dining → Hospitality, academic → Facilities) and send work orders by email to offices that don't use a dashboard.

**Issue status:** `open` (red) → `assigned` (amber) → `resolved` (green).

---

## Privacy, safety and trust

| Concern | How Ripple handles it |
|---|---|
| People in photos | Faces are blurred on the phone before upload. The AI is told never to describe or identify people. |
| Spam or fake reports | One confirmation per device per issue; AI rejects non-issues; reporter counts act as trust signals. USC email verification in production. |
| AI mistakes | AI only suggests. The student confirms the report and duplicates; the office confirms the fix. |
| Emergencies and crime | Out of scope. Ripple is for facilities problems; emergencies go to DPS. |
| Honesty in the demo | Anything mocked is labeled (e.g. "Demo office dashboard"). |

---

## Adoption

- **USG runs Ripple.** Reports go to the **existing** USC offices, and USC doesn't have to change any system.
- **Phase 1 pilot:** Leavey Library + two residence halls.
- **Cost:** hosting plus a few cents of AI per report.
- **Cold start isn't a problem:** every single report is useful on its own because it reaches the office.

---

## Roadmap (not built this weekend)

| Feature | What it adds |
|---|---|
| **USG dashboard** | Time-to-fix per office and building, overdue issues, chronic problems, building health score |
| **Points and badges** | Points for verified reports and confirmed fixes; leaderboards by residence hall and student org |
| **3D campus map** | 3D buildings with floor-by-floor view of issues |
| **Ask** | Ask a place a question ("How long is the line?"); students there answer with a photo |
| **Help** | Small favors between nearby students |
| **Lost & found** | Photo matching between found items and lost reports |
| **Lantern** | Gate-aware night routing and walk-together groups |
| **Trojan Pass** | Verified USC identity and karma |
| **Office integrations** | Push issues into offices' existing ticketing systems |

*USG dashboard stats, a "+points" line in the Fixed notification, or a simple 3D building view are possible stretch goals **only if the core loop is done by 10 PM**. That's a team decision; see `CLAUDE.md` §3.*

---

## FAQ

**Why not the existing facilities request system?**
Students don't know which of 5+ offices owns a problem. Ripple routes it for them, merges duplicates, and closes the loop with the reporter.

**Why can't students just use ChatGPT or Gemini?**
A chatbot can't know what's broken right now, how many students saw it, or whether it was fixed. That data only exists because students create it in Ripple.

**What about fake reports?**
One confirmation per device, AI rejects non-issues, and reporter counts show trust. Production adds USC email verification.

**What about privacy?**
Faces are blurred on the phone before upload, and the AI never describes people.

**What if the AI is wrong?**
It only suggests. Students and the office confirm every decision, and the report still goes through if the AI fails.

**Does it need lots of users to work?**
No. One report already reaches the right office. More users add confirmations and a better live map.

---

## Tech at a glance

**Built on Replit:** Replit Deployments (hosting), Replit Database (PostgreSQL), Replit App Storage (photos), Replit Secrets (keys), Replit Agent (scaffolding).

Also: Next.js (TypeScript, Tailwind) · Gemini Flash for vision · MediaPipe face detection in the browser · MapLibre GL + OpenFreeMap. Full details in [`CLAUDE.md`](CLAUDE.md).

---

## Sources

- [Parkside elevator outage](https://dailytrojan.com/?p=207328) (Daily Trojan)
- [University Religious Center accessibility](https://dailytrojan.com/2026/03/11/stairway-to-faith-and-community-roadblock-for-students/) (Daily Trojan, Mar 2026)
- [Leavey crowding at finals](https://dailytrojan.com/2024/04/09/extend-operating-hours-during-finals/) (Daily Trojan)
- [Dining hall complaints](https://www.uscannenbergmedia.com/2026/04/20/usc-students-report-dirty-plates-bugs-and-bad-cake-in-dining-halls/) (Annenberg Media, Apr 2026)
- [Layoffs and advising delays](https://dailytrojan.com/2026/05/01/layoffs-delay-dornsife-viterbi-student-registration/) (Daily Trojan, May 2026)
