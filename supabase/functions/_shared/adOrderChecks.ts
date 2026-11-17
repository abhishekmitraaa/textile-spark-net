// Checks an ad order must pass before any money moves (Seller Home audit SH-094, SH-095, SH-096; 2026-11-17).
// Used by razorpay-create-order and razorpay-verify-payment's demo path. No Deno APIs, so Node can load it.
//
// * SH-096: the seller must be registered when the seller_registration_required switch says so. The database's
//   registration guard acts only on a browser's own insert, and campaigns are written by the payment functions, so the
//   switch stopped nothing here. public.seller_registered() is the one rule (true for everyone while the switch is off).
// * SH-095: every listing an ad promotes must be the seller's own and live. The picker offered listings under review,
//   and nothing on the server checked the owner: a campaign on someone else's listing, or on one buyers can't see, was
//   paid for and never served.

import { isVerificationOnly, SELLABLE_AD_TYPES, type AdSpec } from "./adPricing.ts";

export interface OrderCheck { ok: boolean; error?: string; message?: string }

function headers(key: string): Record<string, string> {
  return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
}

export async function checkAdOrder(url: string, key: string, vendorId: string, spec: AdSpec): Promise<OrderCheck> {
  // SH-094: only types buyers actually see are sold.
  if ((spec.placementIds ?? []).some((id) => !SELLABLE_AD_TYPES.has(id))) {
    return { ok: false, error: "not_sold", message: "Some of these ad types aren't shown to buyers yet, so they can't be bought. Remove them and try again." };
  }
  try {
    const reg = await fetch(`${url}/rest/v1/rpc/seller_registered`, {
      method: "POST", headers: headers(key), body: JSON.stringify({ p_vendor: vendorId }),
    });
    if (!reg.ok) return { ok: false, error: "unavailable", message: "Couldn't check your registration. Try again in a moment." };
    if ((await reg.json()) !== true) {
      return { ok: false, error: "not_registered", message: "Finish your seller registration first. Once Cosora approves it, you can buy ads and get verified." };
    }
  } catch {
    return { ok: false, error: "unavailable", message: "Couldn't check your registration. Try again in a moment." };
  }

  if (isVerificationOnly(spec)) return { ok: true };

  const ids = [...new Set((spec.items ?? []).map((i) => i?.productId).filter((x): x is string => typeof x === "string"))];
  if (ids.length === 0 || ids.length !== (spec.items ?? []).length) {
    return { ok: false, error: "bad_items", message: "Pick each listing to promote once." };
  }
  if (!ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))) return { ok: false, error: "bad_items", message: "Pick listings from your products." };
  try {
    const r = await fetch(
      `${url}/rest/v1/products?select=id&vendor_id=eq.${vendorId}&status=eq.live&id=in.(${ids.join(",")})`,
      { headers: headers(key) },
    );
    if (!r.ok) return { ok: false, error: "unavailable", message: "Couldn't check your listings. Try again in a moment." };
    const live = new Set(((await r.json()) as { id: string }[]).map((x) => x.id));
    if (ids.some((id) => !live.has(id))) {
      return { ok: false, error: "listing_not_live", message: "Ads run only on your own live listings. Remove any that are in review, paused or not yours." };
    }
  } catch {
    return { ok: false, error: "unavailable", message: "Couldn't check your listings. Try again in a moment." };
  }
  return { ok: true };
}
