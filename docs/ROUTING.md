# Ripple routing plan: who fixes it

A report's office comes from three things, never from the AI alone:

1. **Problem type**: what's wrong. The AI picks it from the `routing` table, or the student picks it. New types can be proposed.
2. **Place type**: what kind of place it's in, taken from the building data in `lib/usc-buildings.ts` (OpenStreetMap):
   `academic · residence · dining · library · athletic · parking · outdoor · health`.
3. **Inside or outside**: "At X" means inside. "Near X" or the **Outside** chip means outdoors next to the building.

Code: `lib/routing.ts` → `routeFor(category, locationId, floor)`. The first matching rule wins.

| # | Rule | Office |
|---|---|---|
| 1 | Tech (printers, Wi-Fi, screens) | ITS Service Desk (inside a library: USC Libraries) |
| 2 | Elevator / accessibility, anywhere | FPM Elevators & Accessibility |
| 3 | Anything **inside a residence hall** | USC Housing Maintenance |
| 4 | Anything **inside a dining location** | USC Hospitality Dining Facilities |
| 5 | Cleanliness **outside** (trash cans, dumpsters, litter) | FPM Waste & Recycling |
| 5b | Cleanliness **inside** (spills, restrooms, bins) | FPM Custodial Services |
| 6 | Inside a **parking structure** | Transportation Parking Operations |
| 7 | **Athletic** fields, gyms, stadium areas | Athletics Facilities |
| 8 | Grounds, or anything else **outdoors** (bike racks, paths, benches, irrigation) | FPM Grounds & Landscape |
| 9 | Inside a **library** | USC Libraries Building Services |
| 10 | Broken equipment, leaks, safety hazards (indoors) | FPM Building Maintenance |
| 11 | Unclear / other | Ripple triage (USG) |

**Never routed:** emergencies (fire, injury, crime) show **Call DPS**, and the AI flags them. Reports about people are rejected.

## Why your test reports went to Custodial
5 of 9 reports were trash, dumpsters or newspapers. The AI correctly called them *cleanliness*, and the old rule sent
every cleanliness report to Custodial. With the new rules, the outdoor ones go to **Waste & Recycling**.

## For the hackathon demo
- All office names are **placeholders**. Verify the real USC FPM, Housing, Hospitality and ITS contacts before judging.
- In the admin console, staff can re-route any issue: changing the type re-runs these rules, and the office can be overridden by hand.
- With the backend (docs/ADMIN_BACKEND_REQUIREMENTS.md), `/api/reports` should store `routeFor(...)` in
  `issues.assigned_team` at creation, and `routing.team_email` gets the work order.
