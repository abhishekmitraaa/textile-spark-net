import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Marketing consent: offers and promotions by WhatsApp and email (Mitra, 2026-11-24;
// migration 20261124100000_company_disclosure_marketing_consent.sql).
//
// Not contact_consent (lib/queries/contactChannels.ts), which is consent to SERVICE messages
// such as lead alerts. set_marketing_consent() records a yes or a no with where it was given;
// the database takes the address from the account and records the words the server knows
// (admin.marketing_consent_wording), never words sent from here. Every change is kept in
// admin.marketing_consent_log: that is the proof of consent.
//
// The labels below are the English the database records. Change them together with
// admin.marketing_consent_wording() in a migration.
// ─────────────────────────────────────────────────────────────

export type MarketingChannel = "whatsapp" | "email";
export type MarketingSource = "signup" | "checkout" | "settings";

export const MARKETING_LABELS: Record<MarketingChannel, string> = {
  whatsapp: "Send me offers and updates from Cosora on WhatsApp at this number.",
  email: "Send me offers and updates from Cosora by email.",
};

export interface MarketingConsent {
  whatsapp: boolean;
  email: boolean;
}

export type MarketingChoice = MarketingConsent;
export const NO_CHOICE: MarketingChoice = { whatsapp: false, email: false };

export async function setMarketingConsent(channel: MarketingChannel, optedIn: boolean, source: MarketingSource): Promise<void> {
  const { error } = await supabase.rpc("set_marketing_consent", { p_channel: channel, p_opted_in: optedIn, p_source: source });
  if (error) throw error;
}

/**
 * Records the boxes that were ticked, from sign-up or checkout. An unticked box records nothing: leaving it empty
 * never withdraws a yes given before (withdrawing is in settings). Resolves when every yes is saved.
 */
export async function saveMarketingOptIns(choice: MarketingChoice, source: Exclude<MarketingSource, "settings">): Promise<void> {
  const ticked = (Object.keys(choice) as MarketingChannel[]).filter((c) => choice[c]);
  await Promise.all(ticked.map((c) => setMarketingConsent(c, true, source)));
}

/** The signed-in account's own answers. Null before the migration is applied (the function doesn't exist yet). */
export function useMarketingConsent(enabled = true) {
  return useQuery({
    queryKey: ["marketing_consent"],
    enabled,
    queryFn: async (): Promise<MarketingConsent | null> => {
      const { data, error } = await supabase.rpc("my_marketing_consent");
      if (error?.code === "PGRST202") return null;
      if (error) throw error;
      const r = data as unknown as Partial<MarketingConsent> | null;
      return { whatsapp: Boolean(r?.whatsapp), email: Boolean(r?.email) };
    },
  });
}

export function useRefreshMarketingConsent() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["marketing_consent"] });
}

/**
 * The checkout boxes (plan checkout and the ad Pay buttons): hides a channel already said yes to, and `commit()`
 * records the ticks with "checkout" when Pay is pressed. It doesn't wait for the save, so paying is never held up by
 * it; a refused save is said, and the payment goes on.
 */
export function useCheckoutOptIn(enabled = true) {
  const consent = useMarketingConsent(enabled);
  const refresh = useRefreshMarketingConsent();
  const [offers, setOffers] = useState<MarketingChoice>(NO_CHOICE);
  const hide = { whatsapp: Boolean(consent.data?.whatsapp), email: Boolean(consent.data?.email) };
  const commit = () => {
    const choice = { whatsapp: offers.whatsapp && !hide.whatsapp, email: offers.email && !hide.email };
    if (!choice.whatsapp && !choice.email) return;
    saveMarketingOptIns(choice, "checkout")
      .then(() => { setOffers(NO_CHOICE); void refresh(); })
      .catch(() => toast.error("Couldn't save your choice about offers", { description: "You can switch offers on in Settings." }));
  };
  return { offers, setOffers, hide, commit };
}
