// ─────────────────────────────────────────────────────────────
// Autopay's database calls and the one step several functions share: retiring the
// mandates a new one replaces (subscriptions P3, 2026-10-08).
//
// A vendor has at most one autopay. UPI and e-mandate subscriptions can't be changed at
// Razorpay, so a plan change or a new payment method is a NEW Razorpay subscription; the
// moment it is authenticated, the database lists the vendor's other open mandates
// (autopay_mandate_event → replace) and they are cancelled at Razorpay here. One that
// can't be cancelled opens a billing incident: left alone it could charge the vendor twice.
// ─────────────────────────────────────────────────────────────

import { cancelSubscription, type RazorpayKeys } from "./razorpay.ts";

export type MandateStatus = "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";

export interface MandateEvent {
  known: boolean;
  vendor_id?: string;
  previous?: string;
  status?: string;
  changed?: boolean;
  first_order_ref?: string | null;
  replace?: string[];
}

async function rpc<T>(url: string, key: string, fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) return null;
    const text = await r.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export function mandateEvent(url: string, key: string, subId: string, status: MandateStatus, method?: string | null, chargeAt?: number | null) {
  return rpc<MandateEvent>(url, key, "autopay_mandate_event", {
    p_sub_id: subId, p_status: status, p_method: method ?? null,
    p_charge_at: chargeAt ? new Date(chargeAt * 1000).toISOString() : null,
  });
}

export interface ChargeTarget {
  known: boolean;
  kind?: "already" | "first" | "renewal";
  order_ref?: string;
}

export function chargeTarget(url: string, key: string, subId: string, paymentRef: string, amountPaise: number | null) {
  return rpc<ChargeTarget>(url, key, "autopay_charge", { p_sub_id: subId, p_payment_ref: paymentRef, p_amount_paise: amountPaise });
}

export interface OpenMandate {
  sub_id: string;
  status: string;
  plan_id: string;
  billing_cycle: string;
  amount_paise: number;
}

/** The vendor's autopay that is set up (authenticated, active or retrying), or null. */
export function openMandate(url: string, key: string, vendorId: string) {
  return rpc<OpenMandate>(url, key, "autopay_vendor_open", { p_vendor: vendorId });
}

export function autopayIncident(url: string, key: string, kind: "autopay_cancel_failed" | "autopay_amount_mismatch", subId: string, detail: unknown) {
  return rpc<string>(url, key, "autopay_incident", { p_kind: kind, p_sub_id: subId, p_detail: detail ?? {} });
}

/** Cancel the mandates a new one replaced. Answers how many were cancelled and how many couldn't be. */
export async function retireMandates(url: string, key: string, keys: RazorpayKeys, subIds: string[]): Promise<{ cancelled: number; failed: number }> {
  let cancelled = 0;
  let failed = 0;
  for (const id of subIds) {
    const c = await cancelSubscription(keys, id);
    // Razorpay answers 400 for one it has already cancelled or completed: that is done, not failed.
    if (c.ok || /already|cancelled|completed|not.*(active|authenticated)/i.test(c.error ?? "")) {
      await mandateEvent(url, key, id, "cancelled");
      cancelled++;
    } else {
      await autopayIncident(url, key, "autopay_cancel_failed", id, { status: c.status, error: c.error ?? null });
      failed++;
    }
  }
  return { cancelled, failed };
}
