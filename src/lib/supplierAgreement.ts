// ─────────────────────────────────────────────────────────────
// The supplier agreement a vendor signs on the last step of onboarding.
//
// ONE constant, referenced everywhere, because `vendor_contracts.signed_at`
// only means something alongside WHICH wording was signed. Change the copy and
// you must bump the version in the same commit — otherwise two vendors who
// agreed to materially different text are indistinguishable in the record.
//
// ⚠️ NOT LEGALLY REVIEWED. The text below is the copy that has been rendered on
// the contract step since it was built; storing it is an engineering task,
// approving it is not. It needs sign-off before real vendors are held to it.
// ─────────────────────────────────────────────────────────────

export const SUPPLIER_AGREEMENT_VERSION = "2026-09-v1";

export const SUPPLIER_AGREEMENT_CLAUSES: string[] = [
  "By signing below, you agree to all terms of the Cosora Supplier Agreement, including product authenticity, fair trade, on-time fulfillment, accurate listings, and Cosora's commission and payment terms.",
  "You represent that all submitted information is accurate and that you have the legal right to sell the listed products.",
  "Cosora reserves the right to review, suspend, or terminate seller accounts that violate these terms. Disputes shall be resolved per the governing law specified in the full agreement.",
  "Continued use of the platform constitutes acceptance of any updated terms communicated via email or in-app notice.",
];
