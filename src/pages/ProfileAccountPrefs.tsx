import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Globe, Clock, Languages, Download, FileSpreadsheet } from "lucide-react";
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
import { useSettings, saveSetting } from "@/lib/queries/profile";
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
        toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
        return;
      }
    } else {
      updateRegional(patch);
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
                <select className={selectCls} value={regional.currency} onChange={(e) => { patchRegional({ currency: e.target.value }); toast.success("Currency updated"); }}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Timezone</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select className={selectCls} value={regional.timezone} onChange={(e) => { patchRegional({ timezone: e.target.value }); toast.success("Timezone updated"); }}>
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
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
                  <p className="text-xs text-gray-500">Download all your RFQs, quotes, and messages</p>
                </div>
              </div>
              <button onClick={() => toast.success("Preparing your data export")} className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                Export
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-3 min-w-0">
                <FileSpreadsheet className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Export RFQ History</p>
                  <p className="text-xs text-gray-500">Download your RFQ history as CSV</p>
                </div>
              </div>
              <button onClick={() => toast.success("Exporting RFQ history as CSV")} className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
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
