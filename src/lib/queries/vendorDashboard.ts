import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// Real vendor dashboard metrics, derived from the vendor's own rows (RLS lets
// a vendor read all their products/videos/quotes regardless of status). Feeds
// the seller home stats + the quote summary that was previously a fixture.
// ─────────────────────────────────────────────────────────────

export interface VendorDashboard {
  productsTotal: number;
  productsLive: number;
  productsUnderReview: number;
  videos: number;
  openLeads: number;      // active buyer RFQs the vendor can quote on
  quotesSent: number;
  quotesAccepted: number;
  enquiries: number;      // sum of enquiries across the vendor's products
  followers: number;
  profileScore: number;
  /** Per-signal breakdown behind `profileScore`. */
  profileChecks: ProfileScoreChecks;
  /** False when this account has no vendor_profiles row at all — the only
   *  case a placeholder score may stand in for a real one. */
  hasVendorRow: boolean;
  /** The exact input the score was computed from, so a "what's missing" panel
   *  can call profileScoreSignals() on it instead of re-reading the profile. */
  scoreInput: ProfileScoreInput;
}

// ─────────────────────────────────────────────────────────────
// Business Profile Score
//
// Thirteen signals, each worth a fixed weight, summing to 100. This is the
// single definition of the score: the /business-profile-score checklist, the
// dashboard ring and the `vendor_profiles.profile_score` column all derive
// from it, so a vendor filling in a field sees the number move by exactly the
// weight listed here. Tune the numbers freely, but keep the total at 100.
// ─────────────────────────────────────────────────────────────

// REWEIGHTED 2026-09-08 when annualTurnover and capacity were added as signals.
// The eight points they needed were taken from the six heaviest existing
// signals rather than by shaving every weight, so no signal moved by more than
// two points and the ordering of what matters is unchanged:
//
//   contactDetails 9->8   aboutUs 9->8    officePhotos 8->7   email 8->7
//   tenProducts   12->10  reviews 11->9   (everything else unchanged)
//   + annualTurnover 4    + capacity 4
//
// Total is still exactly 100. Keep it that way — a score out of anything other
// than 100 silently changes what every stored profile_score meant.
export const PROFILE_SCORE_WEIGHTS = {
  contactDetails: 8,
  aboutUs: 8,
  liveProduct: 7,
  category: 7,
  officePhotos: 7,
  tenProducts: 10,
  email: 7,
  reviews: 9,
  social: 6,
  website: 7,
  twoQuotes: 7,
  yearEstablished: 5,
  employeeCount: 4,
  annualTurnover: 4,
  capacity: 4,
} as const;

/**
 * Everything the score depends on. Field names are camelCase to match the rest
 * of the TS layer (`VendorStoreData`), not the snake_case column names.
 */
export interface ProfileScoreInput {
  about: string | null;
  phone: string | null;
  ownerEmail: string | null;
  website: string | null;
  category: string[] | null;
  officePhotos: string[] | null;
  yearEstablished: number | null;
  employeeCount: string | null;
  annualTurnover: string | null;
  capacity: string[] | null;
  social: Record<string, string[]> | null;
  reviewsCount: number;
  productsTotal: number;
  productsLive: number;
  quotesSent: number;
}

const filled = (v: string | null | undefined): boolean => typeof v === "string" && v.trim().length > 0;

// "At least one platform has at least one non-empty URL." Defensive about the
// shape because `social` is jsonb and nothing at the DB level constrains it.
function hasSocial(social: Record<string, string[]> | null): boolean {
  if (!social || typeof social !== "object") return false;
  return Object.values(social).some((urls) => Array.isArray(urls) && urls.some(filled));
}

/** One scoring signal: what it is worth, whether it is met, and how to fix it. */
export interface ProfileScoreSignal {
  key: keyof typeof PROFILE_SCORE_WEIGHTS;
  label: string;
  points: number;
  met: boolean;
  /** Where the vendor goes to satisfy this signal. */
  href: string;
}

/**
 * Pure: same input, same output, no I/O. The single evaluation of the thirteen
 * signals — `calculateProfileScore` sums this list rather than re-testing the
 * conditions, so the dashboard ring and any "what's missing" surface can never
 * disagree about which signals are met or what they are worth.
 */
