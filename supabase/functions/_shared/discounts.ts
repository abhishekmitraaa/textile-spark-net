// ─────────────────────────────────────────────────────────────
// DISCOUNT CODES ON VENDOR PURCHASES — the payment functions' side (admin
// completion Phase 10, 2026-09-29).
//
// The database decides whether a code applies and what it takes off
// (admin.discount_evaluate, migration 20260929080502_discount_codes). These
// helpers price the order the way the payment functions always have, hand the
// amounts to it, and turn its answer into what gets charged and invoiced. A
// browser sends a code, never a discount or an amount.
//
//   subscription  the code comes off the plan price; GST is charged on the rest
//   ad order      the code comes off its target's lines: the Verified
//                 Certificate for a "certificate" code, every other line for an
//                 "ad_purchase" code. Ads carry no GST line (AdReceiptDetail.tsx).
//
// Whole rupees throughout, like every Cosora price: the database rounds a
// percentage to the rupee, so every amount here stays an integer and Razorpay
// gets rupees × 100.
//
// A code that takes an order to ₹0 has no Razorpay order: its id is
// free_<uuid>, and verify-payment fulfils it only if the stored amount is 0 and
// the redemption confirms.
//
// Imports only the other _shared modules, and no Deno APIs, so Node can load it
// (scripts/discount-flow-check.mjs).
// ─────────────────────────────────────────────────────────────

import { gstOn } from "./gst.ts";
import { orderLineRupees, type AdSpec } from "./adPricing.ts";

export type DiscountTarget = "vendor_plan" | "ad_purchase" | "certificate";

/** Why a code didn't apply. The browser turns these into sentences (src/lib/queries/discounts.ts). */
export type DiscountReason =
  | "invalid" | "inactive" | "not_started" | "expired" | "wrong_target" | "wrong_plan"
  | "not_applicable" | "exhausted" | "already_used" | "no_discount" | "too_many_attempts"
  | "not_vendor" | "changed" | "invite_only" | "unavailable";

/** The database's answer (discount_check / discount_reserve). */
export interface DiscountVerdict {
  ok: boolean;
  reason?: DiscountReason;
  code?: string;
  applies_to?: DiscountTarget;
  kind?: "percent" | "flat";
  value?: number;
  eligible_rupees?: number;
  discount_rupees?: number;
  redemption_id?: string;
}

/** The amounts a code is judged against, priced by the calling function. */
export interface OrderAmounts {
  planId?: string | null;
  planRupees?: number;
  adRupees?: number;
  certificateRupees?: number;
}

/**
 * What the vendor typed, trimmed and upper-cased the way codes are stored; null
 * when there's nothing. Text that can't be a code still goes to the database,
 * which answers "invalid" and counts it towards the guessing limit.
 */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return code ? code.slice(0, 64) : null;
}

/** A subscription's money: the plan price, less the discount, plus GST on what's left. */
export function subscriptionAmounts(listRupees: number, discountRupees = 0) {
  const discount = Math.min(Math.max(0, Math.round(discountRupees)), listRupees);
  const base = listRupees - discount;
  const { gst, total } = gstOn(base);
  return { list: listRupees, discount, base, gst, total, paise: total * 100 };
}

/** An ad order's money: its lines, less the discount. No GST line on ads. */
export function adAmounts(spec: AdSpec, discountRupees = 0) {
  const { certificate, ads, total: gross } = orderLineRupees(spec);
  const discount = Math.min(Math.max(0, Math.round(discountRupees)), gross);
  const total = gross - discount;
  return { certificate, ads, gross, discount, total, paise: total * 100 };
}

async function rpc<T>(url: string, key: string, fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

function amountArgs(a: OrderAmounts) {
  return {
    p_plan_id: a.planId ?? null,
    p_plan_rupees: a.planRupees ?? 0,
    p_ad_rupees: a.adRupees ?? 0,
    p_certificate_rupees: a.certificateRupees ?? 0,
  };
}

/** Would this code apply, and for how much? Holds nothing. */
export async function checkDiscount(
  url: string, key: string, code: string, vendorId: string,
  orderKind: "subscription" | "ad", amounts: OrderAmounts,
): Promise<DiscountVerdict> {
  const v = await rpc<DiscountVerdict>(url, key, "discount_check", {
    p_code: code, p_vendor: vendorId, p_order_kind: orderKind, ...amountArgs(amounts),
  });
  return v ?? { ok: false, reason: "unavailable" };
}

/**
 * Hold one use of the code for this order, under the code's lock. `expectedRupees`
 * is the discount the order was priced with; if the code now gives a different
 * one, the database refuses ("changed") rather than let a vendor be charged a
 * price they weren't shown. Null means there was no earlier price (demo mode).
 */
export async function reserveDiscount(
  url: string, key: string, code: string, vendorId: string,
  orderKind: "subscription" | "ad", orderRef: string, expectedRupees: number | null, amounts: OrderAmounts,
): Promise<DiscountVerdict> {
  const v = await rpc<DiscountVerdict>(url, key, "discount_reserve", {
    p_code: code, p_vendor: vendorId, p_order_kind: orderKind, p_order_ref: orderRef,
    p_expected_rupees: expectedRupees, ...amountArgs(amounts),
  });
  return v ?? { ok: false, reason: "unavailable" };
}

/** The order was paid: the use is the vendor's. Safe to call twice (verify and webhook both do). */
export async function confirmDiscount(url: string, key: string, redemptionId: string, orderRef: string): Promise<boolean> {
  const v = await rpc<{ ok: boolean }>(url, key, "discount_confirm", { p_redemption: redemptionId, p_order_ref: orderRef });
  return Boolean(v?.ok);
}

/** The checkout failed before the vendor could pay: give the use back. Never undoes a confirmation. */
export async function releaseDiscount(url: string, key: string, redemptionId: string, orderRef: string): Promise<boolean> {
  const v = await rpc<{ ok: boolean }>(url, key, "discount_release", { p_redemption: redemptionId, p_order_ref: orderRef });
  return Boolean(v?.ok);
}
