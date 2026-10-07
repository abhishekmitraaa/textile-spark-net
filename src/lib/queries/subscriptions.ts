import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { openRazorpayCheckout } from "@/lib/queries/payments";
import { DISCOUNT_CHECKOUT_TIMEOUT_S } from "@/lib/queries/discounts";
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
  /** The taxable value in rupees, after any discount (admin completion Phase 10). */
  amount: number;
  currency: string;
  gstAmount: number | null;
  /** What a discount code took off the plan price, in rupees; null when none. */
  discountAmount: number | null;
  discountCode: string | null;
  /** An upgrade's credit for the unused part of what was already paid (2026-10-02); null when none. */
  creditAmount: number | null;
  /** new, renewal, upgrade or downgrade (2026-10-02); null on older invoices. */
  changeKind: ChangeKind | null;
  gstNumber: string | null;
  tdsAmount: number | null;
  status: "paid" | "pending" | "failed" | "refunded";
  invoiceNumber: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  createdAt: string;
  // ── Subscriptions P1 (2026-10-08): null on a database without the billing-core migration ──
  /** live or test (Razorpay keys), demo (no gateway), free (a code took it to ₹0). */
  paymentMode: PaymentMode | null;
  /** tax_invoice, receipt (money taken before Cosora's GST details were set, and every invoice before 8 Oct 2026), test, demo. */
  documentType: InvoiceDocumentType | null;
  /** Cosora's billing details as they were when the invoice was issued. */
  supplier: InvoiceSupplier | null;
  /** The vendor's details as they were when the invoice was issued. */
  recipient: InvoiceRecipient | null;
  placeOfSupply: string | null;
  supplyType: "intra" | "inter" | null;
  sacCode: string | null;
  cgstPaise: number | null;
  sgstPaise: number | null;
  igstPaise: number | null;
  /** What was charged, in paise; null on invoices from before 8 Oct 2026 (amount + gstAmount). */
  totalPaise: number | null;
}

export type PaymentMode = "live" | "test" | "demo" | "free";
export type InvoiceDocumentType = "tax_invoice" | "receipt" | "test" | "demo";
export interface InvoiceSupplier {
  legal_name: string | null; trade_name: string | null; address: string | null; city: string | null;
  state_code: string | null; state_name: string | null; gst_state_code: string | null; postal_code: string | null;
  gstin: string | null; pan: string | null; email: string | null; phone: string | null;
}
export interface InvoiceRecipient {
  name: string | null; owner_name: string | null; address: string | null; city: string | null; state: string | null;
  state_code: string | null; gst_state_code: string | null; postal_code: string | null; gstin: string | null; email: string | null;
}

interface RawInvoice {
  id: string; vendor_id: string; plan_id: string | null; amount: number; currency: string;
  gst_amount: number | null; gst_number: string | null; tds_amount: number | null;
  status: SubscriptionInvoice["status"]; invoice_number: string | null;
  razorpay_payment_id: string | null; razorpay_order_id: string | null;
  billing_period_start: string | null; billing_period_end: string | null; created_at: string;
  discount_amount: number | null; discount_code: string | null;
  credit_rupees?: number | null; change_kind?: ChangeKind | null;
  payment_mode?: PaymentMode | null; document_type?: InvoiceDocumentType | null;
  supplier?: InvoiceSupplier | null; recipient?: InvoiceRecipient | null;
  place_of_supply?: string | null; supply_type?: "intra" | "inter" | null; sac_code?: string | null;
  cgst_paise?: number | null; sgst_paise?: number | null; igst_paise?: number | null; total_paise?: number | null;
}

const BASE_INVOICE_COLUMNS =
  "id, vendor_id, plan_id, amount, currency, gst_amount, gst_number, tds_amount, status, invoice_number, razorpay_payment_id, razorpay_order_id, billing_period_start, billing_period_end, created_at, discount_amount, discount_code";
