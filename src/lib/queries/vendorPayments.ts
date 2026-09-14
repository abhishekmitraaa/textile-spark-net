import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// One ledger for everything a vendor has paid Cosora, plus the fulfilment
// state of anything physical they bought. Feeds /my-payments.
//
// ── THE UNIT TRAP, and why every amount here is normalised ──
//
// The three money tables in this project do NOT agree on units, and nothing
// said so anywhere:
//
//   ad_orders.amount                  PAISE   (razorpay-create-order: rupees * 100)
//   subscription_payment_orders.amount PAISE  (subscription-create-order: (base + gst) * 100)
//   subscription_invoices.amount      RUPEES  (subscription-verify-payment writes `base`)
//
// Confirmed against the live rows: subscription_invoices currently holds values
// from 699 to 22000, which are plainly rupees. Rendering these side by side
// without converting would show a vendor's ad spend a hundred times too high,
// and the error would look like a pricing bug rather than a units bug. So
// `amountRupees` below is the ONLY amount this module exposes, and every source
// is converted at its own boundary.
//
// ── Which rows count as a payment ──
//
// Subscriptions are read from subscription_invoices, not from
// subscription_payment_orders: the order row is an INTENT recorded before
// checkout opens, and a successful payment writes an invoice. Listing both
// would double-count every subscription the vendor actually paid for.
//
// Ads have no invoice table, so ad_orders is the record — minus status
// 'created', which is an intent whose checkout was never completed. A vendor
// who closed the Razorpay window has not paid and should not see a payment.
// 'refund_review' IS included and deliberately so: that is money taken for a
// campaign the plan gate then refused, and it is the row a vendor most needs to
// see.
// ─────────────────────────────────────────────────────────────

export type PaymentKind = "ad" | "subscription";

export interface VendorPayment {
  /** Stable row key. The Razorpay order id for ads, the invoice id for plans. */
  id: string;
  kind: PaymentKind;
  /** What a vendor would quote on the phone. */
  reference: string;
  /** Plain-language line description, derived from the stored spec/plan. */
  description: string;
  /** ALWAYS rupees. See the unit note above. */
  amountRupees: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  /**
   * Route to a printable document, or null when there is none to print. Never
   * a fabricated link: an ad order gets a receipt built from its own stored
   * spec, a subscription gets its existing tax invoice.
   */
  documentPath: string | null;
}

interface RawAdOrder {
  order_id: string; amount: number; status: string;
  created_at: string; paid_at: string | null;
  spec: { placementIds?: string[]; items?: unknown[]; days?: number; campaignLabel?: string } | null;
}

/** Human label for an ad order, built from what the vendor actually bought. */
export function describeAdSpec(spec: RawAdOrder["spec"]): string {
  const placements = spec?.placementIds?.length ?? 0;
  const items = Array.isArray(spec?.items) ? spec!.items!.length : 0;
  const days = Math.max(1, Math.floor(spec?.days ?? 1));
  const label = spec?.campaignLabel?.trim();
  const parts = [
    `${placements || "no"} placement${placements === 1 ? "" : "s"}`,
    `${items || "no"} product${items === 1 ? "" : "s"}`,
    `${days} day${days === 1 ? "" : "s"}`,
  ];
  return `Advertising — ${parts.join(" · ")}${label ? ` (${label})` : ""}`;
}

async function fetchAdPayments(vendorId: string): Promise<VendorPayment[]> {
  const { data, error } = await supabase
    .from("ad_orders")
    .select("order_id, amount, status, created_at, paid_at, spec")
    .eq("vendor_id", vendorId)
    .neq("status", "created")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawAdOrder[]).map((o) => ({
    id: o.order_id,
    kind: "ad" as const,
    reference: o.order_id,
    description: describeAdSpec(o.spec),
    amountRupees: Math.round(Number(o.amount) / 100), // paise → rupees
    status: o.status,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    documentPath: `/my-payments/receipt/${encodeURIComponent(o.order_id)}`,
  }));
}

interface RawSubInvoice {
  id: string; plan_id: string | null; amount: number; gst_amount: number | null;
  status: string; invoice_number: string | null; created_at: string;
  billing_period_start: string | null;
}

async function fetchSubscriptionPayments(vendorId: string): Promise<VendorPayment[]> {
  const { data, error } = await supabase
    .from("subscription_invoices")
    .select("id, plan_id, amount, gst_amount, status, invoice_number, created_at, billing_period_start")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawSubInvoice[]).map((i) => ({
    id: i.id,
    kind: "subscription" as const,
    reference: i.invoice_number ?? `#${i.id.slice(0, 8)}`,
    description: `${i.plan_id ? i.plan_id[0].toUpperCase() + i.plan_id.slice(1) : "Subscription"} plan subscription`,
    // Already rupees. The total a vendor was charged is base + GST, which is
    // what the tax invoice prints, so it is what the ledger has to show — the
    // base alone would not reconcile against their bank statement.
    amountRupees: Number(i.amount) + Number(i.gst_amount ?? 0),
    status: i.status,
    createdAt: i.created_at,
    paidAt: i.status === "paid" ? i.created_at : null,
    documentPath: `/subscription/invoice/${i.id}`,
  }));
}