export function profileScoreSignals(input: ProfileScoreInput): ProfileScoreSignal[] {
  const w = PROFILE_SCORE_WEIGHTS;
  return [
    { key: "contactDetails",  label: "Add a contact phone number",            points: w.contactDetails,  met: filled(input.phone),                       href: "/business-profile" },
    // A one-word "hi" is not an About Us; require something with a bit of substance.
    { key: "aboutUs",         label: "Write an About Us section",             points: w.aboutUs,         met: (input.about ?? "").trim().length > 10,    href: "/business-profile" },
    { key: "liveProduct",     label: "Get your first product live",           points: w.liveProduct,     met: input.productsLive >= 1,                   href: "/products" },
    { key: "category",        label: "Pick the categories you sell in",       points: w.category,        met: (input.category ?? []).length > 0,         href: "/business-profile" },
    { key: "officePhotos",    label: "Upload 5 photos of your premises",      points: w.officePhotos,    met: (input.officePhotos ?? []).length >= 5,    href: "/business-profile" },
    { key: "tenProducts",     label: "List 10 products",                      points: w.tenProducts,     met: input.productsTotal >= 10,                 href: "/products" },
    { key: "email",           label: "Add a business email",                  points: w.email,           met: filled(input.ownerEmail),                  href: "/business-profile" },
    { key: "reviews",         label: "Collect 20 buyer reviews",              points: w.reviews,         met: input.reviewsCount >= 20,                  href: "/reviews" },
    { key: "social",          label: "Link a social profile",                 points: w.social,          met: hasSocial(input.social),                   href: "/business-profile" },
    { key: "website",         label: "Add your website",                      points: w.website,         met: filled(input.website),                     href: "/business-profile" },
    { key: "twoQuotes",       label: "Send 2 quotes to buyers",               points: w.twoQuotes,       met: input.quotesSent >= 2,                     href: "/quotes" },
    { key: "yearEstablished", label: "Add the year you were established",     points: w.yearEstablished, met: input.yearEstablished != null,             href: "/business-profile" },
    { key: "employeeCount",   label: "Add your team size",                    points: w.employeeCount,   met: filled(input.employeeCount),               href: "/business-profile?focus=employees" },
    { key: "annualTurnover",  label: "Add your annual turnover",             points: w.annualTurnover,  met: filled(input.annualTurnover),              href: "/business-profile?focus=turnover" },
    { key: "capacity",        label: "State your production capacity",       points: w.capacity,        met: (input.capacity ?? []).length > 0,         href: "/business-profile?focus=detailed-information" },
  ];
}

/** Which of the thirteen signals are satisfied, keyed by signal. */
export type ProfileScoreChecks = Record<keyof typeof PROFILE_SCORE_WEIGHTS, boolean>;

export interface ProfileScoreResult {
  score: number;
  checks: ProfileScoreChecks;
}

/**
 * Pure: same input, same output, no I/O. Kept free of Supabase types on
 * purpose so it can be exercised directly from a test or a REPL.
 *
 * Returns the per-signal breakdown alongside the number. The score was always
 * real, but it travelled as a bare integer — so /business-profile-score, which
 * needs to know WHICH tasks are done, had no way to ask and rendered a
 * hardcoded "Missing" tag on every tile including the finished ones.
 */
export function calculateProfileScore(input: ProfileScoreInput): ProfileScoreResult {
  const signals = profileScoreSignals(input);
  const total = signals.reduce((s, sig) => s + (sig.met ? sig.points : 0), 0);
  const checks = Object.fromEntries(signals.map((sig) => [sig.key, sig.met])) as ProfileScoreChecks;
  return { score: Math.max(0, Math.min(100, Math.round(total))), checks };
}

/**
 * Head-only `count(*)` against one table with some filters applied.
 *
 * `table` is a union of the real table names rather than `string`, and the
 * builder is generic in it. With a bare `string`, `supabase.from(table)` had to
 * describe EVERY table at once, so the filter columns intersected to `never`
 * and each `.eq("vendor_id", …)` was a type error — eleven of them, which was
 * roughly half the repo's entire typecheck baseline. Narrowing the parameter
 * makes the calls below check properly instead of being silenced.
 */
type CountableTable = "products" | "product_videos" | "rfqs" | "quotes";

function buildBase<T extends CountableTable>(table: T) {
  return supabase.from(table).select("*", { count: "exact", head: true });
}

async function count<T extends CountableTable>(
  table: T,
  apply: (q: ReturnType<typeof buildBase<T>>) => PromiseLike<{ count: number | null }>,
): Promise<number> {
  const { count: n } = await apply(buildBase(table));
  return n ?? 0;
}

