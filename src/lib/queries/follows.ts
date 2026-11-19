import { priceText } from "@/lib/currency";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { trustSealFromParts } from "@/lib/plan";
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

interface RawFollowedRow {
  vendor_id: string; brand_name: string | null; city: string | null; logo_url: string | null;
  followers_count: number; live_count: number; is_verified: boolean; plan_id: string | null;
  plan_expires_at: string | null; ad_verified_until: string | null; hidden: boolean;
}

/**
 * The sellers this buyer follows, hidden ones included (`isHidden`), each with its live listing count and the same
 * Trusted Seal every card shows (`trustSealFromParts`).
 *
 * One call, my_followed_brands() (2026-11-19, review M-26/M-09/M-08). It downloaded every live listing of every
 * followed seller to count them (PostgREST stops at 1,000), and the seal was `is_verified` alone.
 */
async function fetchBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.rpc("my_followed_brands");
  if (error) throw error;
  return ((data ?? []) as unknown as RawFollowedRow[]).map((r) => ({
    ...toBrand({ id: r.vendor_id, brand_name: r.brand_name, city: r.city, is_verified: r.is_verified,
      followers_count: r.followers_count, logo_url: r.logo_url },
    { items: r.live_count, isFollowing: true, topProducts: [] }),
    verified: trustSealFromParts(r.is_verified, r.plan_expires_at, r.ad_verified_until),
    isHidden: r.hidden,
  }));
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
  /** Followed sellers that aren't hidden (signed out: the local list). */
  brands: Brand[];
  /** Every followed seller, hidden ones too (Following › View All). */
  allBrands: Brand[];
  signedIn: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Each resolves true once the database said yes; a refusal is said in a toast. `name` adds a success toast. */
  follow: (vendorId: string, name?: string) => Promise<boolean>;
  unfollow: (vendorId: string, name?: string) => Promise<boolean>;
  hide: (vendorId: string, name?: string) => Promise<boolean>;
  unhide: (vendorId: string, name?: string) => Promise<boolean>;
}

export function useFollowing(): UseFollowingResult {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const localBrands = useBrands();

  const signedIn = Boolean(user);
  const key = ["follows", user?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: fetchBrands,
    enabled: signedIn,
  });

  const allBrands = signedIn ? (query.data ?? []) : localBrands;
  const brands = allBrands.filter((b) => !b.isHidden);

  const follow = useCallback(
    async (vendorId: string, name?: string) => {
      // Signed out there is nowhere real to put a follow (the local store can't insert one), so say so.
      if (!signedIn) {
        toast.info("Sign in to follow brands", {
          description: "Following is saved to your account.",
        });
        return false;
      }
      // The store and product pages show Follow to everyone, the seller looking at their own store included.
      if (vendorId === user!.id) {
        toast.info("This is your own business", { description: "Buyers follow it; you can't follow yourself." });
        return false;
      }
      const { error } = await supabase.from("follows").insert({ follower_id: user!.id, vendor_id: vendorId });
      // Already following (a second tab, a double tap) is what was asked for; anything else is said.
      if (error && error.code !== "23505") {
        toast.error("Couldn't follow this brand", { description: "Please try again." });
        return false;
      }
      // The count on the brand comes back from the database, which keeps it (follows_count_sync).
      await qc.invalidateQueries({ queryKey: ["follows", user!.id] });
      if (name) toast.success(`Following ${name}`);
      return true;
    },
    [signedIn, user, qc],
  );

  const unfollow = useCallback(
    async (vendorId: string, name?: string) => {
      if (!signedIn) { unfollowLocal(vendorId); return true; }
      const { error } = await supabase.from("follows").delete().eq("follower_id", user!.id).eq("vendor_id", vendorId);
      if (error) {
        toast.error("Couldn't unfollow this brand", { description: "Please try again." });
        return false;
      }
      await qc.invalidateQueries({ queryKey: ["follows", user!.id] });
      if (name) toast(`Unfollowed ${name}`);
      return true;
    },
    [signedIn, user, qc],
  );

  // Hide is a saved mute (Mitra, 2026-11-19, review M-08): still followed, out of the Following feed until unhidden.
  const setHidden = useCallback(
    async (vendorId: string, hidden: boolean, name?: string) => {
      if (!signedIn) { if (hidden) hideLocal(vendorId); return true; }
      const qk = ["follows", user!.id];
      const before = qc.getQueryData<Brand[]>(qk);
      qc.setQueryData<Brand[]>(qk, (rows) => rows?.map((b) => (b.id === vendorId ? { ...b, isHidden: hidden } : b)));
      const { error } = await supabase.from("follows")
        .update({ hidden_at: hidden ? new Date().toISOString() : null })
        .eq("follower_id", user!.id).eq("vendor_id", vendorId);
      if (error) {
        qc.setQueryData(qk, before);
        toast.error(hidden ? "Couldn't hide this brand" : "Couldn't show this brand again", { description: "Please try again." });
        return false;
      }
      if (name) toast(hidden ? `Hid ${name} from your Following feed` : `${name} is back in your Following feed`);
      return true;
    },
    [signedIn, user, qc],
  );
  const hide = useCallback((id: string, name?: string) => setHidden(id, true, name), [setHidden]);
  const unhide = useCallback((id: string, name?: string) => setHidden(id, false, name), [setHidden]);

  return {
    brands,
    allBrands,
    signedIn,
    isLoading: signedIn ? query.isPending : authLoading,
    isError: signedIn && query.isError,
    refetch: () => { void query.refetch(); },
    follow,
    unfollow,
    hide,
    unhide,
  };
}
