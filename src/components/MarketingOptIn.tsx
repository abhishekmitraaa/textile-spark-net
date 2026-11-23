import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { MARKETING_LABELS, type MarketingChannel, type MarketingChoice } from "@/lib/marketingConsent";

/**
 * The two marketing boxes (Mitra, 2026-11-24): WhatsApp and email, separate and never ticked for you, beside a link
 * to the Privacy Policy. The parent keeps the choice and saves it with saveMarketingOptIns() when its form is
 * submitted, so the record says where it was given ("signup", "checkout").
 *
 * `hide` leaves out a channel the account has already said yes to (checkout), so an empty box never looks like a
 * withdrawal. With both hidden, nothing renders.
 */
export function MarketingOptIn({
  value,
  onChange,
  hide,
  tone = "light",
  idPrefix = "mkt",
  className,
}: {
  value: MarketingChoice;
  onChange: (next: MarketingChoice) => void;
  hide?: Partial<Record<MarketingChannel, boolean>>;
  tone?: "light" | "dark";
  idPrefix?: string;
  className?: string;
}) {
  const t = useT();
  const channels = (["whatsapp", "email"] as MarketingChannel[]).filter((c) => !hide?.[c]);
  if (channels.length === 0) return null;
  const dark = tone === "dark";

  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className={cn("mb-1 text-xs font-semibold", dark ? "text-white/90" : "text-gray-700")}>
        Offers from Cosora (optional)
      </legend>
      {channels.map((c) => (
        <div key={c} className="flex items-start gap-2.5">
          <input
            id={`${idPrefix}-${c}`}
            type="checkbox"
            checked={value[c]}
            onChange={(e) => onChange({ ...value, [c]: e.target.checked })}
            className={cn("mt-0.5 h-4 w-4 shrink-0 cursor-pointer", dark ? "accent-white" : "accent-brand-vendor")}
          />
          <label htmlFor={`${idPrefix}-${c}`} className={cn("cursor-pointer text-xs leading-relaxed", dark ? "text-white" : "text-gray-700")}>
            {t(MARKETING_LABELS[c])}
          </label>
        </div>
      ))}
      <p className={cn("text-[11px] leading-relaxed", dark ? "text-white/70" : "text-gray-500")}>
        You can stop these at any time. See our{" "}
        <Link to="/privacy#opting-out" className={cn("font-semibold underline", dark ? "text-white" : "text-blue-600")}>Privacy Policy</Link>.
      </p>
    </fieldset>
  );
}
