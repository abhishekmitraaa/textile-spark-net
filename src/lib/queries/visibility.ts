import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { sessionId } from "@/lib/queries/engagement";

// ─────────────────────────────────────────────────────────────
// Featured listings, the VIP spotlight and seal tiers (subscriptions P10, 2026-10-09).
//
// What a plan buys on a category page: Silver a rotating place in the first 10, Gold in the
// first 5 (nearby buyers first), VIP place 1 and the Spotlight rail. The database chooses the
// places (featured_listings, spotlight_listings) and rotates them by day and browsing session;
// the app shows them, tagged, and logs what was seen (log_featured_impressions). The
// `featured_listings` switch is about the VIEWER: featured_listings_on() says whether this
// visitor sees any of it (and the Gold and VIP seals).
// ─────────────────────────────────────────────────────────────

/** Whether featured places, the spotlight and seal tiers are shown to this visitor. */
export function useFeaturedListingsOn() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["featured_listings_on", user?.id ?? "anon"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("featured_listings_on");
      if (error) return false;   // before the P10 migration: nothing extra is shown
      return Boolean(data);
    },
  }).data ?? false;
}

export interface FeaturedPlace {
  productId: string;
  vendorId: string;
  slot: number;
  tier: "spotlight" | "top5" | "top10";
  nearby: boolean;
}

/** The featured places on a category page, in order. Empty when off or there's no category. */
export function useFeaturedListings(categoryId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["featured_listings", categoryId, user?.id ?? "anon"],
    enabled: Boolean(categoryId),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FeaturedPlace[]> => {
      const { data, error } = await supabase.rpc("featured_listings", { p_category: categoryId as string, p_session: sessionId() ?? undefined });
      if (error) return [];
      return ((data ?? []) as unknown as { product_id: string; vendor_id: string; slot: number; tier: FeaturedPlace["tier"]; nearby: boolean }[])
        .map((r) => ({ productId: r.product_id, vendorId: r.vendor_id, slot: r.slot, tier: r.tier, nearby: Boolean(r.nearby) }));
    },
  });
}

/** VIP sellers' products for the Spotlight rail (in a category when given). */
export function useSpotlight(categoryId: string | null | undefined, limit = 8) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["spotlight_listings", categoryId ?? "all", limit, user?.id ?? "anon"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("spotlight_listings", {
        p_category: categoryId ?? undefined, p_session: sessionId() ?? undefined, p_limit: limit,
      });
      if (error) return [];
      return ((data ?? []) as unknown as { product_id: string }[]).map((r) => r.product_id);
    },
  });
}

/** Records what a visitor was shown. Fire and forget: telemetry is never load-bearing. */
export async function logFeaturedImpressions(items: { productId: string; placement: "featured" | "spotlight" }[]): Promise<void> {
  if (!items.length) return;
  try {
    for (let i = 0; i < items.length; i += 20) {
      await supabase.rpc("log_featured_impressions", {
        p_items: items.slice(i, i + 20).map((x) => ({ product_id: x.productId, placement: x.placement })),
        p_session: sessionId() ?? undefined,
      });
    }
  } catch {
    // ignore
  }
}

export interface MyVisibility {
  available: boolean;
  featured: "none" | "top10" | "top5" | "spotlight";
  boost: number;
  days: number;
  categories: { id: string; name: string; products: number }[];
  impressions: { featured: number; spotlight: number; ads: number; byDay: { day: string; featured: number; spotlight: number }[] };
}

export function useMyVisibility(vendorId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ["my_visibility", vendorId, days],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<MyVisibility> => {
      const { data, error } = await supabase.rpc("my_visibility", { p_days: days });
      if (error) throw error;
      const j = data as unknown as {
        available: boolean; featured: MyVisibility["featured"]; boost: number; days: number; categories: MyVisibility["categories"];
        impressions: { featured: number; spotlight: number; ads: number; by_day: MyVisibility["impressions"]["byDay"] };
      };
      return {
        available: j.available, featured: j.featured, boost: Number(j.boost ?? 0), days: j.days, categories: j.categories ?? [],
        impressions: {
          featured: Number(j.impressions?.featured ?? 0), spotlight: Number(j.impressions?.spotlight ?? 0),
          ads: Number(j.impressions?.ads ?? 0), byDay: j.impressions?.by_day ?? [],
        },
      };
    },
  });
}

/** The signed-in buyer's state (Ranking F2), for Gold's "nearby buyers"; null when unknown. */
export function useMyStateCode(): string | null {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_state_code", user?.id],
    enabled: Boolean(user),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.from("buyer_profiles").select("state_code").eq("id", user?.id as string).maybeSingle();
      return (data?.state_code as string | null) ?? null;
    },
  }).data ?? null;
}
