import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Where the signed-in account's seller registration stands (my_seller_registration(), 2026-11-13).
//
//   none        never submitted (or a buyer)
//   pending     an overseas registration waiting for Cosora's approval
//   rejected    staff asked for changes; `reason` says what
//   registered  a registered seller (vendor_profiles.onboarding_complete)
//   exempt      one of Cosora's own demo sellers, treated as registered
//
// `gateOn` is the seller_registration_required switch for this account: while it is on, an unregistered seller
// can't add listings, videos, catalogues, ads or quotes (the database refuses; the app explains).
// ─────────────────────────────────────────────────────────────

export type SellerRegistrationStatus = "none" | "pending" | "rejected" | "registered" | "exempt";

export interface SellerRegistration {
  status: SellerRegistrationStatus;
  reason: string | null;
  contractSigned: boolean;
  countryCode: string | null;
  gateOn: boolean;
  latestSubmission: string | null;
}

export async function fetchMySellerRegistration(): Promise<SellerRegistration> {
  const { data, error } = await supabase.rpc("my_seller_registration");
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  const status = String(r.status ?? "none") as SellerRegistrationStatus;
  return {
    status: ["none", "pending", "rejected", "registered", "exempt"].includes(status) ? status : "none",
    reason: typeof r.reason === "string" ? r.reason : null,
    contractSigned: r.contract_signed === true,
    countryCode: typeof r.country_code === "string" ? r.country_code : null,
    gateOn: r.gate_on === true,
    latestSubmission: typeof r.latest_submission === "string" ? r.latest_submission : null,
  };
}

/** The database's seller_registered(): the switch is off, or exempt, or registered with a signed agreement. */
export function canPublish(r: SellerRegistration | undefined): boolean {
  if (!r) return false;
  return !r.gateOn || r.status === "exempt" || (r.status === "registered" && r.contractSigned);
}

export function useSellerRegistration(accountId: string | undefined) {
  return useQuery({
    queryKey: ["seller_registration", accountId],
    queryFn: fetchMySellerRegistration,
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
}