/** Every payment, newest first, across both sources. */
export function useVendorPayments(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_payments", vendorId],
    queryFn: async (): Promise<VendorPayment[]> => {
      const [ads, subs] = await Promise.all([
        fetchAdPayments(vendorId as string),
        fetchSubscriptionPayments(vendorId as string),
      ]);
      return [...ads, ...subs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    enabled: Boolean(vendorId),
  });
}

/** One ad order, for the printable receipt. */
export interface AdReceipt {
  orderId: string;
  amountRupees: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  placementIds: string[];
  itemCount: number;
  days: number;
  campaignLabel: string | null;
}

export async function fetchAdReceipt(orderId: string): Promise<AdReceipt | null> {
  const { data, error } = await supabase
    .from("ad_orders")
    .select("order_id, amount, status, created_at, paid_at, spec")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const o = data as unknown as RawAdOrder;
  return {
    orderId: o.order_id,
    amountRupees: Math.round(Number(o.amount) / 100),
    status: o.status,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    placementIds: o.spec?.placementIds ?? [],
    itemCount: Array.isArray(o.spec?.items) ? o.spec!.items!.length : 0,
    days: Math.max(1, Math.floor(o.spec?.days ?? 1)),
    campaignLabel: o.spec?.campaignLabel?.trim() || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Certificate orders — the physical article, tracked by the vendor who bought
// it. Read straight off certificate_orders: its RLS policy admits the row's own
// vendor, so no RPC is needed for a read, and every write is refused to the
// vendor by there being no write policy at all.
// ─────────────────────────────────────────────────────────────

export type CertificateStatus =
  | "processing" | "printed" | "dispatched" | "delivered" | "returned" | "cancelled";

export interface VendorCertificate {
  id: string;
  reference: string;
  status: CertificateStatus;
  courier: string | null;
  trackingNumber: string | null;
  returnReason: string | null;
  addressLine: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  purchasedAt: string;
  printedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
}

interface RawCert {
  id: string; reference: string; status: string; courier: string | null;
  tracking_number: string | null; return_reason: string | null;
  address_line: string | null; area: string | null; city: string | null;
  state: string | null; postal_code: string | null;
  purchased_at: string; printed_at: string | null;
  dispatched_at: string | null; delivered_at: string | null;
}

export function useVendorCertificates(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_certificates", vendorId],
    queryFn: async (): Promise<VendorCertificate[]> => {
      const { data, error } = await supabase
        .from("certificate_orders")
        .select("id, reference, status, courier, tracking_number, return_reason, address_line, area, city, state, postal_code, purchased_at, printed_at, dispatched_at, delivered_at")
        .eq("vendor_id", vendorId as string)
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RawCert[]).map((c) => ({
        id: c.id, reference: c.reference, status: c.status as CertificateStatus,
        courier: c.courier, trackingNumber: c.tracking_number, returnReason: c.return_reason,
        addressLine: c.address_line, area: c.area, city: c.city, state: c.state,
        postalCode: c.postal_code, purchasedAt: c.purchased_at, printedAt: c.printed_at,
        dispatchedAt: c.dispatched_at, deliveredAt: c.delivered_at,
      }));
    },
    enabled: Boolean(vendorId),
  });
}

/**
 * The tracking timeline, as steps with real timestamps.
 *
 * There is no invented "expected delivery" date. Cosora does not integrate with
 * any courier's tracking API, so a predicted date would be a guess presented as
 * a fact — and the vendor would plan around it. What IS known is the tracking
 * number and the courier, which is what the steps below carry.
 */
export const CERTIFICATE_STEPS: { id: CertificateStatus; label: string; hint: string }[] = [
  { id: "processing", label: "Order received", hint: "Your certificate is queued for printing." },
  { id: "printed",    label: "Printed",        hint: "Printed and waiting for pickup." },
  { id: "dispatched", label: "Dispatched",     hint: "Handed to the courier." },
  { id: "delivered",  label: "Delivered",      hint: "Marked delivered by Cosora." },
];

/** How far along the forward pipeline this order is; -1 for returned/cancelled. */
export function certificateStepIndex(status: CertificateStatus): number {
  return CERTIFICATE_STEPS.findIndex((s) => s.id === status);
}
