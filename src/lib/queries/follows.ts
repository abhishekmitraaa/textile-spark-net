import { priceText } from "@/lib/currency";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  useBrands,
  unfollowBrand as unfollowLocal,
  hideBrand as hideLocal,
  type Brand,
} from "@/lib/followingStore";

// ─────────────────────────────────────────────────────────────
// Following data access.
//
// Brands are the real vendors (`vendor_profiles`); the follow relationship
// lives in `follows` (buyer → vendor). Mapped into the existing `Brand` shape
// so the Following UI is unchanged. When signed out we fall back to the local
// seeded store, mirroring the settings-pages pattern.
// ─────────────────────────────────────────────────────────────

function fmtFollowers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

interface RawVendorRow {
  id: string;
  brand_name: string | null;
  city: string | null;
  is_verified: boolean;
  followers_count: number;
  logo_url: string | null;
}

/** Ids in groups small enough for a GET URL (claude.md: never put a long id list in one). */
function chunks<T>(xs: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function toBrand(v: RawVendorRow, extra: Pick<Brand, "items" | "isFollowing" | "topProducts">): Brand {
  return {
    id: v.id,
    name: v.brand_name ?? "Vendor",
    handle: v.city ?? "India",
    // The seller's own logo, or "" (BrandAvatar shows their initials). Never a stock picture.
    logo: v.logo_url ?? "",
    location: v.city ?? "India",
    followers: fmtFollowers(v.followers_count),
    verified: v.is_verified,
    isHidden: false,
    ...extra,
  };
}

/**
 * The sellers this buyer follows, with how many live listings each has.
 *
 * Only those (2026-10-14). This used to download EVERY seller and EVERY live listing and filter in
 * the browser; PostgREST stops at 1,000 rows, so past that a followed seller silently dropped out of
 * "Your Followings" and the Follow buttons. Every reader of useFollowing() only asks "do I follow
 * this seller?", so the followed rows are all it needs. Suggestions are new_brand_suggestions().
 */
async function fetchBrands(userId: string): Promise<Brand[]> {
  const { data: follows, error } = await supabase.from("follows").select("vendor_id").eq("follower_id", userId);
  if (error) throw error;
  const ids = [...new Set((follows ?? []).map((f) => f.vendor_id))].filter((id) => id !== userId);
  if (ids.length === 0) return [];

  const vendors: RawVendorRow[] = [];
  const live = new Map<string, number>();
  await Promise.all(chunks(ids).map(async (group) => {
    const [v, p] = await Promise.all([
      supabase.from("vendor_profiles").select("id, brand_name, city, is_verified, followers_count, logo_url").in("id", group),
      supabase.from("products").select("vendor_id").eq("status", "live").in("vendor_id", group),
    ]);
    if (v.error) throw v.error;
    if (p.error) throw p.error;
    vendors.push(...((v.data ?? []) as RawVendorRow[]));
    for (const r of p.data ?? []) live.set(r.vendor_id, (live.get(r.vendor_id) ?? 0) + 1);
  }));

  return vendors.map((v) => toBrand(v, { items: live.get(v.id) ?? 0, isFollowing: true, topProducts: [] }));
}

interface RawSuggestion extends RawVendorRow {
  vendor_id: string;
  live_count: number;
  top_products: { id: string; name: string; price_value: number | null; currency: string; image: string }[];
}

/**
 * "Looking for New Brands?" (2026-10-14): sellers with live listings, chosen by the database
 * (new_brand_suggestions(), migration 20261014090100), each with its two most enquired-about
 * listings and their pictures. Signed-out visitors get them too. Not refetched when the buyer
 * follows one, so the slide stays and its button turns to "Following".
 */
export function useNewBrandSuggestions(limit = 12) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["new-brand-suggestions", user?.id ?? "anon", limit],
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await supabase.rpc("new_brand_suggestions", { p_limit: limit });
      if (error) throw error;
      return ((data ?? []) as unknown as RawSuggestion[]).map((r) =>
        toBrand({ ...r, id: r.vendor_id }, {
          items: r.live_count,
          isFollowing: false,
          topProducts: (r.top_products ?? []).map((p) => ({
            name: p.name,
            price: p.price_value != null ? priceText(p.currency, Number(p.price_value)) : "—",
            image: p.image,
          })),
        }),
      );
    },
    staleTime: 5 * 60_000,
  });
}

export interface UseFollowingResult {
  brands: Brand[];
  isLoading: boolean;
  follow: (vendorId: string) => void;
  unfollow: (vendorId: string) => void;
  hide: (vendorId: string) => void;
}

export function useFollowing(): UseFollowingResult {
  const { user } = useAuth();
  const qc = useQueryClient();
  const localBrands = useBrands();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const signedIn = Boolean(user);
  const query = useQuery({
    queryKey: ["follows", user?.id],
    queryFn: () => fetchBrands(user!.id),
    enabled: signedIn,
  });

  const brands = signedIn ? (query.data ?? []).filter((b) => !hidden.has(b.id)) : localBrands;

  const follow = useCallback(
    async (vendorId: string) => {
      // Signed out there is nowhere real to put a follow. followBrand() patches
      // a brand already in the local list and cannot insert one, so since the
      // seed was removed (Master Prompt 9) calling it here would have left the
      // button looking like it worked while doing nothing at all. Say so
      // instead.
      if (!signedIn) {
        toast.info("Sign in to follow brands", {
          description: "Following is saved to your account.",
        });
        return;
      }
      // The store and product pages show Follow to everyone, the seller looking at their own store included.
      if (vendorId === user!.id) {
        toast.info("This is your own business", { description: "Buyers follow it; you can't follow yourself." });
        return;
      }
      const { error } = await supabase.from("follows").insert({ follower_id: user!.id, vendor_id: vendorId });
      // Already following (a second tab, a double tap) is what was asked for; anything else is said.
      if (error && error.code !== "23505") {
        toast.error("Couldn't follow this brand", { description: "Please try again." });
        return;
      }
      // The count on the brand comes back from the database, which keeps it (follows_count_sync).
      qc.invalidateQueries({ queryKey: ["follows", user!.id] });
    },
    [signedIn, user, qc],
  );

  const unfollow = useCallback(
    async (vendorId: string) => {
      if (!signedIn) return unfollowLocal(vendorId);
      const { error } = await supabase.from("follows").delete().eq("follower_id", user!.id).eq("vendor_id", vendorId);
      if (error) {
        toast.error("Couldn't unfollow this brand", { description: "Please try again." });
        return;
      }
      qc.invalidateQueries({ queryKey: ["follows", user!.id] });
    },
    [signedIn, user, qc],
  );

  const hide = useCallback(
    (vendorId: string) => {
      if (!signedIn) return hideLocal(vendorId);
      setHidden((prev) => new Set(prev).add(vendorId));
    },
    [signedIn],
  );

  return { brands, isLoading: signedIn ? query.isLoading : false, follow, unfollow, hide };
}
