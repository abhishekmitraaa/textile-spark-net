import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { openRazorpayCheckout } from "@/lib/queries/payments";
import type { Plan, PlanId, VendorPlan } from "@/lib/plan";

// ─────────────────────────────────────────────────────────────
// Subscription data access + Razorpay checkout for vendor plans.
//
// Reuses the exact ad-purchase pattern: subscription-create-order computes the
// amount server-side; if the RAZORPAY_* secrets aren't set it returns
// {configured:false} and we fall back to a simulated activation
// (subscription-verify-payment demo mode) so the whole flow is testable without
// live keys. See supabase/functions/subscription-*.
// ─────────────────────────────────────────────────────────────

// ── Plan catalogue (all five tiers) ──
async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Plan[];
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ["subscription_plans"],
    queryFn: fetchPlans,
    staleTime: 10 * 60 * 1000, // catalogue rarely changes
  });
}

// ── The current vendor's effective plan + limits + live usage ──
export async function fetchVendorPlan(vendorId: string): Promise<VendorPlan | null> {
  const { data, error } = await supabase.rpc("get_vendor_plan", { v: vendorId });
  if (error) throw error;
  return (data as unknown as VendorPlan) ?? null;
}

export function useVendorPlan(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_plan", vendorId],
    queryFn: () => fetchVendorPlan(vendorId as string),
    enabled: Boolean(vendorId),
    staleTime: 60 * 1000,
  });
}

// ── Invoices (billing history) ──
export interface SubscriptionInvoice {
  id: string;
  vendorId: string;
  planId: string | null;
  amount: number;
  currency: string;
  gstAmount: number | null;
  gstNumber: string | null;
  tdsAmount: number | null;
  status: "paid" | "pending" | "failed" | "refunded";
  invoiceNumber: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  createdAt: string;
}

interface RawInvoice {
  id: string; vendor_id: string; plan_id: string | null; amount: number; currency: string;
  gst_amount: number | null; gst_number: string | null; tds_amount: number | null;
  status: SubscriptionInvoice["status"]; invoice_number: string | null;
  razorpay_payment_id: string | null; razorpay_order_id: string | null;
  billing_period_start: string | null; billing_period_end: string | null; created_at: string;
}

function mapInvoice(r: RawInvoice): SubscriptionInvoice {
  return {
    id: r.id, vendorId: r.vendor_id, planId: r.plan_id, amount: Number(r.amount), currency: r.currency,
    gstAmount: r.gst_amount != null ? Number(r.gst_amount) : null,
    gstNumber: r.gst_number, tdsAmount: r.tds_amount != null ? Number(r.tds_amount) : null,
    status: r.status, invoiceNumber: r.invoice_number,
    razorpayPaymentId: r.razorpay_payment_id, razorpayOrderId: r.razorpay_order_id,
    billingPeriodStart: r.billing_period_start, billingPeriodEnd: r.billing_period_end,
    createdAt: r.created_at,
  };
}

async function fetchInvoices(vendorId: string): Promise<SubscriptionInvoice[]> {
  const { data, error } = await supabase
    .from("subscription_invoices")
    .select("id, vendor_id, plan_id, amount, currency, gst_amount, gst_number, tds_amount, status, invoice_number, razorpay_payment_id, razorpay_order_id, billing_period_start, billing_period_end, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawInvoice[]).map(mapInvoice);
}

export function useVendorInvoices(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["subscription_invoices", vendorId],
    queryFn: () => fetchInvoices(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export async function fetchInvoiceById(id: string): Promise<SubscriptionInvoice | null> {
  const { data, error } = await supabase
    .from("subscription_invoices")
    .select("id, vendor_id, plan_id, amount, currency, gst_amount, gst_number, tds_amount, status, invoice_number, razorpay_payment_id, razorpay_order_id, billing_period_start, billing_period_end, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInvoice(data as RawInvoice) : null;
}

// ── Checkout ──
export type BillingCycle = "monthly" | "yearly";

interface CreateOrderResult {
  configured: boolean;
  orderId?: string;
  keyId?: string;
  amount?: number; // paise (base + GST)
  currency?: string;
  base?: number;
  gst?: number;
  error?: string;
}

async function createSubscriptionOrder(
  planId: PlanId, billingCycle: BillingCycle, gstNumber?: string,
): Promise<CreateOrderResult> {
  const { data, error } = await supabase.functions.invoke("subscription-create-order", {
    body: { planId, billingCycle, gstNumber },
  });
  if (error) throw error;
  if (!data) return { configured: false };
  if (data.error === "invite_only") return { configured: false, error: "invite_only" };
  if (data.error === "not_configured" || !data.configured) return { configured: false, error: data.error };
  if (data.error) throw new Error(String(data.detail || data.error));
  return {
    configured: true, orderId: data.orderId, keyId: data.keyId,
    amount: data.amount, currency: data.currency, base: data.base, gst: data.gst,
  };
}

async function verifySubscriptionPayment(input: {
  orderId: string; paymentId: string; signature: string;
}): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("subscription-verify-payment", {
    body: { orderId: input.orderId, paymentId: input.paymentId, signature: input.signature },
  });
  if (error) throw error;
  return data ?? { ok: false, error: "no_response" };
}

// Demo (no gateway configured): activate the subscription server-side from the
// plan + cycle. The server owns the write and recomputes the amount from the
// plan, so a client can't self-grant a plan for the wrong price.
async function activateDemoSubscription(
  planId: PlanId, billingCycle: BillingCycle, gstNumber?: string,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("subscription-verify-payment", {
    body: { demo: true, planId, billingCycle, gstNumber },
  });
  if (error) throw error;
  return data ?? { ok: false, error: "no_response" };
}

export interface PurchaseResult {
  ok: boolean;
  demo?: boolean;
  planId?: string;
  error?: string;
}

// One call the UI uses for buy/upgrade/renew: create the order; if Razorpay is
// configured, open Checkout and verify; otherwise simulate (demo) activation.
export async function purchaseSubscription(opts: {
  planId: PlanId;
  billingCycle: BillingCycle;
  gstNumber?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  planName?: string;
}): Promise<PurchaseResult> {
  const order = await createSubscriptionOrder(opts.planId, opts.billingCycle, opts.gstNumber);

  if (!order.configured) {
    if (order.error === "invite_only") return { ok: false, error: "invite_only" };
    // Gateway not wired → simulated activation (same fallback as the ad flow).
    const res = await activateDemoSubscription(opts.planId, opts.billingCycle, opts.gstNumber);
    return { ok: Boolean(res.ok), demo: true, planId: res.planId, error: res.error };
  }

  const rp = await openRazorpayCheckout({
    keyId: order.keyId!, orderId: order.orderId!, amount: order.amount,
    name: "Cosora",
    description: `${opts.planName ?? opts.planId} · ${opts.billingCycle}`,
    prefill: opts.prefill,
  });
  const verified = await verifySubscriptionPayment({
    orderId: rp.razorpay_order_id, paymentId: rp.razorpay_payment_id, signature: rp.razorpay_signature,
  });
  return { ok: Boolean(verified.ok), planId: verified.planId, error: verified.error };
}
