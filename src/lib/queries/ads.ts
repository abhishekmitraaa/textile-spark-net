import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logEngagement, sessionId } from "@/lib/queries/engagement";
import { AD_SLOTS, adSlotBlock, type AdSlot, type AdSlotId } from "@/lib/adSlots";
import { resolveCategoryIdByName } from "@/lib/queries/products";

// (buyer-facing active-ads + analytics helpers are exported at the bottom)

// ─────────────────────────────────────────────────────────────
// Vendor advertisements (campaigns). Vendor-only visibility; a campaign
// promotes one of the vendor's products with a daily budget + placement.
// ─────────────────────────────────────────────────────────────

/**
 * The full campaign state set (migration 20260912120000). Each value is a state
 * a vendor needs to see at a glance, which is why the two pauses are separate:
 * a vendor may lift their own pause and may NOT lift an admin's.
 *
 * 'paused' and 'ended' are LEGACY values kept in the DB constraint so existing
 * rows keep working. New code should not write them; `runStateOf` in
 * campaignRunState.ts folds them into the new states for display.
 *
 * 'budget_exhausted' is in the constraint but structurally unreachable —
 * pricing is flat-rate/prepaid, so nothing can ever set it.
 */
export type AdStatus =
  | "draft" | "pending_review" | "scheduled" | "active" | "rejected"
  | "changes_requested" | "paused_by_vendor" | "paused_by_admin" | "expired"
  | "budget_exhausted" | "suspended" | "archived"
  | "paused" | "ended";

export interface AdRow {
  id: string;
  title: string;
  productId: string | null;
  imageUrl: string | null;
  dailyBudget: number | null;
  placement: string | null;
  status: AdStatus;
  impressions: number;
  clicks: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  /**
   * Why the campaign is in the state it is in — the reason code and note the
   * moderator recorded. Load-bearing, not decoration: `runStateOf` reads these
   * to say "Not approved: misleading claims" instead of the generic "This
   * campaign was not approved". They were being fetched (`select("*")`) and
   * then dropped in this mapper, so the vendor-facing reasoning added in
   * Phase 8.1 silently fell back to its no-reason branch every single time.
   */
  moderationReason: string | null;
  moderatedAt: string | null;
}

interface RawAd {
  id: string; title: string; product_id: string | null; image_url: string | null;
  daily_budget: number | null; placement: string | null; status: string;
  impressions: number; clicks: number; starts_at: string | null; ends_at: string | null; created_at: string;
  moderation_reason: string | null; moderated_at: string | null;
}

function mapAd(a: RawAd): AdRow {
  return {
    id: a.id, title: a.title, productId: a.product_id, imageUrl: a.image_url,
    dailyBudget: a.daily_budget != null ? Number(a.daily_budget) : null,
    placement: a.placement, status: (a.status as AdStatus) ?? "draft",
    impressions: a.impressions, clicks: a.clicks,
    startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at,
    moderationReason: a.moderation_reason, moderatedAt: a.moderated_at,
  };
}

async function fetchMyAds(vendorId: string): Promise<AdRow[]> {
  const { data, error } = await supabase
    .from("advertisements")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawAd[]).map(mapAd);
}

