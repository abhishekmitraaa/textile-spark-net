import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Globe, Clock, Languages, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  useProfileState,
  updateRegional,
  CURRENCIES,
  TIMEZONES,
  LANGUAGES,
  type RegionalSettings,
} from "@/lib/profileStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, saveSetting, DEFAULT_SETTINGS } from "@/lib/queries/profile";
import { buildRfqHistoryCsv, buildAllDataJson, downloadFile, CHAT_SCOPE_NOTE } from "@/lib/queries/dataExport";
import { setLang, langCodeFromName, isSupportedLanguageName } from "@/lib/i18n";

function SettingsHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/profile")} aria-label="Back" className="-ml-1 p-1">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
      </div>
    </div>
  );
}

const selectCls = "w-full appearance-none rounded-xl border border-gray-300 bg-white pl-10 pr-9 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#ef4d62] transition-colors";

// Currency and timezone are saved (buyer_profiles.regional) but nothing reads
// them yet: no price formatter converts currency and no date renders in the
// chosen zone (checked repo-wide, 2026-09-23). Like an untranslated language,
// a choice the app can't honour says so. It is never silently ignored.
// Multi-currency pricing is a separate feature, not a copy fix.
const PRICE_CURRENCY = DEFAULT_SETTINGS.regional.currency;   // "₹ INR", what every price shows in
const DEFAULT_TIMEZONE = DEFAULT_SETTINGS.regional.timezone; // "IST (India Standard Time)"

const ProfileAccountPrefs = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings(user?.id);
  const { regional: storeRegional } = useProfileState();
  const [regional, setRegional] = useState<RegionalSettings>(storeRegional);

  useEffect(() => { if (user && settings) setRegional(settings.regional); }, [user, settings]);

  // Persist a single regional field (dropdowns save on change).
  const patchRegional = async (patch: Partial<RegionalSettings>) => {
    const next = { ...regional, ...patch };
    setRegional(next);
    if (user) {
      try {
        await saveSetting(user.id, "regional", next);
        queryClient.invalidateQueries({ queryKey: ["profile_settings", user.id] });
      } catch (e) {
        toast.error("Couldn't save", { description: errorMessage(e) });
        return;
      }
    } else {
      updateRegional(patch);
    }
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
      <SettingsHeader title="Regional & Data" />
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* Regional settings - dropdowns shown directly */}
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
                    patchRegional({ currency: c });
                    // Saved, never "updated": nothing converts prices, so the toast
                    // must not imply the app changed (same honesty as Language).
                    if (c === PRICE_CURRENCY) toast.success("Currency saved");
                    else toast.info(`${c} saved`, { description: `Prices still show in ${PRICE_CURRENCY} for now.` });
                  }}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {regional.currency !== PRICE_CURRENCY && (
                <p className="mt-1.5 text-[11px] text-amber-600">
                  Saved, but prices across Cosora still show in {PRICE_CURRENCY}. Other currencies aren&rsquo;t supported yet.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Timezone</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  className={selectCls}
                  value={regional.timezone}
                  onChange={(e) => {
                    const tz = e.target.value;
                    patchRegional({ timezone: tz });
                    if (tz === DEFAULT_TIMEZONE) toast.success("Timezone saved");
                    else toast.info(`${tz} saved`, { description: "Times in Cosora aren't converted to it yet." });
                  }}
                >
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {regional.timezone !== DEFAULT_TIMEZONE && (
                <p className="mt-1.5 text-[11px] text-amber-600">
                  Saved, but Cosora doesn&rsquo;t use it yet: times aren&rsquo;t converted to this time zone.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Language</label>
              <div className="relative">
                <Languages className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  className={selectCls}
                  value={regional.language}
                  onChange={(e) => {
                    const name = e.target.value;
                    patchRegional({ language: name });
                    setLang(langCodeFromName(name));
                    if (isSupportedLanguageName(name)) toast.success("Language updated");
                    // Never fail silently: a language with no dictionary reads
                    // as "translation is broken" if we just show English.
                    else toast.info(`${name} isn't available yet`, { description: "Showing English for now." });
                  }}
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  {/* A previously-saved language we no longer offer (e.g. Tamil)
                      would otherwise render as a blank select. Show it, disabled
                      and labelled, so the state is legible rather than missing. */}
                  {!isSupportedLanguageName(regional.language) && (
                    <option value={regional.language} disabled>
                      {regional.language} (not available yet)
                    </option>
                  )}
                </select>
                {!isSupportedLanguageName(regional.language) && (
                  <p className="mt-1.5 text-[11px] text-amber-600">
                    {regional.language} isn&rsquo;t translated yet, so the app is showing English. Pick another language to change it.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Data & Export */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Data &amp; Export</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">Download or manage your data</p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-3 min-w-0">
                <Download className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Export All Data</p>
                  <p className="text-xs text-gray-500">Your profile, RFQs, quotes received, chats and reviews, as a JSON file</p>
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
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default ProfileAccountPrefs;
