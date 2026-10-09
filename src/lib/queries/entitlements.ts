import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// What a vendor's plan gives them (subscriptions P0's vendor_entitlements(), read by
// the app since P6).
//
// One call answers "is this page theirs": the plan in force (the grace days count) and a
// yes or no per feature, each already combined with its feature switch. Pages that belong
// to a plan are wrapped in <TierGate> and hidden from the sidebar otherwise. This is the
// courtesy: the data behind each page is refused by the database when it isn't theirs.
// ─────────────────────────────────────────────────────────────

/** A feature a page can belong to. A key here is one the database returns as a yes or no. */
export type EntitlementFeature =
  | "lead_alerts" | "crm" | "account_manager" | "international" | "realtime_alerts" | "overseas_leads"
  | "crm_pipeline" | "crm_analytics";

export interface VendorEntitlements {
  planId: string;
  planName: string;
  /** active, grace or free. */
  status: string;
  paid: boolean;
  features: Partial<Record<EntitlementFeature, boolean>> & {
    lead_alert_channels?: string[];
    /** Overseas requirements (P7): vip sees them first, gold after VIP's head start, none not at all. */
    overseas_tier?: "vip" | "gold" | "none";
    /** The CRM (P8), where the switch lists the vendor: pipeline (Silver), analytics (Gold), success (VIP). */
    crm_level?: "none" | "pipeline" | "analytics" | "success";
  };
}

interface RawEntitlements {
  plan_id?: string; plan_name?: string; status?: string; paid?: boolean;
  features?: VendorEntitlements["features"];
}

async function fetchEntitlements(): Promise<VendorEntitlements | null> {
  const { data, error } = await supabase.rpc("vendor_entitlements");
  if (error) {
    // Before the P0 migration the function doesn't exist: nothing is gated in.
    if (error.code === "PGRST202") return null;
    throw error;
  }
  const r = (data ?? {}) as unknown as RawEntitlements;
  return {
    planId: r.plan_id ?? "free", planName: r.plan_name ?? "Free", status: r.status ?? "free",
    paid: Boolean(r.paid), features: r.features ?? {},
  };
}

export function useVendorEntitlements(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_entitlements", vendorId],
    queryFn: fetchEntitlements,
    enabled: Boolean(vendorId),
    staleTime: 60 * 1000,
  });
}
