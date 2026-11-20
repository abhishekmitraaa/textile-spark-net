import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Globe, Languages, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  useProfileState,
  updateRegional,
  CURRENCIES,
  type RegionalSettings,
} from "@/lib/profileStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, saveSetting, DEFAULT_SETTINGS } from "@/lib/queries/profile";
import { buildRfqHistoryCsv, buildAllDataJson, downloadFile, CHAT_SCOPE_NOTE } from "@/lib/queries/dataExport";
import { useLang, isLang, LANG_OPTIONS } from "@/lib/i18n";
import { chooseLang } from "@/lib/languagePreference";
import { useDisplayCurrency } from "@/contexts/DisplayCurrencyContext";
import { currencyCodeOf, formatRateDate } from "@/lib/currency";
import { useStepBack } from "@/hooks/useStepBack";

function SettingsHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  // Back and a finished save go back to where the page was opened from, else /profile (review M-48: they pushed
  // /profile, so Back from there came back here, and round again).
  const goBack = useStepBack("/profile");
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={() => goBack()} aria-label="Back" className="-ml-1 p-1">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
      </div>
    </div>
  );
}

const selectCls = "w-full appearance-none rounded-xl border border-gray-300 bg-white pl-10 pr-9 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-brand-buyer transition-colors";

// Currency converts displayed prices (Phase 20, MPF-11: src/lib/currency.ts). It
// is DISPLAY ONLY, and the page says so: prices are set, quoted, paid and invoiced
// in INR. There is no timezone picker (Mitra, 2026-11-20, review L-52, "Remove the
// field"): every time shows in India time, and nothing read the saved choice.
// `regional.timezone` stays in saved settings, unused.
const PRICE_CURRENCY = DEFAULT_SETTINGS.regional.currency;   // "₹ INR", what prices are set and paid in

