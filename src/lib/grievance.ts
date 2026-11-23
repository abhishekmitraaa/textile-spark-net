// The Grievance Officer (Help & Support P6c; documentation/help-feature-plan.md D-15).
//
// Named by Mitra on 2026-11-24 (documentation/company-disclosure-plan-2026-11-24.md), with the reply times in Mitra's
// words: complaints are acknowledged within 48 hours and resolved within the timelines the law requires. /grievance is
// public, linked from Help & Support, Contact, the Privacy Policy and the Terms, and in the sitemap. Setting this back to
// null hides the page again (it renders the not-found page and nothing links to it).

import { COMPANY } from "@/lib/company";

export interface GrievanceOfficer {
  name: string;
  designation: string;
  email: string;
  /** E.164, for tel: links. */
  phone: string;
  /** As written on the page. */
  phoneLabel: string;
  /** Optional: a postal address for written grievances. */
  address?: string;
  /** As counsel words them, for example "24 hours". */
  acknowledgeWithin: string;
  /** As counsel words them, for example "15 days". */
  resolveWithin: string;
}

export const GRIEVANCE_OFFICER: GrievanceOfficer | null = {
  name: "Ishani Banerjee",
  designation: "Grievance Officer",
  email: "ishani.bnj@gmail.com",
  phone: "+918815578226",
  phoneLabel: "+91 8815578226",
  address: `${COMPANY.legalName}, ${COMPANY.registeredAddress}`,
  acknowledgeWithin: "48 hours",
  resolveWithin: "the timelines required by law",
};
