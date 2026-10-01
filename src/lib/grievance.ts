// The Grievance Officer (Help & Support P6c; documentation/help-feature-plan.md D-15).
//
// Hidden until named: while GRIEVANCE_OFFICER is null, /grievance renders the not-found
// page and nothing links to it. To publish it (ToDo.md, "Name Cosora's Grievance Officer
// and publish the grievance page"):
//   1. fill in the officer below, with the reply times counsel confirms (the IT Rules 2021
//      and the Consumer Protection (E-Commerce) Rules 2020 set different ones; whether
//      either applies to a B2B marketplace is counsel's call);
//   2. link the page from Help & Support and the Terms;
//   3. add /grievance to public/sitemap.xml.
// Nothing here promises a reply time until those values are set.

export interface GrievanceOfficer {
  name: string;
  designation: string;
  email: string;
  /** Optional: a postal address for written grievances. */
  address?: string;
  /** As counsel words them, for example "24 hours". */
  acknowledgeWithin: string;
  /** As counsel words them, for example "15 days". */
  resolveWithin: string;
}

export const GRIEVANCE_OFFICER: GrievanceOfficer | null = null;
