// P1. Who fixes it: problem type + type of place + inside/outside → office.
// First matching rule wins. Office names are placeholders to verify with USC (docs/ROUTING.md).
import { USC_BUILDINGS, type PlaceKind } from "./usc-buildings";

export const OFFICE = {
  elevators: "FPM — Elevators & Accessibility",
  maintenance: "FPM — Building Maintenance",
  custodial: "FPM — Custodial Services",
  grounds: "FPM — Grounds & Landscape",
  waste: "FPM — Waste & Recycling",
  housing: "USC Housing — Maintenance",
  dining: "USC Hospitality — Dining Facilities",
  its: "ITS — Service Desk",
  libraries: "USC Libraries — Building Services",
  transport: "Transportation — Parking Operations",
  athletics: "Athletics — Facilities",
  triage: "Ripple triage (USG)",
} as const;

export type Route = { office: string; why: string };

export function placeKind(locationId: string): PlaceKind {
  return USC_BUILDINGS.find((b) => b.id === locationId)?.kind ?? "academic";
}

export function routeFor(category: string, locationId: string, floor?: string | null): Route {
  const kind = placeKind(locationId);
  const outside = floor === "Outside" || kind === "outdoor";
  const c = category;

  if (c === "tech") return kind === "library" ? { office: OFFICE.libraries, why: "Tech issue inside a library" } : { office: OFFICE.its, why: "Printers, Wi-Fi, screens and charging go to ITS" };
  if (c === "elevator_access") return { office: OFFICE.elevators, why: "Elevators, ramps and accessible doors always go to the accessibility team" };
  if (kind === "residence" && !outside) return { office: OFFICE.housing, why: "Anything inside a residence hall goes to Housing" };
  if (kind === "dining" && !outside) return { office: OFFICE.dining, why: "Inside a dining location goes to Hospitality" };
  if (c === "cleanliness") return outside ? { office: OFFICE.waste, why: "Outdoor trash, dumpsters and litter go to Waste & Recycling" } : { office: OFFICE.custodial, why: "Indoor spills, restrooms and trash go to Custodial" };
  if (kind === "parking") return { office: OFFICE.transport, why: "Parking structures are run by Transportation" };
  if (kind === "athletic") return { office: OFFICE.athletics, why: "Fields, gyms and stadium areas go to Athletics" };
  if (c === "grounds" || outside) return { office: OFFICE.grounds, why: "Outdoor paths, bike racks, benches and landscaping go to Grounds" };
  if (kind === "library") return { office: OFFICE.libraries, why: "Inside a library goes to Library building services" };
  if (c === "broken_equipment" || c === "safety_hazard" || c === "water_leak") return { office: OFFICE.maintenance, why: "Broken fixtures, leaks and hazards go to Building Maintenance" };
  return { office: OFFICE.triage, why: "Unclear: USG triages it to the right office" };
}
