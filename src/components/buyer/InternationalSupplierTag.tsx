import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { countryByCode } from "@/data/countries";
import { useLang } from "@/lib/i18n";
import { isInternationalSupplier } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// "International supplier" (Mitra, 2026-11-13, D10): shown for a registered seller outside India, on product
// cards and on the store. The code comes from registeredCountry() / feed_products' vendor_country_code, so a
// seller still waiting for Cosora's approval shows no label, matching the Supplier location filter.
// ─────────────────────────────────────────────────────────────

interface Props {
  countryCode: string | null | undefined;
  /** Add the country's name ("International supplier · United Arab Emirates"): the store header. */
  withCountry?: boolean;
  className?: string;
}

export default function InternationalSupplierTag({ countryCode, withCountry, className }: Props) {
  const lang = useLang();
  if (!isInternationalSupplier(countryCode)) return null;
  const c = withCountry ? countryByCode(countryCode) : undefined;
  // The country's own name in the reader's language (the generated list carries all three).
  const country = c ? (lang === "hi" ? c.hi : lang === "gu" ? c.gu : c.name) : undefined;
  return (
    <span
      data-testid="international-supplier"
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full bg-brand-vendor/10 px-1.5 py-0.5 font-semibold text-brand-vendor",
        className,
      )}
    >
      <Globe className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">International supplier</span>
      {country && <span className="truncate" data-no-translate> · {country}</span>}
    </span>
  );
}
