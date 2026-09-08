import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { windowStart } from "@/lib/queries/vendorAnalytics";

// ─────────────────────────────────────────────────────────────
// engagement_events — the visit-level event log.
//
// One table, seven event types (see the 20260907170000 migration for why one
// and not four). This module is both halves of it: the fire-and-forget WRITE
// used at every call site, and the vendor-side READ every rebuilt panel uses.
//
// THE COUNTERS ARE NOT REPLACED. `increment_product_view`, `ad_impression` and
// `ad_click` still run exactly as before and their columns are still what the
// buyer feed sorts on and the campaigns table reads. Each call site now does
// both writes side by side. That is deliberate: the counters carry history from
// before this table existed, and other surfaces read them directly.
//
// NOT-INSTALLED IS A DISTINCT STATE. Until the migration is applied, PostgREST
// answers PGRST205 ("could not find the table"). That is NOT the same as "no
// events yet", and collapsing the two is exactly how a broken page passes for
// an empty one (see claude.md, "Signed-out / loading / error / empty must stay
// four distinct states"). Every reader here reports `installed: false` in that
// case and the panels keep saying the feature is not switched on.
// ─────────────────────────────────────────────────────────────

export type EngagementEventType =
  | "product_view"
  | "profile_view"
  | "search_impression"
  | "search_click"
  | "ad_impression"
  | "ad_click"
  | "cta_click";

export type EngagementSource =
  | "organic_search"
  | "category_browse"
  | "recommendation"
  | "ad"
  | "external"
  | "direct";

/** Stable identifiers for tracked CTAs. Never a display label — the panel
 *  groups on these, so renaming one silently splits its history in two. */
export type CtaName =
  | "message"
  | "view_reviews"
  | "ask_more_reviews"
  | "upload_more_photos"
  | "promote_product"
  | "add_product";

export const CTA_LABELS: Record<CtaName | "call_now", string> = {
  call_now: "Call Now",
  message: "Message",
  view_reviews: "View Reviews",
  ask_more_reviews: "Ask for Reviews",
  upload_more_photos: "Upload Photos",
  promote_product: "Promote Product",
  add_product: "Add Product",
};

// ── Session id: signed-out dedup only ────────────────────────────────────────
// Deliberately `sessionStorage`, not `localStorage`: this is a fallback for
// counting one anonymous browsing session as one visitor, not a durable
// identifier for a person. It dies with the tab, which is the intended
// lifetime — a persistent anonymous id would be tracking, and the moment the
// viewer signs in the server ignores this value entirely (see
// log_engagement_event: session_id is only stored when auth.uid() is null).
const SESSION_KEY = "cosora_engagement_session";

function sessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled. A null session id just means this
    // anonymous view cannot be deduped, which is better than throwing inside a
    // navigation handler.
    return null;
  }
}

// ── Where the viewer came from ───────────────────────────────────────────────
//
// `source` has to be known at the DESTINATION (ProductDetail logs the view) but
// is only known at the ORIGIN (the search results page knows the click was a
// search result). Threading it through would mean adding router state to every
// `<Link to="/product/...">` in the buyer app and keeping them all in step.
//
// Instead the origin leaves a marker and the destination consumes it exactly
// once. The TTL is the important part: without it, a stale marker from a search
// ten minutes ago would relabel a later direct visit as organic search, which
// is worse than the honest `'direct'` default. sessionStorage rather than a
// module variable so it survives a full page load, which is what a hard
// navigation to /product/:id actually is.
const NAV_SOURCE_KEY = "cosora_nav_source";
const NAV_SOURCE_TTL_MS = 15_000;

/** Called by the surface the buyer is LEAVING, immediately before navigating. */
export function markNavSource(source: EngagementSource): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(NAV_SOURCE_KEY, JSON.stringify({ source, at: Date.now() }));
  } catch {
    // Storage unavailable — the destination falls back to 'direct'.
  }
}

/** Called once by the destination. Reads and clears; expired markers are dropped. */
export function consumeNavSource(): EngagementSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(NAV_SOURCE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(NAV_SOURCE_KEY);
    const parsed = JSON.parse(raw) as { source?: EngagementSource; at?: number };
    if (!parsed.source || typeof parsed.at !== "number") return null;
    return Date.now() - parsed.at <= NAV_SOURCE_TTL_MS ? parsed.source : null;
  } catch {
    return null;
  }
}

export interface LogEngagementInput {
  eventType: EngagementEventType;
  /** Only needed for events with no product or ad to derive the vendor from. */
  vendorId?: string | null;
  productId?: string | null;
  adId?: string | null;
  source?: EngagementSource | null;
  queryText?: string | null;
  ctaName?: CtaName | null;
}

/**
 * Fire-and-forget. Never awaited by a navigation handler, never throws, and
 * never blocks what the user actually asked for — same contract as the existing
 * `logAdImpression` / `logAdClick`. `viewer_id` is taken from auth.uid() inside
 * the RPC, so it is not a parameter here: a client that could name the viewer
 * could forge every unique-visitor and attribution figure on the page.
 */
