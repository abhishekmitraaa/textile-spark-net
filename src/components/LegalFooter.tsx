import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { COMPANY_COPYRIGHT, COMPANY_REGISTRATION_LINE } from "@/lib/company";
import { LEGAL_LINKS } from "@/lib/legalLinks";

/**
 * Who runs Cosora, on every public page (Mitra, 2026-11-24): the copyright line naming Fearce Textiles Private
 * Limited, the legal pages, and the registered office and CIN in small text. Meta reads it to check that the brand
 * belongs to the company, so every value comes from lib/company.ts.
 *
 * The company's name, address and CIN are a legal record and stay English (data-no-translate); the link labels are
 * translated. About is the Journal's page, outside this router, so it's a plain link.
 */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-gray-200 pt-5 pb-2 text-xs text-gray-500", className)}>
      <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
        {LEGAL_LINKS.map((l) =>
          "external" in l ? (
            <a key={l.href} href={l.href} className="font-medium text-gray-700 hover:text-gray-900 hover:underline">{l.label}</a>
          ) : (
            <Link key={l.href} to={l.href} className="font-medium text-gray-700 hover:text-gray-900 hover:underline">{l.label}</Link>
          ),
        )}
      </nav>
      <p className="mt-4 leading-relaxed text-gray-600" data-no-translate>{COMPANY_COPYRIGHT}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-400" data-no-translate>
        {COMPANY_REGISTRATION_LINE}
      </p>
    </footer>
  );
}
