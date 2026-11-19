import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { trustSealFromParts } from "@/lib/plan";

// ─────────────────────────────────────────────────────────────
// Saved sellers (Mitra, 2026-11-19, review M-16: "Build saved sellers"). The bookmark on a seller's page used to
// change colour and save nothing. A saved seller is a row in `saved_vendors` (migration 20261119100000), the buyer's
// own; it is apart from Follow (which counts as the seller's follower and fills the Following feed). Listed in
// My Saves › Sellers.
// ─────────────────────────────────────────────────────────────

export interface SavedVendor {
  id: string;
  name: string;
  city: string;
  logo: string;
  verified: boolean;
  savedAt: string;
}

interface Row {
  vendor_id: string;
  created_at: string;
  vendor_profiles: {
    brand_name: string | null; city: string | null; logo_url: string | null; is_verified: boolean | null;
    plan_expires_at: string | null; ad_verified_until: string | null;
  } | null;
}

async function fetchSavedVendors(userId: string): Promise<SavedVendor[]> {
  const { data, error } = await supabase
    .from("saved_vendors")
    .select("vendor_id, created_at, vendor_profiles(brand_name, city, logo_url, is_verified, plan_expires_at, ad_verified_until)")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.vendor_profiles)
    .map((r) => ({
      id: r.vendor_id,
      name: r.vendor_profiles!.brand_name ?? "Seller",
      city: r.vendor_profiles!.city ?? "",
      logo: r.vendor_profiles!.logo_url ?? "",
      verified: trustSealFromParts(r.vendor_profiles!.is_verified, r.vendor_profiles!.plan_expires_at, r.vendor_profiles!.ad_verified_until),
      savedAt: r.created_at,
    }));
}

export function useSavedVendors() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["saved-vendors", user?.id],
    queryFn: () => fetchSavedVendors(user!.id),
    enabled: Boolean(user),
  });
  return {
    vendors: q.data ?? [],
    signedIn: Boolean(user),
    isLoading: user ? q.isPending : loading,
    isError: Boolean(user) && q.isError,
    refetch: () => { void q.refetch(); },
  };
}

/** Save or unsave a seller. Resolves true once the database said yes; a refusal is said. */
export function useToggleSavedVendor() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(
    async (vendorId: string, save: boolean, name?: string): Promise<boolean> => {
      if (!user) {
        toast.info("Sign in to save sellers", { description: "Saved sellers are kept on your account." });
        return false;
      }
      if (vendorId === user.id) {
        toast.info("This is your own business");
        return false;
      }
      const { error } = save
        ? await supabase.from("saved_vendors").insert({ buyer_id: user.id, vendor_id: vendorId })
        : await supabase.from("saved_vendors").delete().eq("buyer_id", user.id).eq("vendor_id", vendorId);
      // Already saved (another tab, a double tap) is what was asked for.
      if (error && !(save && error.code === "23505")) {
        toast.error(save ? "Couldn't save this seller" : "Couldn't remove this seller", { description: "Please try again." });
        return false;
      }
      await qc.invalidateQueries({ queryKey: ["saved-vendors", user.id] });
      if (save) toast.success(name ? `Saved ${name} to My Saves` : "Saved to My Saves");
      else toast.success(name ? `Removed ${name} from My Saves` : "Removed from My Saves");
      return true;
    },
    [user, qc],
  );
}
