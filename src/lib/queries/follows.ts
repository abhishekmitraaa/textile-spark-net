import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { img } from "@/lib/listingProducts";
import {
  useBrands,
  followBrand as followLocal,
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
}
interface RawProd {
  id: string;
  vendor_id: string;
  name: string;
  price_value: number | null;
  currency: string;
  product_images: { url: string; position: number }[] | null;
}

async function fetchBrands(userId: string): Promise<Brand[]> {
  const [{ data: vendors }, { data: follows }, { data: prods }] = await Promise.all([
    supabase.from("vendor_profiles").select("id, brand_name, city, is_verified, followers_count"),
    supabase.from("follows").select("vendor_id").eq("follower_id", userId),
    supabase
      .from("products")
      .select("id, vendor_id, name, price_value, currency, product_images ( url, position )")
      .eq("status", "live"),
  ]);

  const followed = new Set((follows ?? []).map((f) => f.vendor_id));
  const byVendor = new Map<string, RawProd[]>();
  for (const p of (prods ?? []) as unknown as RawProd[]) {
    const arr = byVendor.get(p.vendor_id) ?? [];
    arr.push(p);
    byVendor.set(p.vendor_id, arr);
  }

  return (vendors ?? []).map((v: RawVendorRow) => {
    const vp = byVendor.get(v.id) ?? [];
    const topProducts = vp.slice(0, 2).map((p) => {
      const im = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url;
      return {
        name: p.name,
        price: p.price_value != null ? `${p.currency}${Math.round(Number(p.price_value))}` : "—",
        image: im ?? img(p.id, 300, 380),
      };
    });
    return {
      id: v.id,
      name: v.brand_name ?? "Vendor",
      handle: v.city ?? "India",
      logo: img(`brand-${v.id}`, 96, 96),
      location: v.city ?? "India",
      followers: fmtFollowers(v.followers_count),
      items: vp.length,
      verified: v.is_verified,
      isFollowing: followed.has(v.id),
      isHidden: false,
      topProducts,
    } satisfies Brand;
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
      if (!signedIn) return followLocal(vendorId);
      await supabase.from("follows").insert({ follower_id: user!.id, vendor_id: vendorId });
      qc.invalidateQueries({ queryKey: ["follows", user!.id] });
    },
    [signedIn, user, qc],
  );

  const unfollow = useCallback(
    async (vendorId: string) => {
      if (!signedIn) return unfollowLocal(vendorId);
      await supabase.from("follows").delete().eq("follower_id", user!.id).eq("vendor_id", vendorId);
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
