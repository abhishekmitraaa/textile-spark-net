import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errorMessage";
import { useT } from "@/lib/i18n";
import {
  MARKETING_LABELS, setMarketingConsent, useMarketingConsent, useRefreshMarketingConsent, type MarketingChannel,
} from "@/lib/marketingConsent";

/**
 * Offers by WhatsApp and email, switched on or off in settings (Mitra, 2026-11-24). Withdrawing must be as easy as
 * agreeing, so each switch is saved the moment it changes ("settings"), never with the page's Save. It shows what the
 * database holds: nothing while that's being read, and a retry when the read failed (never a guessed "off").
 */
export function MarketingConsentSwitches({ accent = "buyer" }: { accent?: "buyer" | "vendor" }) {
  const t = useT();
  const consent = useMarketingConsent();
  const refresh = useRefreshMarketingConsent();
  const [saving, setSaving] = useState<MarketingChannel | null>(null);

  const change = async (channel: MarketingChannel, on: boolean) => {
    setSaving(channel);
    try {
      await setMarketingConsent(channel, on, "settings");
      await refresh();
      toast.success(on ? "Offers switched on" : "Offers switched off");
    } catch (e) {
      toast.error("Couldn't save", { description: errorMessage(e) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="offers-heading" className="space-y-3">
      <div>
        <h2 id="offers-heading" className="text-sm font-semibold text-gray-900">Offers from Cosora</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Optional. Messages you need, such as sign-in codes, updates on your requests and receipts, still come either way.{" "}
          <Link to="/privacy#opting-out" className="font-medium text-blue-600 hover:underline">Privacy Policy</Link>
        </p>
      </div>
      {consent.isError ? (
        <p className="text-xs text-gray-600" role="alert">
          Couldn't load your choices.{" "}
          <button type="button" onClick={() => void consent.refetch()} className="font-medium text-blue-600 hover:underline">Try again</button>
        </p>
      ) : consent.data === null ? null : (
        (["whatsapp", "email"] as MarketingChannel[]).map((c) => (
          <div key={c} className="flex items-start justify-between gap-4">
            <label htmlFor={`offers-${c}`} className="text-sm text-gray-800">{t(MARKETING_LABELS[c])}</label>
            <Switch
              id={`offers-${c}`}
              checked={Boolean(consent.data?.[c])}
              disabled={consent.isLoading || saving !== null}
              onCheckedChange={(v) => void change(c, v)}
              className={accent === "vendor" ? "data-[state=checked]:bg-brand-vendor mt-0.5 shrink-0" : "data-[state=checked]:bg-brand-buyer mt-0.5 shrink-0"}
            />
          </div>
        ))
      )}
    </section>
  );
}
