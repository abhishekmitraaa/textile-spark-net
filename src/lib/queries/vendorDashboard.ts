import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchSellerHome, type SellerHome } from "@/lib/queries/sellerHome";

// ─────────────────────────────────────────────────────────────
// Real vendor dashboard metrics, derived from the vendor's own rows (RLS lets
// a vendor read all their products/videos/quotes regardless of status). Feeds
// the seller home stats + the quote summary that was previously a fixture.
// ─────────────────────────────────────────────────────────────

export interface VendorDashboard {
  productsTotal: number;
  productsLive: number;
  productsUnderReview: number;
  openLeads: number;      // open-marketplace requirements the vendor can quote on
  directRequests: number; // active requirements addressed to this vendor
  quotesSent: number;
  quotesAccepted: number;
  enquiries: number;      // sum of enquiries across the vendor's products (lifetime)
  profileScore: number;
  /** Per-signal breakdown behind `profileScore`. */
  profileChecks: ProfileScoreChecks;
  /** Always true: an account with no vendor_profiles row gets `null` instead of a dashboard. */
  hasVendorRow: boolean;
  /** The exact input the score was computed from, so a "what's missing" panel
   *  can call profileScoreSignals() on it instead of re-reading the profile. */
  scoreInput: ProfileScoreInput;
  /** Everything Seller Home shows, from the same single call. */
  home: SellerHome;
}

// ─────────────────────────────────────────────────────────────
// Business Profile Score
//
// Fifteen signals, each worth a fixed weight, summing to 100. The /business-profile-score
// checklist and the dashboard ring derive from it, so a vendor filling in a field sees the
// number move by exactly the weight listed here. Keep the total at 100.
//
// The database has the same formula, point for point: public.vendor_profile_score_of()
// (migration 20261022100000) computes the stored `vendor_profiles.profile_score`, which ranks
// sellers for buyers. Change a weight or a signal here and there together.
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
 * The public `vendor_profiles` columns the score reads. One list, so a new signal
 * cannot be added to the weights above and then silently score as `false`
 * everywhere because one call site forgot to select its column.
 *
 * Two signals are private columns (admin completion Phase 4): the business phone
 * and email. fetchProfileScoreRow() adds them from my_vendor_private(). Never put
 * them back in this list.
 */
export const PROFILE_SCORE_COLUMNS =
  "about, website, category, office_photos, year_established, employee_count, annual_turnover, capacity, social, reviews_count";

/** The shape fetchProfileScoreRow() returns: PROFILE_SCORE_COLUMNS plus the two private signals. */
export interface ProfileScoreRow {
  about: string | null;
  phone: string | null;
  owner_email: string | null;
  website: string | null;
  category: string[] | null;
  office_photos: string[] | null;
  year_established: number | null;
  employee_count: string | null;
  annual_turnover: string | null;
  capacity: string[] | null;
  social: unknown;
  reviews_count: number | null;
}

/**
 * snake_case row + the three cross-table counts → the scorer's input.
 *
 * Pure, and deliberately the ONLY place that mapping is written. The score has
 * one formula (`calculateProfileScore`) and one way of being fed; a second
 * shaper is how two surfaces start disagreeing about a vendor's score without
 * either of them containing a wrong number.
 */
export function profileScoreInputFrom(
  vp: ProfileScoreRow | null,
  counts: { productsTotal: number; productsLive: number; quotesSent: number },
): ProfileScoreInput {
  return {
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
    ...counts,
  };
}

/**
 * Seller Home and the profile score from one call: public.seller_home_summary() (fetchSellerHome).
 * It replaced seven counts, a full read of the vendor's products and the profile row (2026-11-16).
 * null when the account has no vendor_profiles row. A failed call throws, so it is never shown as zeros.
 */
async function fetchVendorDashboard(): Promise<VendorDashboard | null> {
  const home = await fetchSellerHome();
  if (!home) return null;
  const c = home.counts;
  const scoreInput = profileScoreInputFrom(home.profile, {
    productsTotal: c.total,
    productsLive: c.live,
    quotesSent: c.quotesSent,
  });
  const { score: profileScore, checks: profileChecks } = calculateProfileScore(scoreInput);
  // The stored column is the database's own (vendor_profile_score_of(), the same formula); it ranks sellers.
  return {
    productsTotal: c.total,
    productsLive: c.live,
    productsUnderReview: c.underReview,
    openLeads: c.openLeads,
    directRequests: c.directRequests,
    quotesSent: c.quotesSent,
    quotesAccepted: c.quotesAccepted,
    enquiries: c.enquiries,
    profileScore,
    profileChecks,
    hasVendorRow: true,
    scoreInput,
    home,
  };
}

export function useVendorDashboard(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_dashboard", vendorId],
    queryFn: fetchVendorDashboard,
    enabled: Boolean(vendorId),
  });
}

const EMPTY_CHECKS: ProfileScoreChecks = Object.fromEntries(
  Object.keys(PROFILE_SCORE_WEIGHTS).map((k) => [k, false])
) as ProfileScoreChecks;

export interface ProfileScoreState {
  /** null while loading, on an error, signed out, or without a seller row: there is no real number to show. */
  score: number | null;
  checks: ProfileScoreChecks;
  /** True while this vendor's own rows are still in flight — show a skeleton. */
  isLoading: boolean;
  /** The read failed: show an error, never a low score. */
  isError: boolean;
  /** False for a signed-out session or an account with no vendor_profiles row. */
  hasVendorRow: boolean;
}

/**
 * Single source of truth for the "Business Profile Score" — the dashboard card,
 * the /my-store completion bar and the /business-profile-score checklist all
 * read this, so they can never disagree about the number or about which tasks
 * are still outstanding. There is no placeholder number: the 45% shown signed out
 * (DEFAULT_PROFILE_SCORE) was invented and is gone (SH-007).
 */
export function useProfileScoreState(): ProfileScoreState {
  const { user } = useAuth();
  const { data, isLoading, isError } = useVendorDashboard(user?.id);

  if (!user || isError || !data) {
    return { score: null, checks: EMPTY_CHECKS, isLoading: Boolean(user) && isLoading, isError: Boolean(user) && isError, hasVendorRow: false };
  }
  return { score: data.profileScore, checks: data.profileChecks, isLoading: false, isError: false, hasVendorRow: true };
}

/** Convenience wrapper for callers that only need the number (null when there is none). */
export function useProfileScore(): number | null {
  return useProfileScoreState().score;
}
