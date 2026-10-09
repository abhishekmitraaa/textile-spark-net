import { useMemo } from "react";
import { COUNTRIES, countryByCode, countryCodeFor, type Country } from "@/data/countries";
import { useLang } from "@/lib/i18n";

// The buyer's country (subscriptions P7). Like StateSelect, it stores the country's English
// name in the form's free-text `country` field; the save also writes its code
// (buyer_profiles.country_code), which decides whether the buyer's requirements are
// overseas ones. India comes first; the rest follow in the reader's language.
//
// Names come from src/data/countries.ts in the reader's language, so the options are marked
// data-no-translate. A saved value that isn't a known country (older free text) shows as
// "Select country" until the buyer picks one, and isn't changed until they do.

export default function CountrySelect({
  id,
  value,
  onChange,
  className,
  placeholder = "Select country",
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const lang = useLang();
  const label = (c: Country) => (lang === "hi" ? c.hi : lang === "gu" ? c.gu : c.name);
  const others = useMemo(() => {
    const l = (c: Country) => (lang === "hi" ? c.hi : lang === "gu" ? c.gu : c.name);
    return COUNTRIES.filter((c) => c.code !== "IN").slice().sort((a, b) => l(a).localeCompare(l(b), lang));
  }, [lang]);
  const india = countryByCode("IN") as Country;
  const current = countryCodeFor(value) ?? "";
  return (
    <select id={id} className={className} value={current} onChange={(e) => onChange(countryByCode(e.target.value)?.name ?? "")}>
      <option value="">{placeholder}</option>
      <option value={india.code} data-no-translate>{label(india)}</option>
      <option disabled value="—">──────────</option>
      {others.map((c) => (
        <option key={c.code} value={c.code} data-no-translate>
          {label(c)}
        </option>
      ))}
    </select>
  );
}
