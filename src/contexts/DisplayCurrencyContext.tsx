import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/lib/queries/profile";
import { useProfileState } from "@/lib/profileStore";
import { useFxRates } from "@/lib/queries/fx";
import {
  convertInrText, currencyCodeOf, formatInCurrency, isInrSymbol,
  type CurrencyCode, type FxRates,
} from "@/lib/currency";

// The buyer's display currency, worked out once for the whole app (MPF-11).
// Signed in: buyer_profiles.regional.currency. Signed out: the Regional Settings
// choice kept on the device. Every buyer-facing price goes through show() or
// showText(), which hand back the caller's own INR text untouched unless a
// conversion is actually running. See src/lib/currency.ts for the rules.

interface DisplayCurrency {
  /** What the buyer chose. */
  code: CurrencyCode;
  /** True only while converting: a non-INR choice with rates loaded. */
  active: boolean;
  fx: FxRates | null;
  /**
   * The price to show for `amountInInr`: `inrText` itself, exactly, unless
   * converting, then "≈ $5.41". A price in another currency (`sourceCurrency`
   * not ₹) is never converted.
   */
  show: (amountInInr: number | null | undefined, inrText: string, sourceCurrency?: string | null) => string;
  /** The same for INR text the app built ("₹450", "₹5,000 - ₹50,000"). */
  showText: (inrText: string) => string;
  /**
   * Like show(), with the INR price kept beside the conversion: "≈ $5.41 (₹450)".
   * For the figures a buyer acts on: a quote, the product page's price.
   */
  showBoth: (amountInInr: number | null | undefined, inrText: string, sourceCurrency?: string | null) => string;
}

const passthrough: DisplayCurrency = {
  code: "INR",
  active: false,
  fx: null,
  show: (_amount, inrText) => inrText,
  showText: (inrText) => inrText,
  showBoth: (_amount, inrText) => inrText,
};

const DisplayCurrencyContext = createContext<DisplayCurrency>(passthrough);

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: settings } = useSettings(user?.id);
  const { regional } = useProfileState();
  const code = currencyCodeOf(user ? settings?.regional.currency : regional.currency);
  const { data: fx } = useFxRates(code !== "INR");
  const active = code !== "INR" && Boolean(fx?.rates[code]);

  const show = useCallback<DisplayCurrency["show"]>((amountInInr, inrText, sourceCurrency) => {
    if (!active || amountInInr == null || !isInrSymbol(sourceCurrency)) return inrText;
    const converted = formatInCurrency(Number(amountInInr), code, fx);
    return converted == null ? inrText : `≈ ${converted}`;
  }, [active, code, fx]);

  // A missing price (null) comes back as it was, rendering nothing as before.
  const showText = useCallback<DisplayCurrency["showText"]>(
    (inrText) => (active && typeof inrText === "string" ? convertInrText(inrText, code, fx) : inrText),
    [active, code, fx],
  );

  const showBoth = useCallback<DisplayCurrency["showBoth"]>((amountInInr, inrText, sourceCurrency) => {
    const shown = show(amountInInr, inrText, sourceCurrency);
    return shown === inrText ? inrText : `${shown} (${inrText})`;
  }, [show]);

  const value = useMemo(
    () => (active ? { code, active, fx: fx ?? null, show, showText, showBoth } : { ...passthrough, code, fx: fx ?? null }),
    [active, code, fx, show, showText, showBoth],
  );
  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export const useDisplayCurrency = () => useContext(DisplayCurrencyContext);
