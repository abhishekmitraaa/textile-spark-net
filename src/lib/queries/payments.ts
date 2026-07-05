import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Razorpay checkout for vendor ad purchases.
//
// Flow: create-order (server computes the amount) → Razorpay Checkout →
// verify-payment (server verifies the signature and publishes the campaigns).
// Until the RAZORPAY_* secrets are set, create-order returns {configured:false}
// and the caller falls back to the simulated checkout. See the edge functions
// in supabase/functions/razorpay-*.
// ─────────────────────────────────────────────────────────────

export interface AdItem {
  productId: string;
  title: string;
  imageUrl: string | null;
}

export interface AdSpec {
  placementIds: string[];
  days: number;
  items: AdItem[];
  campaignLabel?: string;
}

export interface OrderResult {
  configured: boolean;
  orderId?: string;
  keyId?: string;
  amount?: number; // paise
  currency?: string;
}

// Ask the server to create a Razorpay order. The full spec is recorded in a
// server-side intent (ad_orders); the amount is computed server-side.
export async function createRazorpayOrder(spec: AdSpec): Promise<OrderResult> {
  const { data, error } = await supabase.functions.invoke("razorpay-create-order", { body: { spec } });
  if (error) throw error;
  if (!data || data.error === "not_configured" || !data.configured) return { configured: false };
  if (data.error) throw new Error(String(data.detail || data.error));
  return { configured: true, orderId: data.orderId, keyId: data.keyId, amount: data.amount, currency: data.currency };
}

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  order_id: string;
  amount?: number;
  currency?: string;
  name: string;
  description?: string;
  theme?: { color?: string };
  prefill?: { name?: string; email?: string; contact?: string };
  handler: (r: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance { open: () => void }
declare global {
  interface Window { Razorpay?: new (opts: RazorpayOptions) => RazorpayInstance }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("Could not load Razorpay")); };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export interface CheckoutOpts {
  keyId: string;
  orderId: string;
  amount?: number;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

// Opens Razorpay Checkout; resolves with the payment fields, rejects with
// Error("dismissed") if the buyer closes it.
export function openRazorpayCheckout(opts: CheckoutOpts): Promise<RazorpayHandlerResponse> {
  return new Promise(async (resolve, reject) => {
    try {
      await loadRazorpayScript();
    } catch (e) {
      reject(e);
      return;
    }
    if (!window.Razorpay) { reject(new Error("Razorpay unavailable")); return; }
    let done = false;
    const rzp = new window.Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: "INR",
      name: opts.name || "Cosora",
      description: opts.description,
      theme: { color: "#ff2160" },
      prefill: opts.prefill,
      handler: (r) => { done = true; resolve(r); },
      modal: { ondismiss: () => { if (!done) reject(new Error("dismissed")); } },
    });
    rzp.open();
  });
}

// Live: server verifies the signature and publishes the recorded intent
// (spec/vendor come from the server, not the client).
export async function verifyRazorpayPayment(input: {
  orderId: string; paymentId: string; signature: string;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("razorpay-verify-payment", {
    body: { orderId: input.orderId, paymentId: input.paymentId, signature: input.signature },
  });
  if (error) throw error;
  return data ?? { ok: false, error: "no_response" };
}

// Demo (no gateway configured): publish the campaigns server-side from the spec.
// The server still owns the insert (clients can't create active ads directly).
export async function publishDemoAds(spec: AdSpec): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("razorpay-verify-payment", {
    body: { demo: true, spec },
  });
  if (error) throw error;
  return data ?? { ok: false, error: "no_response" };
}
