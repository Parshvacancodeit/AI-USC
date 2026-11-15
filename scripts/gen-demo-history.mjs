// P3: generates supabase/demo_history.sql (30 demo issues, is_demo = true) using the app's own routeFor().
// Run: node --no-warnings --import ./scripts/ts-resolve.mjs scripts/gen-demo-history.mjs > supabase/demo_history.sql
// Timestamps are relative to now() when the SQL runs. Dates and counts are invented; 4 issues are based on
// real reported problems (sources in the SQL comments).
import { routeFor } from "../lib/routing.ts";
import { USC_BUILDINGS } from "../lib/usc-buildings.ts";

const B = Object.fromEntries(USC_BUILDINGS.map((b) => [b.id, b]));
const PA = "osm-w406923921"; // Parkside Apartments (residence)
const PARDEE = "osm-w430431423", MARKS = "osm-w442277352", WEBB = "osm-w442277382"; // residences
const WPH = "osm-w406923958"; // Waite Phillips Hall (academic) — leak pattern
const TAPER = "osm-w406923941", SAL = "osm-w406923928", RTH = "osm-w406923927", KAP = "osm-w406923906";
const LEAVEY = "leavey", DOHENY = "osm-doheny";

// [location, floor, category, priority, title, description, daysAgo, reporters, outcome, source?]
// outcome: { fix: hours to resolve, ack: hours to first response }  |  "open"  |  { assignedDaysAgo }
const R = (fix, ack) => ({ fix, ack });
const ISSUES = [
  // Deliberate pattern 1: 6 elevator problems at Parkside Apartments over 45 days (4 resolved, 2 open)
  [PA, "1", "elevator_access", "high", "One of two elevators out of service", "Only one elevator running; long waits in the lobby. Students with mobility needs depend on the working one.", 44, 6, R(30, 2), "Daily Trojan, Apr 10 2024: https://dailytrojan.com/2024/04/10/elevator-repairs-inconvenience-parkside-residents/"],
  [PA, "1", "elevator_access", "urgent", "Both elevators down, stairs only", "Neither elevator is working. Residents on upper floors have to use the stairs; no step-free way up.", 36, 8, R(20, 1), "Daily Trojan, Apr 10 2024 (\"When both of the elevators are out, it is definitely problematic\"): https://dailytrojan.com/2024/04/10/elevator-repairs-inconvenience-parkside-residents/"],
  [PA, "3", "elevator_access", "high", "Elevator stuck between floors 2 and 3", "Doors won't open at floor 3; the car stops between floors.", 27, 4, R(18, 3)],
  [PA, "1", "elevator_access", "medium", "Elevator call button not lighting up", "Lobby call button doesn't respond; have to press repeatedly.", 18, 3, R(26, 4)],
  [PA, "1", "elevator_access", "urgent", "Elevator out again, out-of-order sign on doors", "Same elevator out of service again. Out-of-order sign taped to the doors.", 5, 5, { assignedDaysAgo: 1 }],
  [PA, "2", "elevator_access", "high", "Elevator doors closing too fast", "Doors close before anyone with crutches or a wheelchair can get in.", 1, 2, "open"],

  // Deliberate pattern 2: 5 leaks at Waite Phillips Hall (Building Maintenance is the slow office)
  [WPH, "2", "water_leak", "medium", "Ceiling leak above 2nd floor hallway", "Water dripping from a ceiling tile into a trash can.", 40, 3, R(96, 30)],
  [WPH, "1", "water_leak", "high", "Water pooling under restroom sink", "Puddle spreading from under the sink; slippery floor.", 31, 2, R(80, 26)],
  [WPH, "2", "water_leak", "medium", "Stained ceiling tile dripping again", "Same area as before, tile is brown and dripping.", 22, 4, R(110, 40)],
  [WPH, "3", "water_leak", "high", "Leak near classroom projector", "Water dripping near the ceiling projector in the classroom.", 12, 3, R(72, 28)],
  [WPH, "2", "water_leak", "high", "Ceiling leak above hallway, buckets out", "Leak is back; two buckets on the floor.", 3, 5, { assignedDaysAgo: 2 }],

  // Heat wave: rooms without AC (based on real reporting)
  [PARDEE, "4", "other", "medium", "Room unbearably hot during heat wave, no AC", "Room is over 90°F at night; fans aren't enough. No AC in rooms.", 39, 4, R(48, 6), "Daily Trojan, Aug 27 2026 (Pardee Tower and Marks Tower lack in-room AC): https://dailytrojan.com/2026/08/27/university-tells-students-to-use-common-sense-during-heat-wave/"],
  [MARKS, "3", "other", "medium", "No AC, hallway and rooms overheating", "Very hot inside during the heat wave; students sleeping in the lounge.", 38, 6, R(52, 8), "Daily Trojan, Oct 26 2026 (dorms without AC amid LA heat): https://dailytrojan.com/2026/10/26/dorms-without-ac-are-unlivable-amid-la-heat/"],

  // Libraries
  [LEAVEY, "1", "tech", "medium", "Printer jammed on 1st floor", "Main printer shows paper jam; queue backed up.", 34, 3, R(4, 1)],
  [LEAVEY, "2", "tech", "low", "Charging station not working", "USB ports on the 2nd floor charging tower are dead.", 20, 2, R(10, 2)],
  [LEAVEY, "2", "tech", "medium", "Wi-Fi drops in the 2nd floor group rooms", "USC Wi-Fi keeps disconnecting in the group study rooms.", 4, 4, { assignedDaysAgo: 3.5 }],
  [DOHENY, "1", "broken_equipment", "low", "Broken chair in reading room", "Chair leg cracked; wobbles when you sit.", 29, 1, R(30, 5)],
  [DOHENY, "2", "broken_equipment", "medium", "Desk lamp row not working", "Row of desk lamps out in the 2nd floor reading room.", 9, 2, R(20, 4)],

  // Academic buildings
  [SAL, "1", "tech", "high", "Classroom projector won't turn on", "Projector in the lecture room shows no signal; class had to switch rooms.", 26, 5, R(6, 1)],
  [SAL, "2", "tech", "medium", "Wi-Fi dead zone in lab", "No Wi-Fi signal in the back half of the lab.", 15, 3, R(12, 2)],
  [TAPER, "1", "broken_equipment", "medium", "Hallway lights out near stairwell", "Two ceiling lights out; stairwell is dim.", 33, 2, R(70, 22)],
  [TAPER, "2", "broken_equipment", "low", "Classroom door hinge squeaks and sticks", "Door is hard to open and slams shut.", 21, 1, R(60, 24)],
  [TAPER, "Outside", "grounds", "medium", "Uneven pavement by the entrance ramp", "Raised slab edge on the path to the ramp; easy to trip.", 8, 3, "open"],
  [RTH, "1", "cleanliness", "medium", "Restroom out of soap and paper towels", "Both dispensers empty in the 1st floor restroom.", 24, 2, R(5, 1)],
  [RTH, "3", "cleanliness", "low", "Spill in the 3rd floor hallway", "Sticky spill near the vending machines.", 11, 1, R(3, 1)],
  [KAP, "1", "safety_hazard", "high", "Wet floor near outlet, no sign", "Water on the floor next to a wall outlet by the lobby.", 16, 2, R(8, 2)],
  [KAP, "Outside", "grounds", "low", "Bike rack loose from pavement", "One bike rack wobbles; bolts loose.", 7, 1, R(40, 10)],

  // Residence halls (other)
  [WEBB, "5", "broken_equipment", "medium", "Shower drain clogged", "Water backs up in the 5th floor shower.", 30, 2, R(28, 6)],
  [PA, "1", "cleanliness", "low", "Trash room overflowing", "Trash chute room full, bags on the floor.", 13, 2, R(12, 3)],
  [PARDEE, "2", "broken_equipment", "low", "Lounge window won't close", "Window latch broken in the 2nd floor lounge.", 2, 1, { assignedDaysAgo: 1.5 }],
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ago = (hours) => `now() - interval '${Math.round(hours * 60)} minutes'`;
const used = new Set(ISSUES.map((i) => i[0]));
let out = `-- P3: demo history for the Dispatch Copilot (generated by scripts/gen-demo-history.mjs). Idempotent.
-- Every row is is_demo = true. Dates and counts are invented. 4 issues are based on real reported problems
-- (source in the comment above each); all others are realistic examples, not real reports.
-- Requires supabase/copilot.sql (is_demo column) to have run first.

delete from issue_events where issue_id in (select id from issues where is_demo);
delete from issues where is_demo;

-- Buildings used (from lib/usc-buildings.ts, OpenStreetMap); no-op if they already exist
insert into locations (id, name, lat, lng, floors) values
${[...used].map((id) => `  (${q(id)}, ${q(B[id].name)}, ${B[id].lat}, ${B[id].lng}, '{}')`).join(",\n")}
on conflict (id) do nothing;

-- Leak category used by the pattern (routes to Building Maintenance)
insert into routing (category, team_name, team_email) values ('water_leak', 'FPM — Building Maintenance', 'facilities@ripple-demo.test')
on conflict (category) do nothing;

`;
for (const [loc, floor, cat, prio, title, desc, days, reps, outcome, source] of ISSUES) {
  const office = routeFor(cat, loc, floor).office;
  const created = days * 24;
  let status = "open", assigned = "null", first = "null", resolved = "null";
  if (outcome === "open") status = "open";
  else if (outcome.assignedDaysAgo !== undefined) {
    status = "assigned";
    assigned = ago(outcome.assignedDaysAgo * 24);
  } else {
    status = "resolved";
    assigned = ago(created - 2);
    first = ago(created - 2 - outcome.ack);
    resolved = ago(Math.max(0.5, created - 2 - outcome.fix));
  }
  if (source) out += `-- Based on: ${source}\n`;
  out += `insert into issues (location_id, floor, category, title, description, priority, status, assigned_team, reporter_count, before_photo_path, is_demo, created_at, updated_at, assigned_at, first_response_at, resolved_at) values (${q(loc)}, ${floor ? q(floor) : "null"}, ${q(cat)}, ${q(title)}, ${q(desc)}, ${q(prio)}, ${q(status)}, ${q(office)}, ${reps}, null, true, ${ago(created)}, ${status === "resolved" ? resolved : ago(created)}, ${assigned}, ${first}, ${resolved});\n`;
}
console.log(out);