async function fetchVendorDashboard(vendorId: string): Promise<VendorDashboard> {
  const [
    productsTotal,
    productsLive,
    productsUnderReview,
    videos,
    openLeads,
    quotesSent,
    quotesAccepted,
  ] = await Promise.all([
    count("products", (q) => q.eq("vendor_id", vendorId)),
    count("products", (q) => q.eq("vendor_id", vendorId).eq("status", "live")),
    count("products", (q) => q.eq("vendor_id", vendorId).eq("status", "under_review")),
    count("product_videos", (q) => q.eq("vendor_id", vendorId)),
    count("rfqs", (q) => q.eq("status", "active")),
    count("quotes", (q) => q.eq("vendor_id", vendorId)),
    count("quotes", (q) => q.eq("vendor_id", vendorId).eq("status", "accepted")),
  ]);

  // Enquiries sum + profile signals from the vendor's own rows.
  const { data: prodRows } = await supabase.from("products").select("enquiries_count").eq("vendor_id", vendorId);
  const enquiries = (prodRows ?? []).reduce((s, r) => s + (r.enquiries_count ?? 0), 0);

  const { data: vp } = await supabase
    .from("vendor_profiles")
    .select(
      "followers_count, profile_score, about, phone, owner_email, website, category, office_photos, year_established, employee_count, annual_turnover, capacity, social, reviews_count"
    )
    .eq("id", vendorId)
    .maybeSingle();

  const scoreInput: ProfileScoreInput = {
    about: vp?.about ?? null,
    phone: vp?.phone ?? null,
    ownerEmail: vp?.owner_email ?? null,
    website: vp?.website ?? null,
    category: vp?.category ?? null,
    officePhotos: vp?.office_photos ?? null,
    yearEstablished: vp?.year_established ?? null,
    employeeCount: vp?.employee_count ?? null,
    annualTurnover: vp?.annual_turnover ?? null,
    capacity: vp?.capacity ?? null,
    social: (vp?.social as Record<string, string[]> | null) ?? null,
    reviewsCount: vp?.reviews_count ?? 0,
    productsTotal,
    productsLive,
    quotesSent,
  };
  const { score: profileScore, checks: profileChecks } = calculateProfileScore(scoreInput);

  // Keep the stored column in sync for anything that reads it directly (admin
  // tooling, the buyer-facing vendor page), but never let that write affect
  // this read: the value returned below is the freshly computed one either way.
  // supabase-js resolves rather than throws on a Postgres error, so both paths
  // are handled.
  if (vp && profileScore !== vp.profile_score) {
    try {
      const { error } = await supabase
        .from("vendor_profiles")
        .update({ profile_score: profileScore })
        .eq("id", vendorId);
      if (error) console.warn("[vendorDashboard] profile_score write-back failed:", error.message);
    } catch (e) {
      console.warn("[vendorDashboard] profile_score write-back threw:", e);
    }
  }

  return {
    productsTotal,
    productsLive,
    productsUnderReview,
    videos,
    openLeads,
    quotesSent,
    quotesAccepted,
    enquiries,
    followers: vp?.followers_count ?? 0,
    profileScore,
    profileChecks,
    hasVendorRow: Boolean(vp),
    scoreInput,
  };
}

export function useVendorDashboard(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_dashboard", vendorId],
    queryFn: () => fetchVendorDashboard(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// Placeholder for a session with NO vendor row — signed out, or a buyer-only
// account previewing the seller side. It is a demo number and must never stand
// in for a signed-in vendor's real score: a vendor whose profile scores 12
// seeing 45 is being told their profile is half-built when it is not.
export const DEFAULT_PROFILE_SCORE = 45;

const EMPTY_CHECKS: ProfileScoreChecks = Object.fromEntries(
  Object.keys(PROFILE_SCORE_WEIGHTS).map((k) => [k, false])
) as ProfileScoreChecks;

export interface ProfileScoreState {
  score: number;
  checks: ProfileScoreChecks;
  /** True while this vendor's own rows are still in flight — show a skeleton,
   *  not a number, because any number shown here would be made up. */
  isLoading: boolean;
  /** False for a signed-out session or an account with no vendor_profiles row. */
  hasVendorRow: boolean;
}

/**
 * Single source of truth for the "Business Profile Score" — the dashboard card,
 * the /my-store completion bar and the /business-profile-score checklist all
 * read this, so they can never disagree about the number or about which tasks
 * are still outstanding.
 */
export function useProfileScoreState(): ProfileScoreState {
  const { user } = useAuth();
  const { data, isLoading } = useVendorDashboard(user?.id);

  // Signed out: nothing to compute from, so the placeholder is the honest
  // answer (there is no real score to get wrong).
  if (!user) {
    return { score: DEFAULT_PROFILE_SCORE, checks: EMPTY_CHECKS, isLoading: false, hasVendorRow: false };
  }
  // Signed in but still loading: 0 with isLoading set, so a caller renders a
  // skeleton. Returning DEFAULT_PROFILE_SCORE here is what made a real vendor
  // briefly see 45% on every page load.
  if (!data) {
    return { score: 0, checks: EMPTY_CHECKS, isLoading, hasVendorRow: false };
  }
  return {
    score: data.profileScore,
    checks: data.profileChecks,
    isLoading: false,
    hasVendorRow: data.hasVendorRow,
  };
}

/** Convenience wrapper for callers that only need the number. */
export function useProfileScore(): number {
  return useProfileScoreState().score;
}
