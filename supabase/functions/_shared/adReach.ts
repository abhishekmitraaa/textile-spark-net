// What a vendor's plan lets an ad reach (subscriptions P5, 2026-10-08).
//
// One rule, kept in the database (admin.ad_reach, through public.ad_reach_resolve), for the
// three functions that handle a paid ad order:
//   * razorpay-create-order asks strictly, before any money moves: a spec the plan doesn't
//     allow is refused with a reason the vendor can act on.
//   * razorpay-verify-payment and razorpay-webhook publish what was paid for. The plan may
//     have changed since the order was made, so they clamp instead of refusing: the first
//     states the plan allows, countries only on VIP. An order is blocked (and goes to refund
//     review) only when nothing can be published: no ads on the plan, or a one- or four-state
//     plan with no state to reach.
//
// The database reads the plan in force, so a vendor in their grace days keeps their reach.
// (These functions used to read vendor_subscriptions themselves and compare the period's
// end, which treats a vendor in grace as Free.)
//
// Where the ad_state_targeting switch is off for the vendor, the answer carries no states
// and keeps the older city list, clamped to the plan's count as before.

import type { AdSpec } from "./adPricing.ts";

export interface ReachDecision {
  /** The spec may be used as returned. False with `blocked`: publish nothing. */
  ok: boolean;
  blocked: boolean;
  /** no_ads_on_plan, choose_state, too_many_states, countries_need_vip, unknown_state, unavailable. */
  reason?: string;
  /** What to tell the vendor, in the database's words. */
  message?: string;
  /** The spec with its targeting as the plan allows it. */
  spec: AdSpec;
  /** Locations asked for and allowed (states, or cities where state targeting is off). */
  requested: number;
  allowed: number;
}

interface RawReach {
  ok?: boolean; blocked?: boolean; reason?: string; message?: string;
  states?: string[]; countries?: string[]; cities?: string[];
  requested?: number; allowed?: number; state_targeting?: boolean;
}

export async function adReach(
  url: string, key: string, vendorId: string, spec: AdSpec, strict = false,
): Promise<ReachDecision> {
  const states = Array.isArray(spec.targetStates) ? spec.targetStates : [];
  const countries = Array.isArray(spec.targetCountries) ? spec.targetCountries : [];
  const cities = Array.isArray(spec.targetCities) ? spec.targetCities : [];
  // On any failure to ask, publish nothing: never over-reach on a lookup error.
  const closed: ReachDecision = { ok: false, blocked: true, reason: "unavailable", spec, requested: states.length || cities.length, allowed: 0 };
  let raw: RawReach;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/ad_reach_resolve`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_vendor: vendorId, p_states: states, p_countries: countries, p_cities: cities, p_strict: strict }),
    });
    if (!r.ok) return closed;
    raw = await r.json() as RawReach;
  } catch {
    return closed;
  }
  if (!raw || typeof raw !== "object") return closed;
  const requested = Number(raw.requested ?? (states.length || cities.length));
  if (!raw.ok) {
    return { ok: false, blocked: Boolean(raw.blocked), reason: raw.reason ?? "unavailable", message: raw.message, spec, requested, allowed: 0 };
  }
  const next: AdSpec = {
    ...spec,
    targetStates: raw.states?.length ? raw.states : undefined,
    targetCountries: raw.countries?.length ? raw.countries : undefined,
    targetCities: raw.cities?.length ? raw.cities : undefined,
  };
  return { ok: true, blocked: false, spec: next, requested, allowed: Number(raw.allowed ?? requested) };
}