export function useMyAds(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["advertisements", "mine", vendorId],
    queryFn: () => fetchMyAds(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export interface NewAd {
  title: string;
  productId?: string | null;
  imageUrl?: string | null;
  dailyBudget?: number | null;
  placement?: string | null;
  status?: AdStatus;
  endsAt?: string | null;
}

export async function createAd(vendorId: string, a: NewAd): Promise<void> {
  const { error } = await supabase.from("advertisements").insert({
    vendor_id: vendorId,
    title: a.title,
    product_id: a.productId ?? null,
    image_url: a.imageUrl ?? null,
    daily_budget: a.dailyBudget ?? null,
    placement: a.placement ?? null,
    // 'draft', never 'active'. A campaign reaches buyers only through payment
    // (which lands it on pending_review) and then admin approval. The RLS
    // INSERT policy refuses status='active' from a vendor anyway; this makes
    // the intent explicit rather than relying on being refused.
    status: a.status ?? "draft",
    starts_at: new Date().toISOString(),
    ends_at: a.endsAt ?? null,
  });
  if (error) throw error;
}

// ── Status changes go through the review RPCs, never a bare UPDATE ──────────
//
// A client UPDATE that RLS denies matches zero rows and PostgREST reports
// SUCCESS — the vendor would see "Campaign paused" and it would still be
// running. Each RPC below checks authorization inside itself and RAISES, so a
// refusal actually surfaces here as a thrown error.

/** Vendor pauses their own running campaign. */
export async function pauseMyCampaign(id: string, reasonCode?: string): Promise<void> {
  const { error } = await supabase.rpc("pause_ad_campaign_by_vendor", {
    p_ad_id: id,
    p_reason_code: reasonCode ?? undefined,
  });
  if (error) throw error;
}

/**
 * Resume. Returns where it landed — 'active' or 'scheduled' — because a
 * campaign resumed before its start date must not claim to be live.
 * Raises if an admin was the one who paused it.
 */
export async function resumeMyCampaign(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("resume_ad_campaign", { p_ad_id: id });
  if (error) throw error;
  return (data as string | null) ?? "active";
}

/** changes_requested → pending_review, after the vendor has edited the campaign. */
export async function resubmitMyCampaign(id: string): Promise<void> {
  const { error } = await supabase.rpc("resubmit_ad_campaign", { p_ad_id: id });
  if (error) throw error;
}

/** Convenience for the dashboard's single pause/resume toggle. */
export async function setCampaignRunning(id: string, running: boolean): Promise<void> {
  if (running) await resumeMyCampaign(id);
  else await pauseMyCampaign(id);
}

export async function deleteAd(id: string): Promise<void> {
  const { error } = await supabase.from("advertisements").delete().eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Buyer-facing: active ads that promote a live product, surfaced as
// "Sponsored" placements in the buyer feed. Read through a SECURITY DEFINER
// RPC so buyers get only safe fields (never budgets) and don't need table
// read access. Impressions/clicks are bumped via dedicated RPCs.
// ─────────────────────────────────────────────────────────────
export interface ActiveAd {
  adId: string;
  productId: string | null;
  title: string;
  placement: string | null;
  productName: string | null;
  price: string | null;
  imageUrl: string | null;
  vendorId: string | null;
  vendorName: string | null;
  /** Promoted product's category, e.g. "T-shirts/Tops". Returned by the RPC so
   *  buyers never have to read `products`/`advertisements` directly for it. */
  categoryName: string | null;
}

interface RawActiveAd {
  ad_id: string; product_id: string | null; title: string; placement: string | null;
  product_name: string | null; price_value: number | null; currency: string | null;
  image_url: string | null; vendor_id: string | null; vendor_name: string | null;
  category_name: string | null;
}

// categoryId (optional) filters serving to ads targeting that category, plus
// untargeted ads — real category targeting where a buyer category signal exists
// (e.g. the product-detail page's own category).
//
// placements (optional) restricts the slot to specific ad types, matched
// SERVER-SIDE against the comma-joined `placement` column. Filtering client-side
// after the LIMIT would let a rail come back empty purely because its ad types
// happened to fall outside the first N rows.
//
// categoryIds (optional) is the plural form, for a page whose context is a SET
// of categories — For You, where the context is the buyer's stored preferences
// and each preference covers several taxonomy rows. UNIONed with categoryId,
// not intersected: both describe context the viewer is in.
async function fetchActiveAds(
  max: number,
  categoryId?: string | null,
  placements?: readonly string[] | null,
  categoryIds?: readonly string[] | null,
): Promise<ActiveAd[]> {
  const { data, error } = await supabase.rpc("active_ads", {
    max_count: max,
    filter_category: categoryId ?? undefined,
    filter_placements: placements && placements.length ? [...placements] : undefined,
    filter_categories: categoryIds && categoryIds.length ? [...categoryIds] : undefined,
  });
  if (error) throw error;
  return ((data ?? []) as RawActiveAd[]).map((a) => ({
    adId: a.ad_id,
    productId: a.product_id,
    title: a.title,
    placement: a.placement,
    productName: a.product_name,
    price: a.price_value != null ? `${a.currency ?? "₹"}${Math.round(Number(a.price_value))}` : null,
    imageUrl: a.image_url,
    vendorId: a.vendor_id,
    vendorName: a.vendor_name,
    categoryName: a.category_name,
  }));
}

export function useActiveAds(
  max = 12,
  categoryId?: string | null,
  placements?: readonly string[] | null,
  categoryIds?: readonly string[] | null,
) {
  return useQuery({
    queryKey: [
      "advertisements", "active", max, categoryId ?? null,
      placements ? [...placements].sort().join(",") : null,
      categoryIds ? [...categoryIds].sort().join(",") : null,
    ],
    queryFn: () => fetchActiveAds(max, categoryId, placements, categoryIds),
    staleTime: 60_000,
  });
}

/**
 * The way every Phase 5 rail should ask for inventory: name the slot, and the
 * ad types and size come from AD_SLOTS. A page cannot then quietly render an
 * ad type the placement plan never gave it a slot for.
 */
export function useAdSlot(slot: AdSlotId, categoryId?: string | null, categoryIds?: readonly string[] | null) {
  const spec = AD_SLOTS[slot];
  return useActiveAds(spec.max, categoryId, spec.types, categoryIds);
}

/**
 * The same inventory, already cut into the slot's repeating blocks — for pages
 * that render the ad markup themselves (New Arrivals' Brand Picks, For You)
 * rather than mounting SponsoredRail, which does its own slicing.
 *
 * One fetch, N disjoint slices: `blocks[0]` and `blocks[1]` never share a
 * campaign, so putting them at different depths of a feed gives the page more
 * sponsored positions without showing any vendor's ad twice. Short inventory
 * yields fewer non-empty blocks, never a repeat — three live campaigns across a
 * 3x4 slot is one block of three, not three blocks of the same three.
 */
export function useAdSlotBlocks(
  slot: AdSlotId,
  categoryId?: string | null,
  categoryIds?: readonly string[] | null,
): ActiveAd[][] {
  // Annotated rather than inferred: AD_SLOTS[slot] on a generic AdSlotId is the
  // union of every slot's literal type, and `repeat` is absent from the deferred
  // one, so the union has no such property.
  const spec: AdSlot = AD_SLOTS[slot];
  const { data } = useActiveAds(spec.max, categoryId, spec.types, categoryIds);
  return useMemo(() => {
    const count = spec.repeat ? spec.repeat.blocks : 1;
    return Array.from({ length: count }, (_, i) => adSlotBlock(slot, data ?? [], i));
  }, [slot, spec, data]);
}

/**
 * Category context for pages whose own vocabulary is curated rather than
 * taxonomic (the Trends chips). Resolves display names to a real categories
 * row so targeting can be evaluated against the one taxonomy.
 *
 * Returns undefined while loading and null when nothing matched — the caller
 * passes that straight through, and `null` means "no category context", which
 * active_ads() treats as "do not let category exclude anything" rather than
 * "match nothing".
 */
export function useResolvedCategoryId(candidates: readonly (string | null | undefined)[]) {
  const key = candidates.filter(Boolean).join("|");
  return useQuery({
    queryKey: ["category_id_by_name", key],
    queryFn: () => resolveCategoryIdByName(candidates),
    enabled: key.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────
// Real, anonymized category benchmarks for the Advertise → Competitor page
// (see ad_category_benchmarks RPC). No named competitors — aggregates only.
// ─────────────────────────────────────────────────────────────
export interface CategoryBenchmark {
  category_id: string; category_name: string; product_count: number;
  vendor_count: number; avg_price: number; avg_views: number; your_products: number;
}
export interface AdBenchmarks {
  has_data: boolean;
  categories: CategoryBenchmark[];
  reviews: { yours: number; peer_avg: number };
  photos: { yours: number; peer_avg: number };
  active_ads_in_categories: number;
  peer_vendor_count: number;
}

async function fetchAdBenchmarks(vendorId: string): Promise<AdBenchmarks> {
  const { data, error } = await supabase.rpc("ad_category_benchmarks", { v: vendorId });
  if (error) throw error;
  return (data as unknown as AdBenchmarks) ?? { has_data: false, categories: [], reviews: { yours: 0, peer_avg: 0 }, photos: { yours: 0, peer_avg: 0 }, active_ads_in_categories: 0, peer_vendor_count: 0 };
}

export function useAdBenchmarks(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["ad_benchmarks", vendorId],
    queryFn: () => fetchAdBenchmarks(vendorId as string),
    enabled: Boolean(vendorId),
    staleTime: 5 * 60 * 1000,
  });
}

// Also expose a vendor's own live categories (id+name) for the ad targeting
// picker — the real DB categories the vendor sells in.
export interface AdCategoryOption { id: string; name: string }
async function fetchVendorCategories(vendorId: string): Promise<AdCategoryOption[]> {
  const { data: prods } = await supabase
    .from("products").select("category_id").eq("vendor_id", vendorId).not("category_id", "is", null);
  const ids = Array.from(new Set(((prods ?? []).map((p) => p.category_id).filter(Boolean)) as string[]));
  if (!ids.length) return [];
  const { data: cats } = await supabase.from("categories").select("id, name").in("id", ids);
  return ((cats ?? []) as AdCategoryOption[]).sort((a, b) => a.name.localeCompare(b.name));
}

export function useVendorCategories(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["ad_categories", vendorId],
    queryFn: () => fetchVendorCategories(vendorId as string),
    enabled: Boolean(vendorId),
    staleTime: 5 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────
// Campaign goal → where a click should land.
//
// The decision itself lives in `@/lib/adDestination`, a dependency-free module
// so it can be exercised by `scripts/ad-destination-check.mjs` without a
// browser or a session — it is the one branch here that changes real
// buyer-facing navigation and decides whether a vendor gets the traffic they
// paid for. Re-exported so call sites import it from the ads module as before.
// ─────────────────────────────────────────────────────────────
export { isProfileGoalAd, adDestination, PROFILE_GOAL_PLACEMENTS } from "@/lib/adDestination";

// Counter + event, side by side. The counters stay because the campaigns table
// and Cosora-Admin read advertisements.impressions/clicks directly; the event
// adds the timestamp, viewer and source the counter cannot carry.
//
// Both halves are scoped to the SAME anonymous session id. ad_impression now
// consults ad_frequency_capped(), which counts out of engagement_events — so if
// the counter passed a different session than the log wrote, the cap would
// count one viewer and suppress another. Signed-in viewers are keyed on
// auth.uid() inside the RPC and the session id is ignored.
//
// Past the daily cap the ad STILL RENDERS; only the counting stops (Phase 3.6).
export async function logAdImpression(adId: string): Promise<void> {
  await supabase.rpc("ad_impression", { ad: adId, p_session: sessionId() ?? undefined });
  void logEngagement({ eventType: "ad_impression", adId, source: "ad" });
}

export async function logAdClick(adId: string): Promise<void> {
  await supabase.rpc("ad_click", { ad: adId, p_session: sessionId() ?? undefined });
  void logEngagement({ eventType: "ad_click", adId, source: "ad" });
}