const ProfileAccountPrefs = () => {
  const { user } = useAuth();
  // Two addresses, two pages (review L-47): /profile/regional-settings and /profile/data-export showed the same page.
  const exportPage = useLocation().pathname === "/profile/data-export";
  const queryClient = useQueryClient();
  // Nothing is saved over a read that hasn't arrived or failed (review M-49): the form would hold defaults.
  const settingsQuery = useSettings(user?.id);
  const settings = settingsQuery.data;
  const settingsUnknown = Boolean(user) && !settings;
  const { regional: storeRegional } = useProfileState();
  const [regional, setRegional] = useState<RegionalSettings>(storeRegional);
  const display = useDisplayCurrency();
  const lang = useLang();
  const chosenCode = currencyCodeOf(regional.currency);
  const rate = display.fx?.rates[chosenCode];

  useEffect(() => { if (user && settings) setRegional(settings.regional); }, [user, settings]);

  // Persist a single regional field (dropdowns save on change). Resolves to where it was saved, or null when it wasn't:
  // the "saved" message comes after the write, never before it (review L-45).
  const patchRegional = async (patch: Partial<RegionalSettings>): Promise<"account" | "device" | null> => {
    if (settingsUnknown) {
      toast.error("Your settings haven't loaded yet", { description: "Try again in a moment." });
      return null;
    }
    const before = regional;
    const next = { ...regional, ...patch };
    setRegional(next);
    if (user) {
      try {
        await saveSetting(user.id, "regional", next);
        queryClient.invalidateQueries({ queryKey: ["profile_settings", user.id] });
        return "account";
      } catch (e) {
        setRegional(before);
        toast.error("Couldn't save", { description: errorMessage(e) });
        return null;
      }
    }
    updateRegional(patch);
    return "device";
  };

  // Both exports are built in the browser from the buyer's own rows and
  // downloaded directly (lib/queries/dataExport.ts).
  const [exporting, setExporting] = useState<"all" | "rfqs" | null>(null);
  const onExportRfqs = async () => {
    if (!user) { toast("Sign in to export your data"); return; }
    setExporting("rfqs");
    try {
      const out = await buildRfqHistoryCsv(user.id);
      downloadFile(out.filename, out.csv, "text/csv;charset=utf-8");
      toast.success("RFQ history downloaded", {
        description: `${out.rfqs} ${out.rfqs === 1 ? "RFQ" : "RFQs"}, ${out.quotes} ${out.quotes === 1 ? "quote" : "quotes"}`,
      });
    } catch (e) {
      toast.error("Couldn't export your RFQ history", { description: errorMessage(e) });
    } finally {
      setExporting(null);
    }
  };
  const onExportAll = async () => {
    if (!user) { toast("Sign in to export your data"); return; }
    setExporting("all");
    try {
      const out = await buildAllDataJson(user.id);
      downloadFile(out.filename, out.json, "application/json");
      toast.success("Your data is downloaded", {
        description: `${out.counts.rfqs} RFQs, ${out.counts.quotes_received} quotes, ${out.counts.messages} messages, ${out.counts.reviews + out.counts.product_reviews} reviews`,
      });
    } catch (e) {
      toast.error("Couldn't export your data", { description: errorMessage(e) });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <SettingsHeader title={exportPage ? "Data & Export" : "Regional Settings"} />
      {!exportPage && settingsQuery.isError && !settings && (
        <div role="alert" className="mx-auto mt-3 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn't load your saved settings, so nothing can be changed yet.{" "}
          <button onClick={() => void settingsQuery.refetch()} className="font-semibold underline">Retry</button>
        </div>
      )}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* Regional settings - dropdowns shown directly */}
        {!exportPage && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Regional Settings</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">Customize your regional preferences</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Default Currency</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  className={selectCls}
                  value={regional.currency}
                  onChange={(e) => {
                    const c = e.target.value;
                    // The same field the buyer menu drawer's picker writes
                    // (useCurrencySetting). Saved here with the page's other
                    // regional fields, so a quick currency-then-timezone change
                    // can't have one save overwrite the other.
                    void patchRegional({ currency: c }).then((where) => {
                      if (!where) return;
                      // Signed out it is kept in this browser only, and says so (review L-50).
                      const device = where === "device";
                      const description = c === PRICE_CURRENCY ? undefined
                        : `Prices show converted to ${currencyCodeOf(c)}, for display only. Payments stay in ${PRICE_CURRENCY}.`;
                      if (c === PRICE_CURRENCY) toast.success(device ? "Currency saved on this device" : "Currency saved");
                      else toast.success(device ? `${c} saved on this device` : `${c} saved`, { description });
                    });
                  }}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {regional.currency !== PRICE_CURRENCY && (
                <p className="mt-1.5 text-[11px] text-amber-700">
                  {rate
                    ? <>Prices across Cosora show converted to {chosenCode} at the {display.fx ? formatRateDate(display.fx.ratesDate) : ""} rate (1 {chosenCode} ≈ ₹{(1 / rate).toFixed(2)}), marked ≈.</>
                    : <>Today&rsquo;s {chosenCode} rate isn&rsquo;t available yet, so prices still show in {PRICE_CURRENCY}.</>}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-gray-500">
                Display only: vendors quote and are paid in {PRICE_CURRENCY}, and Cosora&rsquo;s plans and GST invoices stay in {PRICE_CURRENCY}. Amounts you type, like an RFQ budget, are in {PRICE_CURRENCY}.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Language</label>
              <div className="relative">
                <Languages className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                {/* The language the app is in. Saved to the account when signed in
                    and applied at sign-in on any device (languagePreference.ts).
                    buyer_profiles.regional.language is no longer read. */}
                <select
                  className={selectCls}
                  value={lang}
                  data-no-translate
                  onChange={(e) => {
                    const code = e.target.value;
                    if (!isLang(code)) return;
                    chooseLang(code)
                      .then(() => toast.success("Language updated"))
                      .catch((err) => toast.error("Couldn't save your language to your account", { description: errorMessage(err) }));
                  }}
                >
                  {LANG_OPTIONS.map((l) => (
                    <option key={l.code} value={l.code}>{l.native === l.label ? l.label : `${l.native} (${l.label})`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Data & Export */}
        {exportPage && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Data &amp; Export</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">Download or manage your data</p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-3 min-w-0">
                <Download className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Export All Data</p>
                  <p className="text-xs text-gray-500">Your profile, RFQs (including those in review), quotes received, chats, reviews, saved items and videos, recently viewed, the vendors you follow or contacted, the accounts you blocked, and your support requests, as a JSON file</p>
                  <p className="text-xs text-gray-500">Sellers also get their store, listings, quotes sent, catalogues, videos and invoices.</p>
                  {/* Said up front so the seller's messages in the file are no surprise. */}
                  <p className="text-[11px] text-gray-400 mt-1">{CHAT_SCOPE_NOTE}</p>
                </div>
              </div>
              <button
                onClick={onExportAll}
                disabled={exporting !== null}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-60"
              >
                {exporting === "all" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Export
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-3 min-w-0">
                <FileSpreadsheet className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Export RFQ History</p>
                  <p className="text-xs text-gray-500">Your RFQs and every quote received, as a CSV spreadsheet</p>
                </div>
              </div>
              <button
                onClick={onExportRfqs}
                disabled={exporting !== null}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-60"
              >
                {exporting === "rfqs" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Export
              </button>
            </div>
          </div>
        </section>
        )}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default ProfileAccountPrefs;
