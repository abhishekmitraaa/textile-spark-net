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

export const PROFILE_SCORE_WEIGHTS = {
  contactDetails: 9,
  aboutUs: 9,
  liveProduct: 7,
  category: 7,
  officePhotos: 8,
  tenProducts: 12,
  email: 8,
  reviews: 11,
  social: 6,
  website: 7,
  twoQuotes: 7,
  yearEstablished: 5,
  employeeCount: 4,
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

/**
 * Pure: same input, same output, no I/O. Kept free of Supabase types on
 * purpose so it can be exercised directly from a test or a REPL.
 */
export function calculateProfileScore(input: ProfileScoreInput): number {
  const w = PROFILE_SCORE_WEIGHTS;
  let total = 0;

  if (filled(input.phone)) total += w.contactDetails;
  // A one-word "hi" is not an About Us; require something with a bit of substance.
  if ((input.about ?? "").trim().length > 10) total += w.aboutUs;
  if (input.productsLive >= 1) total += w.liveProduct;
  if ((input.category ?? []).length > 0) total += w.category;
  if ((input.officePhotos ?? []).length >= 5) total += w.officePhotos;
  if (input.productsTotal >= 10) total += w.tenProducts;
  if (filled(input.ownerEmail)) total += w.email;
  if (input.reviewsCount >= 20) total += w.reviews;
  if (hasSocial(input.social)) total += w.social;
  if (filled(input.website)) total += w.website;
  if (input.quotesSent >= 2) total += w.twoQuotes;
  if (input.yearEstablished != null) total += w.yearEstablished;
  if (filled(input.employeeCount)) total += w.employeeCount;

  return Math.max(0, Math.min(100, Math.round(total)));
}

async function count(table: string, apply: (q: ReturnType<typeof buildBase>) => ReturnType<typeof buildBase>): Promise<number> {
  const { count: n } = await apply(buildBase(table));
  return n ?? 0;
}
function buildBase(table: string) {
  return supabase.from(table).select("*", { count: "exact", head: true });
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
      "followers_count, profile_score, about, phone, owner_email, website, category, office_photos, year_established, employee_count, social, reviews_count"
    )
    .eq("id", vendorId)
    .maybeSingle();

  const profileScore = calculateProfileScore({
    about: vp?.about ?? null,
    phone: vp?.phone ?? null,
    ownerEmail: vp?.owner_email ?? null,
    website: vp?.website ?? null,
    category: vp?.category ?? null,
    officePhotos: vp?.office_photos ?? null,
    yearEstablished: vp?.year_established ?? null,
    employeeCount: vp?.employee_count ?? null,
    social: (vp?.social as Record<string, string[]> | null) ?? null,
    reviewsCount: vp?.reviews_count ?? 0,
    productsTotal,
    productsLive,
    quotesSent,
  });

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
  };
}

export function useVendorDashboard(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_dashboard", vendorId],
    queryFn: () => fetchVendorDashboard(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// Shown when there's no vendor row yet (demo / buyer-only sessions).
export const DEFAULT_PROFILE_SCORE = 45;

// Single source of truth for the "Business Profile Score" — used by both the
// dashboard card (BusinessProfileScore) and the /business-profile-score detail
// page, so the two can never show different numbers.
export function useProfileScore(): number {
  const { user } = useAuth();
  const { data } = useVendorDashboard(user?.id);
  return data?.profileScore ?? DEFAULT_PROFILE_SCORE;
}
