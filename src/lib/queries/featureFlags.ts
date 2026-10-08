import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// Feature switches (subscriptions P0, 2026-10-08).
//
// public.feature_flags decides whether a new feature is on, for everyone or for a
// listed set of accounts while it is tested in production. The app reads every
// switch for the signed-in account in one call (my_feature_flags); the database
// and the edge functions check the same switch themselves, so hiding a button here
// is only the courtesy, never the control.
//
// A key here is created by the migration that ships the code reading it.
// ─────────────────────────────────────────────────────────────

export type FeatureKey = "subscription_checkout" | "subscription_lifecycle";

async function fetchMyFeatureFlags(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.rpc("my_feature_flags");
  if (error) {
    // Before the P0 migration the function doesn't exist: every switch reads off.
    if (error.code === "PGRST202") return {};
    throw error;
  }
  return Object.fromEntries((data ?? []).map((row) => [row.key, Boolean(row.enabled)]));
}

export function useFeatureFlags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["feature_flags", user?.id],
    queryFn: fetchMyFeatureFlags,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
}

/** Whether a switch is on for the signed-in account; undefined while it loads. */
export function useFeatureFlag(key: FeatureKey): boolean | undefined {
  const { data } = useFeatureFlags();
  return data === undefined ? undefined : Boolean(data[key]);
}
