import { supabase } from "@/lib/supabase";
import type { AdSpec } from "@/lib/queries/payments";
import type { BillingCycle } from "@/lib/queries/subscriptions";

// ─────────────────────────────────────────────────────────────
// Discount codes at checkout (admin completion Phase 10, 2026-09-29).
//
// The browser sends a code and never a discount or an amount. `discount-quote`
// prices the order exactly as the create-order functions do and asks the
// database; the numbers it returns are the ones the checkout shows. The order
// itself is priced again, server-side, when it is created, and the code's use is
// held for it there (supabase/functions/_shared/discounts.ts).
// ─────────────────────────────────────────────────────────────

export type DiscountTarget = "vendor_plan" | "ad_purchase" | "certificate";

/** What the code takes off a plan, and the price it leaves (whole rupees). */
export interface PlanQuote {
  code: string;
  appliesTo: DiscountTarget;
  list: number;
  discount: number;
  /** The plan price after the discount: what GST is charged on. */
  base: number;
  gst: number;
  total: number;
}

/** What the code takes off an ad order (whole rupees; ads carry no GST line). */
export interface AdQuote {
  code: string;
  appliesTo: DiscountTarget;
  gross: number;
  discount: number;
  total: number;
}

/** The quote, or the sentence saying why there isn't one. */
export interface QuoteResult<T> {
  quote: T | null;
  message: string | null;
}

/**
 * What to tell a vendor when a code doesn't apply, from the reason the server
 * gave (_shared/discounts.ts, DiscountReason).
 */
export function discountRefusal(reason: string | null | undefined, appliesTo?: string | null): string {
  switch (reason) {
    case "invalid": return "That code isn't valid.";
    case "inactive": return "That code isn't available any more.";
    case "not_started": return "That code isn't active yet.";
    case "expired": return "That code has expired.";
    case "exhausted": return "That code has been fully used.";
    case "already_used": return "You've already used this code.";
    case "wrong_target":
      if (appliesTo === "vendor_plan") return "This code is for subscription plans.";
      if (appliesTo === "certificate") return "This code is for the Cosora Verified Certificate.";
      return "This code is for ad campaigns.";
    case "wrong_plan": return "This code doesn't apply to this plan.";
    case "not_applicable":
      if (appliesTo === "certificate") return "This code is for the Cosora Verified Certificate, which isn't in this order.";
      return "This code doesn't apply to anything in this order.";
    case "no_discount": return "This code takes nothing off this order.";
    case "too_many_attempts": return "Too many codes tried. Try again in an hour.";
    case "not_vendor": return "Only seller accounts can use discount codes.";
    case "changed": return "This code changed just now. Apply it again to see the new price.";
    case "invite_only": return "This plan is invite-only.";
    default: return "Couldn't check that code. Try again.";
  }
}

// Checkout closes itself after this long when a code is applied, inside the 30
// minutes a use is held for an order (admin.discount_redemptions.expires_at).
export const DISCOUNT_CHECKOUT_TIMEOUT_S = 25 * 60;

async function invokeQuote(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const { data, error } = await supabase.functions.invoke("discount-quote", { body });
  if (error || !data) return { ok: false, data: null };
  return { ok: Boolean(data.ok), data };
}

export async function quotePlanDiscount(planId: string, billingCycle: BillingCycle, code: string): Promise<QuoteResult<PlanQuote>> {
  const { ok, data } = await invokeQuote({ kind: "subscription", planId, billingCycle, code });
  if (!ok || !data) return { quote: null, message: discountRefusal(data?.reason as string, data?.appliesTo as string) };
  return {
    message: null,
    quote: {
      code: String(data.code), appliesTo: data.appliesTo as DiscountTarget,
      list: Number(data.list), discount: Number(data.discount), base: Number(data.base),
      gst: Number(data.gst), total: Number(data.total),
    },
  };
}

export async function quoteAdDiscount(spec: AdSpec, code: string): Promise<QuoteResult<AdQuote>> {
  const { ok, data } = await invokeQuote({ kind: "ad", spec, code });
  if (!ok || !data) return { quote: null, message: discountRefusal(data?.reason as string, data?.appliesTo as string) };
  return {
    message: null,
    quote: {
      code: String(data.code), appliesTo: data.appliesTo as DiscountTarget,
      gross: Number(data.gross), discount: Number(data.discount), total: Number(data.total),
    },
  };
}
