/**
 * The legal pages, in footer order (Mitra, 2026-11-24). Labels are translated; the company facts beside them are not
 * (lib/company.ts). About is the Journal's page, outside this router (/about redirects there; vercel.json).
 */
export const LEGAL_LINKS = [
  { label: "About", href: "/blogs/about", external: true },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
] as const;