export async function logEngagement(input: LogEngagementInput): Promise<void> {
  try {
    await supabase.rpc("log_engagement_event", {
      p_event_type: input.eventType,
      p_vendor_id: input.vendorId ?? undefined,
      p_product_id: input.productId ?? undefined,
      p_ad_id: input.adId ?? undefined,
      p_session_id: sessionId() ?? undefined,
      p_source: input.source ?? undefined,
      p_query_text: input.queryText ?? undefined,
      p_cta_name: input.ctaName ?? undefined,
    });
  } catch {
    // Telemetry must never be load-bearing.
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface EngagementRow {
  eventType: EngagementEventType;
  productId: string | null;
  adId: string | null;
  viewerId: string | null;
  sessionId: string | null;
  source: EngagementSource | null;
  queryText: string | null;
  ctaName: string | null;
  createdAt: string;
}

export interface EngagementWindow {
  /** False when the table does not exist yet — NOT the same as "no events". */
  installed: boolean;
  rows: EngagementRow[];
  /** True when the row cap was hit and the figures below are a lower bound. */
  truncated: boolean;
}

/**
 * A vendor's events over one window, in one round trip. Everything downstream
 * tallies client-side, matching how `fetchMySubmittedQuotes` counts competing
 * quotes — PostgREST has no GROUP BY, and one scan over a
 * (vendor_id, created_at) index beats a request per panel.
 */
const ROW_CAP = 10_000;

async function fetchEngagementWindow(vendorId: string, days: number): Promise<EngagementWindow> {
  const { data, error } = await supabase
    .from("engagement_events")
    .select("event_type, product_id, ad_id, viewer_id, session_id, source, query_text, cta_name, created_at")
    .eq("vendor_id", vendorId)
    .gte("created_at", windowStart(days).toISOString())
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);

  if (error) {
    // PGRST205 = table absent from the schema cache, i.e. the migration has not
    // been applied. Anything else is a genuine failure and must surface.
    if (error.code === "PGRST205") return { installed: false, rows: [], truncated: false };
    throw error;
  }

  const rows = ((data ?? []) as {
    event_type: string; product_id: string | null; ad_id: string | null; viewer_id: string | null;
    session_id: string | null; source: string | null; query_text: string | null;
    cta_name: string | null; created_at: string;
  }[]).map((r) => ({
    eventType: r.event_type as EngagementEventType,
    productId: r.product_id,
    adId: r.ad_id,
    viewerId: r.viewer_id,
    sessionId: r.session_id,
    source: r.source as EngagementSource | null,
    queryText: r.query_text,
    ctaName: r.cta_name,
    createdAt: r.created_at,
  }));

  return { installed: true, rows, truncated: rows.length >= ROW_CAP };
}

export function useEngagementWindow(vendorId: string | undefined, days: number) {
  return useQuery({
    queryKey: ["engagement_events", vendorId, days],
    queryFn: () => fetchEngagementWindow(vendorId as string, days),
    enabled: Boolean(vendorId),
    // The table may not exist yet; a missing table is a stable answer, not a
    // transient failure, so there is nothing to retry.
    retry: false,
  });
}

// ── Derivations (all pure over a fetched window) ─────────────────────────────

export interface DayPoint {
  /** ISO date, YYYY-MM-DD, in the viewer's local time. */
  date: string;
  /** Short label for the axis ("7 Sep" / "Mon"). */
  name: string;
  views: number;
  adClicks: number;
}

const DAY_MS = 86_400_000;

/** One bucket per day across the whole window, including days with no events —
 *  a gap-free axis, so a quiet Sunday reads as zero rather than disappearing. */
export function dailySeries(win: EngagementWindow | undefined, days: number): DayPoint[] {
  const buckets = new Map<string, DayPoint>();
  const now = new Date();
  const labelFmt: Intl.DateTimeFormatOptions =
    days <= 7 ? { weekday: "short" } : { day: "numeric", month: "short" };

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = localDateKey(d);
    buckets.set(key, { date: key, name: d.toLocaleDateString("en-IN", labelFmt), views: 0, adClicks: 0 });
  }

  for (const r of win?.rows ?? []) {
    const key = localDateKey(new Date(r.createdAt));
    const b = buckets.get(key);
    if (!b) continue;
    if (r.eventType === "product_view" || r.eventType === "profile_view") b.views += 1;
    if (r.eventType === "ad_click") b.adClicks += 1;
  }

  return Array.from(buckets.values());
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const SOURCE_LABELS: Record<EngagementSource, string> = {
  organic_search: "Search",
  category_browse: "Category browse",
  recommendation: "Recommendations",
  ad: "Ads",
  external: "External links",
  direct: "Direct",
};

export interface SourceBucket { source: EngagementSource; label: string; count: number; percent: number }

/** Real Traffic Sources — the card removed in Phase 1.3, now backed by data. */
export function trafficSources(win: EngagementWindow | undefined): SourceBucket[] {
  const views = (win?.rows ?? []).filter((r) => r.eventType === "product_view" || r.eventType === "profile_view");
  const counts = new Map<EngagementSource, number>();
  for (const r of views) {
    const s = r.source ?? "direct";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const total = views.length;
  return Array.from(counts, ([source, count]) => ({
    source,
    label: SOURCE_LABELS[source] ?? source,
    count,
    percent: total ? Math.round((count / total) * 100) : 0,
  })).sort((a, b) => b.count - a.count);
}

export interface VisitorCounts {
  totalViews: number;
  uniqueVisitors: number;
  /** Views that came from a signed-out session (deduped by session_id). */
  signedOutViews: number;
}

/**
 * Unique visitors ALONGSIDE total views, never instead of it — they answer
 * different questions and one is always smaller. `coalesce(viewer_id,
 * session_id)`: a signed-in viewer is one person however many tabs they open;
 * a signed-out one can only be deduped within their session, so this is a lower
 * bound on reach, not a headcount.
 */
export function visitorCounts(win: EngagementWindow | undefined): VisitorCounts {
  const views = (win?.rows ?? []).filter((r) => r.eventType === "product_view");
  const ids = new Set<string>();
  let signedOut = 0;
  for (const r of views) {
    if (r.viewerId) ids.add(`u:${r.viewerId}`);
    else {
      signedOut += 1;
      // A signed-out view with no session id cannot be deduped at all; count it
      // as its own visitor rather than silently merging every such view into one.
      ids.add(r.sessionId ? `s:${r.sessionId}` : `anon:${r.createdAt}`);
    }
  }
  return { totalViews: views.length, uniqueVisitors: ids.size, signedOutViews: signedOut };
}

export interface QueryPerformanceRow {
  term: string;
  impressions: number;
  clicks: number;
  /** Clicks ÷ impressions, 0-100. null when the term has no impressions. */
  ctr: number | null;
}

/**
 * Search-query performance, the Amazon SQP shape: per term, impressions →
 * clicks. Deliberately NOT a platform-wide rank or share-of-voice claim: these
 * rows are only this vendor's own impressions, so the sample cannot support a
 * statement about how the term performs across Cosora.
 */
export function queryPerformance(win: EngagementWindow | undefined): QueryPerformanceRow[] {
  const agg = new Map<string, { impressions: number; clicks: number }>();
  for (const r of win?.rows ?? []) {
    if (r.eventType !== "search_impression" && r.eventType !== "search_click") continue;
    const term = (r.queryText ?? "").trim().toLowerCase();
    if (!term) continue;
    const cur = agg.get(term) ?? { impressions: 0, clicks: 0 };
    if (r.eventType === "search_impression") cur.impressions += 1;
    else cur.clicks += 1;
    agg.set(term, cur);
  }
  return Array.from(agg, ([term, v]) => ({
    term,
    impressions: v.impressions,
    clicks: v.clicks,
    ctr: v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 100) : null,
  })).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

export interface AdAttribution {
  /** profile_view events with source='ad'. */
  profileViews: number;
  /** product_view events with source='ad'. */
  productViews: number;
}

/**
 * Ad-attributed traffic, split two ways and never merged into one number.
 * A storefront visit and a product visit are different outcomes bought by
 * different campaign goals (Amazon reports Brand Store Page Visits separately
 * from product traffic for exactly this reason), and a vendor who paid for
 * "Visit your profile" needs to see whether that is what they got.
 */
export function adAttribution(win: EngagementWindow | undefined): AdAttribution {
  const rows = (win?.rows ?? []).filter((r) => r.source === "ad");
  return {
    profileViews: rows.filter((r) => r.eventType === "profile_view").length,
    productViews: rows.filter((r) => r.eventType === "product_view").length,
  };
}

export interface CtaRow { name: string; label: string; count: number }

/**
 * CTA performance. `callCount` folds the pre-existing `calls` table in as one
 * more row rather than reporting Call Now separately — it was the only tracked
 * CTA before this table existed, and splitting the picture across two surfaces
 * is what made it easy to miss that nothing else was tracked at all.
 */
export function ctaPerformance(win: EngagementWindow | undefined, callCount: number): CtaRow[] {
  const counts = new Map<string, number>();
  for (const r of win?.rows ?? []) {
    if (r.eventType !== "cta_click" || !r.ctaName) continue;
    counts.set(r.ctaName, (counts.get(r.ctaName) ?? 0) + 1);
  }
  const rows: CtaRow[] = Array.from(counts, ([name, count]) => ({
    name,
    label: CTA_LABELS[name as CtaName] ?? name,
    count,
  }));
  if (callCount > 0) rows.push({ name: "call_now", label: CTA_LABELS.call_now, count: callCount });
  return rows.sort((a, b) => b.count - a.count);
}
