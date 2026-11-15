// P3. Office → department + demo email. Demo only: every address is @ripple-demo.test and real delivery
// always goes to DEMO_OFFICE_INBOX (lib/email.ts). Never send to real USC addresses.
import { OFFICE } from "./routing";

export type Department = { name: string; email: string };
export const DEMO_DOMAIN = "ripple-demo.test";
export const DPS_OFFICE = "USC DPS — Public Safety";

const dept = (slug: string, name: string): Department => ({ name, email: `${slug}@${DEMO_DOMAIN}` });
const FACILITIES = dept("facilities", "Facilities");

const BY_OFFICE: Record<string, Department> = {
  [OFFICE.elevators]: dept("accessibility", "Accessibility"),
  [OFFICE.maintenance]: FACILITIES,
  [OFFICE.custodial]: FACILITIES,
  [OFFICE.grounds]: FACILITIES,
  [OFFICE.waste]: FACILITIES,
  [OFFICE.housing]: dept("housing", "Housing"),
  [OFFICE.dining]: dept("hospitality", "Hospitality"),
  [OFFICE.its]: dept("its", "ITS"),
  [OFFICE.libraries]: dept("libraries", "Libraries"),
  [OFFICE.transport]: dept("transportation", "Transportation"),
  [OFFICE.athletics]: dept("athletics", "Athletics"),
  [OFFICE.triage]: dept("usg", "USG triage"),
  [DPS_OFFICE]: dept("dps", "DPS"),
};

/** Offices a supervisor can route to. */
export const OFFICE_CHOICES: string[] = [...Object.values(OFFICE), DPS_OFFICE];

/** Department for any office name, including older names stored before routing.ts existed. */
export function departmentFor(office?: string | null): Department {
  const o = (office ?? "").trim();
  if (BY_OFFICE[o]) return BY_OFFICE[o];
  const l = o.toLowerCase();
  if (/elevator|accessib/.test(l)) return BY_OFFICE[OFFICE.elevators];
  if (/\bits\b|tech/.test(l)) return BY_OFFICE[OFFICE.its];
  if (/housing|residen/.test(l)) return BY_OFFICE[OFFICE.housing];
  if (/transport|parking/.test(l)) return BY_OFFICE[OFFICE.transport];
  if (/dps|public safety/.test(l)) return BY_OFFICE[DPS_OFFICE];
  if (/hospitality|dining/.test(l)) return BY_OFFICE[OFFICE.dining];
  if (/librar/.test(l)) return BY_OFFICE[OFFICE.libraries];
  if (/athletic/.test(l)) return BY_OFFICE[OFFICE.athletics];
  if (/fpm|facilit|maint|custod|ground|waste/.test(l)) return FACILITIES;
  return BY_OFFICE[OFFICE.triage];
}
