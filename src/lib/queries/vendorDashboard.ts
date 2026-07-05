import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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
    .select("followers_count, profile_score")
    .eq("id", vendorId)
    .maybeSingle();

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
    profileScore: vp?.profile_score ?? 0,
  };
}

export function useVendorDashboard(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_dashboard", vendorId],
    queryFn: () => fetchVendorDashboard(vendorId as string),
    enabled: Boolean(vendorId),
  });
}
