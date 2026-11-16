import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { INDIA_STATES } from "@/data/indiaStates";
import { errorMessage } from "@/lib/errorMessage";
import { useLang } from "@/lib/i18n";
import { adStateAllowance, type AdLocationScope } from "@/lib/plan";
import { fetchCampaignForEdit, saveAndResubmitCampaign, useVendorCategories, type CampaignEdit } from "@/lib/queries/ads";
import { useVendorPlan } from "@/lib/queries/subscriptions";
import { cn } from "@/lib/utils";

const TITLE_MAX = 120;

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/**
 * "Changes needed" → Edit and resubmit (Seller Home audit SH-089).
 *
 * After Cosora asks for changes a seller may change what the database allows (`enforce_ads_moderation`): the
 * wording, the picture and who the ad is shown to. The ad types, the days and the listing stay as paid for.
 * Saving sends only what changed, then `resubmit_ad_campaign()` puts the campaign back in review; the paid days
 * start when it is approved (20261116110300), so the time spent here costs nothing.
 */
export function EditCampaignDialog({
  adId,
  reason,
  onClose,
}: {
  /** The campaign being edited; null keeps the dialog closed. */
  adId: string | null;
  /** What Cosora asked for, in words. */
  reason: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const lang = useLang();
  const qc = useQueryClient();
  const titleId = useId();
  const { data: ad, isLoading, isError, refetch } = useQuery({
    queryKey: ["advertisements", "edit", adId],
    queryFn: () => fetchCampaignForEdit(adId as string),
    enabled: Boolean(adId),
    staleTime: 0,
  });
  const { data: vendorCats = [] } = useVendorCategories(user?.id);
  const { data: vplan } = useVendorPlan(user?.id);
  const stateLimit = adStateAllowance((vplan?.limits.ad_location_scope ?? "none") as AdLocationScope);

  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!ad) return;
    setTitle(ad.title);
    setImageUrl(ad.imageUrl);
    setCategories(ad.targetCategories);
    setStates(ad.targetStates);
    setCities(ad.targetCities);
    setCountries(ad.targetCountries);
    setProblem(null);
  }, [ad]);

  // Only what changed is sent (a form save never writes fields the person didn't touch).
  const changes = useMemo((): CampaignEdit => {
    if (!ad) return {};
    const c: CampaignEdit = {};
    if (title.trim() !== ad.title) c.title = title.trim();
    if (imageUrl !== ad.imageUrl) c.imageUrl = imageUrl;
    if (!same(categories, ad.targetCategories)) c.targetCategories = categories;
    if (!same(states, ad.targetStates)) c.targetStates = states;
    if (!same(cities, ad.targetCities)) c.targetCities = cities;
    if (!same(countries, ad.targetCountries)) c.targetCountries = countries;
    return c;
  }, [ad, title, imageUrl, categories, states, cities, countries]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const toggleState = (code: string) => {
    if (!states.includes(code) && Number.isFinite(stateLimit) && states.length >= stateLimit) {
      setProblem(`Your plan reaches up to ${stateLimit} state${stateLimit === 1 ? "" : "s"}. Remove one to add another.`);
      return;
    }
    setProblem(null);
    toggle(states, setStates, code);
  };

  const submit = async () => {
    if (!ad || !title.trim() || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await saveAndResubmitCampaign(ad.id, changes);
      await qc.invalidateQueries({ queryKey: ["advertisements"] });
      onClose();
    } catch (e) {
      // The database's own words when it refuses (the plan's reach, a campaign already resubmitted).
      setProblem(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
      on ? "border-brand-vendor bg-brand-vendor text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
    );
  const stateName = (code: string) => {
    const st = INDIA_STATES.find((s) => s.code === code);
    return st ? (lang === "hi" ? st.hi : lang === "gu" ? st.gu : st.name) : code;
  };
  // States are offered when the campaign already reaches some: that is the account's kind of targeting.
  const showStates = Boolean(ad && ad.targetStates.length > 0);

  return (
    <Dialog open={Boolean(adId)} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit and resubmit</DialogTitle>
          <DialogDescription>
            Change what Cosora asked for, then send the campaign back for review. The ad types, the days and the listing stay as you paid for them, and your days start when it is approved.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your campaign
          </div>
        )}

        {isError && (
          <div className="py-6 text-sm text-gray-600">
            <p>We couldn't load this campaign. Check your connection and try again.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </div>
        )}

        {!isLoading && !isError && !ad && adId && (
          <p className="py-6 text-sm text-gray-600">This campaign is no longer waiting for changes.</p>
        )}

        {ad && (
          <div className="space-y-5">
            {reason && (
              <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5 text-xs text-orange-800">
                <p className="font-semibold">What Cosora asked for</p>
                <p className="mt-0.5" data-no-translate>{reason}</p>
              </div>
            )}

            <div>
              <label htmlFor={titleId} className="mb-1.5 block text-xs font-semibold text-gray-700">Title</label>
              <Input
                id={titleId}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base sm:text-sm"
                data-no-translate
              />
              {!title.trim() && <p className="mt-1 text-xs text-red-600">Give the campaign a title.</p>}
            </div>

            {ad.pictures.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-gray-700">Picture</p>
                <p className="mb-2 text-[11px] text-gray-500">From the listing this campaign promotes. Add a clearer photo to the listing first if none of these will do.</p>
                <div className="flex flex-wrap gap-2">
                  {ad.pictures.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      aria-label={`Use picture ${i + 1}`}
                      aria-pressed={imageUrl === url}
                      onClick={() => setImageUrl(url)}
                      className={cn(
                        "h-16 w-16 overflow-hidden rounded-lg border-2 bg-gray-100",
                        imageUrl === url ? "border-brand-vendor" : "border-transparent hover:border-gray-300",
                      )}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-700">Categories</p>
              <p className="mb-2 text-[11px] text-gray-500">Show this ad to buyers browsing these categories. Leave them all unchosen to show it to everyone.</p>
              {vendorCats.length === 0 && categories.length === 0 ? (
                <p className="text-xs text-gray-400">Add products with a category to target by category.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {vendorCats.map((c) => (
                    <button key={c.id} type="button" aria-pressed={categories.includes(c.id)} onClick={() => toggle(categories, setCategories, c.id)} className={chip(categories.includes(c.id))}>
                      {c.name}
                    </button>
                  ))}
                  {/* Chosen at booking, from a listing that has since changed category: it can only be removed. */}
                  {categories.filter((id) => !vendorCats.some((c) => c.id === id)).map((id) => (
                    <button key={id} type="button" aria-pressed onClick={() => toggle(categories, setCategories, id)} className={chip(true)}>
                      Another category <X className="ml-1 inline h-3 w-3" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {showStates && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-gray-700">States</p>
                <p className="mb-2 text-[11px] text-gray-500">Buyers in other states won't see this ad. Buyers whose state we don't know still can.</p>
                <div className="flex flex-wrap gap-2">
                  {INDIA_STATES.map((st) => (
                    <button key={st.code} type="button" data-no-translate aria-pressed={states.includes(st.code)} onClick={() => toggleState(st.code)} className={chip(states.includes(st.code))}>
                      {stateName(st.code)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(ad.targetCities.length > 0 || ad.targetCountries.length > 0) && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-gray-700">Other places this ad reaches</p>
                <p className="mb-2 text-[11px] text-gray-500">Tap one to stop showing the ad there.</p>
                <div className="flex flex-wrap gap-2">
                  {ad.targetCities.map((c) => (
                    <button key={`city-${c}`} type="button" data-no-translate aria-pressed={cities.includes(c)} onClick={() => toggle(cities, setCities, c)} className={chip(cities.includes(c))}>
                      {c}
                    </button>
                  ))}
                  {ad.targetCountries.map((c) => (
                    <button key={`country-${c}`} type="button" data-no-translate aria-pressed={countries.includes(c)} onClick={() => toggle(countries, setCountries, c)} className={chip(countries.includes(c))}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{problem}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!ad || !title.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resubmit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
