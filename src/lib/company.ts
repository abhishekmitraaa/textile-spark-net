/**
 * The company behind Cosora: one copy of its facts for the whole app (Mitra, 2026-11-24;
 * documentation/company-disclosure-plan-2026-11-24.md).
 *
 * Meta checks that the brand "Cosora" belongs to this company, so its name, address and phone must read the same on
 * every page. Every page reads them from here: never retype one. The Journal (cosora-blogs, src/lib/site.ts) keeps
 * the same values, and public.support_settings holds the same email and phone; change all three together.
 *
 * These are a legal record, shown in English in every language (data-no-translate), as the Supplier Agreement is;
 * scripts/i18n-coverage-check.mjs skips this file. The footer's link labels are translated: lib/legalLinks.ts.
 */
export const COMPANY = {
  legalName: "Fearce Textiles Private Limited",
  brand: "Cosora",
  registeredAddress: "Innov8 Orchid Center 3rd floor, Orchid Center, Golf Course Road, SEC-53,Gurugram, HR, IND, 122022",
  cin: "U47912HR2024PTC118434",
  gstin: "06AAFCF7943P1ZZ",
  email: "teamcosora@gmail.com",
  /** E.164, for tel: and wa.me links. */
  phone: "+917904840367",
  /** As written on every page. */
  phoneLabel: "+91 7904840367",
  website: "https://cosora.in",
} as const;

/** The line every footer carries. */
export const COMPANY_COPYRIGHT = `© 2026 ${COMPANY.legalName}. ${COMPANY.brand} is a brand of ${COMPANY.legalName}.`;

/** wa.me wants digits only. */
export const COMPANY_WHATSAPP_URL = `https://wa.me/${COMPANY.phone.replace(/\D/g, "")}`;

/** The small-print line under every footer. */
export const COMPANY_REGISTRATION_LINE = `Registered office: ${COMPANY.registeredAddress} · CIN: ${COMPANY.cin}`;

/** The Contact page's first line. */
export const COMPANY_OWNERSHIP_LINE = `${COMPANY.brand} is a brand of ${COMPANY.legalName}, which owns and operates the Cosora website and app.`;