const PLAN_CHANGE_COLUMNS = `${BASE_INVOICE_COLUMNS}, credit_rupees, change_kind`;
const INVOICE_COLUMNS = `${PLAN_CHANGE_COLUMNS}, payment_mode, document_type, supplier, recipient, place_of_supply, supply_type, sac_code, cgst_paise, sgst_paise, igst_paise, total_paise`;

/**
 * Invoices with their newest columns. A database that hasn't had the billing-core
 * migration (2026-10-08) or the plan-change one (2026-10-02) answers 42703, so the read
 * steps back through the older column sets rather than leaving Billing History empty.
 */
async function selectInvoices<T>(run: (columns: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>): Promise<T | null> {
  for (const columns of [INVOICE_COLUMNS, PLAN_CHANGE_COLUMNS]) {
    const r = await run(columns);
    if (r.error?.code === "42703") continue;
    if (r.error) throw r.error;
    return r.data;
  }
  const last = await run(BASE_INVOICE_COLUMNS);
  if (last.error) throw last.error;
  return last.data;
}

function mapInvoice(r: RawInvoice): SubscriptionInvoice {
  return {
    id: r.id, vendorId: r.vendor_id, planId: r.plan_id, amount: Number(r.amount), currency: r.currency,
    gstAmount: r.gst_amount != null ? Number(r.gst_amount) : null,
    discountAmount: r.discount_amount != null ? Number(r.discount_amount) : null,
    discountCode: r.discount_code,
    creditAmount: r.credit_rupees != null ? Number(r.credit_rupees) : null,
    changeKind: r.change_kind ?? null,
    gstNumber: r.gst_number, tdsAmount: r.tds_amount != null ? Number(r.tds_amount) : null,
    status: r.status, invoiceNumber: r.invoice_number,
    razorpayPaymentId: r.razorpay_payment_id, razorpayOrderId: r.razorpay_order_id,
    billingPeriodStart: r.billing_period_start, billingPeriodEnd: r.billing_period_end,
    createdAt: r.created_at,
    paymentMode: r.payment_mode ?? null, documentType: r.document_type ?? null,
    supplier: r.supplier ?? null, recipient: r.recipient ?? null,
    placeOfSupply: r.place_of_supply ?? null, supplyType: r.supply_type ?? null, sacCode: r.sac_code ?? null,
    cgstPaise: r.cgst_paise != null ? Number(r.cgst_paise) : null,
    sgstPaise: r.sgst_paise != null ? Number(r.sgst_paise) : null,
    igstPaise: r.igst_paise != null ? Number(r.igst_paise) : null,
    totalPaise: r.total_paise != null ? Number(r.total_paise) : null,
  };
}

/**
 * A 5-minute download link for an invoice's PDF (subscriptions P1). invoice-render draws
 * it the first time and stores it in the private invoices bucket; the link is signed with
 * the caller's own session, which the bucket's read policy allows for the invoice's vendor
 * (and finance and support staff).
 */
export async function invoicePdfLink(invoiceId: string): Promise<{ url: string; fileName: string }> {
  const { data, error } = await supabase.functions.invoke("invoice-render", { body: { invoiceId } });
  const path = (data as { path?: string } | null)?.path;
  if (error || !path) throw new Error("The PDF couldn't be prepared. Try again in a moment.");
  const fileName = (data as { fileName?: string }).fileName ?? "invoice.pdf";
  const signed = await supabase.storage.from("invoices").createSignedUrl(path, 300, { download: fileName });
  if (signed.error || !signed.data?.signedUrl) throw new Error("The PDF couldn't be prepared. Try again in a moment.");
  return { url: signed.data.signedUrl, fileName };
}

async function fetchInvoices(vendorId: string): Promise<SubscriptionInvoice[]> {
  const data = await selectInvoices((columns) =>
    supabase.from("subscription_invoices").select(columns).eq("vendor_id", vendorId).order("created_at", { ascending: false }),
  );
  return ((data ?? []) as unknown as RawInvoice[]).map(mapInvoice);
}

export function useVendorInvoices(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["subscription_invoices", vendorId],
    queryFn: () => fetchInvoices(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export async function fetchInvoiceById(id: string): Promise<SubscriptionInvoice | null> {
  const data = await selectInvoices((columns) =>
    supabase.from("subscription_invoices").select(columns).eq("id", id).maybeSingle(),
  );
  return data ? mapInvoice(data as unknown as RawInvoice) : null;
}

// ── Plan changes (2026-10-02) ──
// The Subscription FAQ: "you can upgrade your plan at any time and the difference
// will be prorated. Downgrades will take effect from your next billing cycle." The
// database decides which a purchase is and what it costs (admin.subscription_quote);
// the payment functions charge exactly this.
export type ChangeKind = "new" | "renewal" | "upgrade" | "downgrade";

export interface PlanChangePreview {
  ok: boolean;
  /** already_scheduled, invite_only, … when ok is false. */
  reason?: string;
  kind?: ChangeKind;
  planId?: string;
  planName?: string;
  billingCycle?: BillingCycle;
  /** The plan's price for the cycle, before GST. */
  listRupees: number;
  /** The unused part of what's already paid (upgrades only). */
  creditRupees: number;
  /** What is charged before a discount code and GST. */
  chargeRupees: number;
  periodStart: string | null;
  periodEnd: string | null;
  startsNow: boolean;
  /** The plan running now, and when it ends (when one is). */
  currentPlanId: string | null;
  currentPeriodEnd: string | null;
}

interface RawPreview {
  ok: boolean; reason?: string; kind?: ChangeKind; plan_id?: string; plan_name?: string; billing_cycle?: BillingCycle;
  list_rupees?: number; credit_rupees?: number; charge_rupees?: number; period_start?: string; period_end?: string;
  starts_now?: boolean; current_plan_id?: string | null; current_period_end?: string | null;
}

async function fetchPlanChangePreview(planId: string, billingCycle: BillingCycle): Promise<PlanChangePreview> {
  const { data, error } = await supabase.rpc("subscription_change_preview", { p_plan: planId, p_cycle: billingCycle });
  if (error) throw error;
  const r = (data ?? { ok: false }) as unknown as RawPreview;
  return {
    ok: Boolean(r.ok), reason: r.reason, kind: r.kind, planId: r.plan_id, planName: r.plan_name, billingCycle: r.billing_cycle,
    listRupees: Number(r.list_rupees ?? 0), creditRupees: Number(r.credit_rupees ?? 0), chargeRupees: Number(r.charge_rupees ?? 0),
    periodStart: r.period_start ?? null, periodEnd: r.period_end ?? null, startsNow: Boolean(r.starts_now),
    currentPlanId: r.current_plan_id ?? null, currentPeriodEnd: r.current_period_end ?? null,
  };
}

/** What choosing this plan and cycle would cost the signed-in seller now, and when it would start. */
export function usePlanChangePreview(planId: string | null | undefined, billingCycle: BillingCycle) {
  return useQuery({
    queryKey: ["plan_change_preview", planId, billingCycle],
    queryFn: () => fetchPlanChangePreview(planId as string, billingCycle),
    enabled: Boolean(planId),
    staleTime: 30 * 1000,
  });
}

// ── The 7-day money-back guarantee (2026-10-02) ──
// The Subscription FAQ: "We offer a 7-day money-back guarantee for first-time
// subscribers. If you're not satisfied, contact us for a full refund." The seller
// asks here; finance refunds each payment through Razorpay in Cosora-Admin, and the
// plan ends then. Only money that went through Razorpay is offered back.
export type RefundGuaranteeReason =
  | "no_payment" | "no_money_taken" | "window_closed" | "already_refunded" | "requested" | "closed";

export interface RefundGuarantee {
  eligible: boolean;
  reason?: RefundGuaranteeReason;
  /** When the 7 days end. */
  deadline: string | null;
  totalRupees: number;
  requestedAt: string | null;
  closedAt: string | null;
}

interface RawGuarantee {
  eligible: boolean; reason?: RefundGuaranteeReason; deadline?: string; total_rupees?: number;
  requested_at?: string; closed_at?: string | null;
}

function mapGuarantee(r: RawGuarantee | null): RefundGuarantee {
  return {
    eligible: Boolean(r?.eligible), reason: r?.reason, deadline: r?.deadline ?? null,
    totalRupees: Number(r?.total_rupees ?? 0), requestedAt: r?.requested_at ?? null, closedAt: r?.closed_at ?? null,
  };
}

export function useRefundGuarantee(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["refund_guarantee", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<RefundGuarantee | null> => {
      const { data, error } = await supabase.rpc("refund_guarantee_status");
      // Before the 2026-10-02 migration the function doesn't exist: show nothing.
      if (error?.code === "PGRST202") return null;
      if (error) throw error;
      return mapGuarantee(data as unknown as RawGuarantee);
    },
  });
}

/** Ask for the refund. Throws with the reason when the account can't. */
export async function requestRefundGuarantee(reason: string): Promise<RefundGuarantee> {
  const { data, error } = await supabase.rpc("refund_guarantee_request", { p_reason: reason.trim() || undefined });
  if (error) throw error;
  return mapGuarantee(data as unknown as RawGuarantee);
}

// ── Checkout ──
export type BillingCycle = "monthly" | "yearly";

/**
 * Why the payment functions refused to start a checkout (subscriptions P0,
 * 2026-10-08; public.subscription_checkout_gate). Nothing was created for any of them.
 */
export const CHECKOUT_REFUSALS = ["payments_not_open", "not_vendor", "suspended", "deleted", "unavailable"] as const;
export type CheckoutRefusal = (typeof CHECKOUT_REFUSALS)[number];
export function isCheckoutRefusal(error: string | undefined): error is CheckoutRefusal {
  return (CHECKOUT_REFUSALS as readonly string[]).includes(error ?? "");
}

interface CreateOrderResult {
  configured: boolean;
  orderId?: string;
  keyId?: string;
  amount?: number; // paise (base + GST)
  currency?: string;
  base?: number;
  gst?: number;
  /** A code took the total to ₹0: there is no Razorpay order to pay. */
  free?: boolean;
  error?: string;
  /** Set when the discount code was refused (DiscountReason). Nothing was created. */
  discountReason?: string;
}

async function createSubscriptionOrder(
  planId: PlanId, billingCycle: BillingCycle, gstNumber?: string, discountCode?: string,
): Promise<CreateOrderResult> {
  const { data, error } = await supabase.functions.invoke("subscription-create-order", {
    body: { planId, billingCycle, gstNumber, discountCode },
  });
  if (error) throw error;
  if (!data) return { configured: false };
  if (data.error === "invite_only") return { configured: false, error: "invite_only" };
  // Order matters — see the same guard in payments.ts. Only `not_configured`
  // may reach the demo activation path; letting order_failed / intent_failed
  // through would hand the vendor a paid plan without a successful charge.
  if (data.error === "not_configured") return { configured: false, error: data.error };
  // A refused code stops the purchase here, with nothing created and nothing held.
  if (data.error === "discount") return { configured: true, error: "discount", discountReason: data.reason ?? "unavailable" };
  // A paid next period is already waiting (plan changes, 2026-10-02): nothing created.
  if (data.error === "already_scheduled") return { configured: true, error: "already_scheduled" };
  // The checkout gate refused this account (P0): nothing was created.
  if (isCheckoutRefusal(data.error)) return { configured: true, error: data.error };
  if (data.error) throw new Error(String(data.detail || data.error));
  if (!data.configured) return { configured: false, error: data.error };
  return {
    configured: true, orderId: data.orderId, keyId: data.keyId,
    amount: data.amount, currency: data.currency, base: data.base, gst: data.gst, free: Boolean(data.free),
  };
}

async function verifySubscriptionPayment(
  input: { orderId: string; paymentId: string; signature: string } | { orderId: string; free: true },
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("subscription-verify-payment", { body: input });
  if (error) throw error;
  return data ?? { ok: false, error: "no_response" };
}

// Demo (no gateway configured): activate the subscription server-side from the
// plan + cycle. The server owns the write and recomputes the amount from the
// plan, so a client can't self-grant a plan for the wrong price. A code goes
// through the same reservation a live order would.
async function activateDemoSubscription(
  planId: PlanId, billingCycle: BillingCycle, gstNumber?: string, discountCode?: string,
): Promise<{ ok: boolean; planId?: string; error?: string; reason?: string }> {
  const { data, error } = await supabase.functions.invoke("subscription-verify-payment", {
    body: { demo: true, planId, billingCycle, gstNumber, discountCode },
  });
  if (error) throw error;
  return data ?? { ok: false, error: "no_response" };
}

export interface PurchaseResult {
  ok: boolean;
  demo?: boolean;
  planId?: string;
  error?: string;
  /** Why the discount code was refused (DiscountReason); show discountRefusal() of it. */
  discountReason?: string;
  /**
   * Razorpay took the payment but this browser couldn't finish the order (subscriptions P1).
   * The webhook or the reconciler finishes it, and a refused activation is already with
   * finance as a billing incident, so the vendor is told the money is safe, not "failed".
   */
  paid?: boolean;
}

// One call the UI uses for buy/upgrade/renew: create the order; if Razorpay is
// configured, open Checkout and verify; otherwise simulate (demo) activation.
export async function purchaseSubscription(opts: {
  planId: PlanId;
  billingCycle: BillingCycle;
  gstNumber?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  planName?: string;
  /** A code the vendor applied at checkout. The server prices it; this only names it. */
  discountCode?: string;
  /**
   * Called just before Razorpay Checkout opens. A modal dialog has to close then:
   * Radix makes everything outside an open dialog unclickable, Checkout included.
   */
  onGatewayOpen?: () => void;
}): Promise<PurchaseResult> {
  const order = await createSubscriptionOrder(opts.planId, opts.billingCycle, opts.gstNumber, opts.discountCode);
  if (order.discountReason) return { ok: false, error: "discount", discountReason: order.discountReason };
  if (order.error === "already_scheduled") return { ok: false, error: "already_scheduled" };
  if (isCheckoutRefusal(order.error)) return { ok: false, error: order.error };

  if (!order.configured) {
    if (order.error === "invite_only") return { ok: false, error: "invite_only" };
    // Gateway not wired → simulated activation (same fallback as the ad flow).
    const res = await activateDemoSubscription(opts.planId, opts.billingCycle, opts.gstNumber, opts.discountCode);
    return {
      ok: Boolean(res.ok), demo: true, planId: res.planId, error: res.error,
      discountReason: res.error === "discount" ? res.reason ?? "unavailable" : undefined,
    };
  }

  // The code took the total to ₹0: nothing to pay, so no Razorpay checkout.
  if (order.free) {
    const verified = await verifySubscriptionPayment({ orderId: order.orderId!, free: true });
    return { ok: Boolean(verified.ok), planId: verified.planId, error: verified.error };
  }

  opts.onGatewayOpen?.();
  const rp = await openRazorpayCheckout({
    keyId: order.keyId!, orderId: order.orderId!, amount: order.amount,
    name: "Cosora",
    description: `${opts.planName ?? opts.planId} · ${opts.billingCycle}`,
    prefill: opts.prefill,
    // A code's use is held for this order for 30 minutes; don't let checkout outlive it.
    timeout: opts.discountCode ? DISCOUNT_CHECKOUT_TIMEOUT_S : undefined,
  });
  const verified = await verifySubscriptionPayment({
    orderId: rp.razorpay_order_id, paymentId: rp.razorpay_payment_id, signature: rp.razorpay_signature,
  }).catch(() => ({ ok: false, planId: undefined, error: "unavailable" }));
  return {
    ok: Boolean(verified.ok), planId: verified.planId, error: verified.error,
    paid: !verified.ok && verified.error !== "bad_signature",
  };
}
