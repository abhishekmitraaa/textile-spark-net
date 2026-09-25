import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useDisplayCurrency } from "@/contexts/DisplayCurrencyContext";
import { formatRateDate } from "@/lib/currency";

/**
 * Says, wherever converted prices show, that they are a display conversion only
 * (MPF-11): prices are set and paid in INR, and a converted figure is not a price
 * in another currency. Renders nothing unless a conversion is running.
 */
export function ConvertedPriceNote({ className }: { className?: string }) {
  const { active, code, fx } = useDisplayCurrency();
  if (!active || !fx) return null;
  return (
    <p className={cn("text-[11px] leading-snug text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5", className)}>
      Prices marked ≈ are converted from ₹ INR to {code} at the {formatRateDate(fx.ratesDate)} rate, for display only.
      Vendors quote and are paid in ₹ INR.{" "}
      <Link to="/profile/regional-settings" className="underline underline-offset-2">Change currency</Link>
    </p>
  );
}
