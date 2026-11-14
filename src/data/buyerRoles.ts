// What best describes a buyer: the Sub-role step of sign-up and "What best describes you" on Edit Profile
// (buyer sign-up audit 2026-11-13, item 1). Stored as `buyer_profiles.buyer_role`; the database's check constraint
// (migration 20261114100000) allows exactly these ids, so change both together. Not `business_type`: that is the
// trade-buyer word ranking reads (admin.viewer_trade_buyer()).
export const BUYER_ROLES = [
  { id: "brand_owner", label: "Brand Owner / Founder" },
  { id: "sourcing_manager", label: "Sourcing / Purchase Manager" },
  { id: "merchandiser", label: "Merchandiser / Production Coordinator" },
  { id: "designer", label: "Designer / Design Head" },
  { id: "buying_house", label: "Buying House / Buying Agent" },
  { id: "retail_chain", label: "Retail Chain / Institutional Buyer" },
] as const;

export type BuyerRoleId = (typeof BUYER_ROLES)[number]["id"];

export function isBuyerRoleId(v: unknown): v is BuyerRoleId {
  return BUYER_ROLES.some((r) => r.id === v);
}
