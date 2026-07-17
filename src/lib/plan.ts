// ─────────────────────────────────────────────────────────────
// Subscription plan model — pure types + helpers (JSX-free so it can be
// imported anywhere without breaking fast-refresh). The shapes here mirror the
// subscription_plans table and the get_vendor_plan() RPC exactly.
// ─────────────────────────────────────────────────────────────

export type PlanId = "free" | "basic" | "silver" | "gold" | "vip";

export type AdLocationScope = "none" | "state_1" | "state_4" | "pan_india" | "global";

// Enforceable limits (subscription_plans.limits jsonb). product_cap = -1 means
// unlimited; leads_per_month is the monthly lead allowance.
export interface PlanLimits {
  leads_per_month: number;
  product_cap: number;
  ad_location_scope: AdLocationScope;
  has_verified_badge: boolean;
  search_boost_tier: number;
  has_dedicated_am: boolean;
  has_realtime_alerts: boolean;
  has_crm: boolean;
  has_auto_catalog: boolean;
  has_international: boolean;
}

// Human display strings for the comparison table (subscription_plans.display).
export interface PlanDisplay {
  leads: string;
  products: string;
  international: string;
  ad: string;
  trust: string;
  search: string;
  account_manager: string;
  lead_channel: string;
  alerts: string;
  crm: string;
  catalog: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  is_invite_only: boolean;
  sort_order: number;
  limits: PlanLimits;
  display: PlanDisplay;
}

export interface PlanUsage {
  products_used: number;
  leads_used: number;
  period_start: string;
  period_end: string;
}

// Output of the get_vendor_plan() RPC — the single read model for the current
// vendor's effective plan + limits + live usage.
export interface VendorPlan {
  vendor_id: string;
  effective_plan_id: PlanId;
  status: string; // active | past_due | expired | canceled | pending | free
  billing_cycle: "monthly" | "yearly";
  auto_renew: boolean;
  current_period_start: string;
  current_period_end: string;
  subscription_end: string | null;
  is_invite_only: boolean;
  is_verified_admin: boolean;
  trust_seal: boolean;
  plan: Plan;
  limits: PlanLimits;
  usage: PlanUsage;
}

// ── Limit helpers ─────────────────────────────────────────────
export const isUnlimited = (cap: number): boolean => cap == null || cap < 0;

export function capReached(used: number, cap: number): boolean {
  if (isUnlimited(cap)) return false;
  return used >= cap;
}

export function remaining(used: number, cap: number): number {
  if (isUnlimited(cap)) return Infinity;
  return Math.max(0, cap - used);
}

export function usagePct(used: number, cap: number): number {
  if (isUnlimited(cap) || cap === 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

// ── Trust seal ────────────────────────────────────────────────
// Displayed seal = admin verification OR an active PAID subscription OR an
// active ad-purchased verification (trustedSeal / verifiedCertificate). Because
// every paid tier grants the badge (per spec), an in-future plan_expires_at is
// sufficient to signal an active paid plan without a plans lookup;
// ad_verified_until is the denormalised max expiry of any ad-purchased seal.
// This never writes vendor_profiles.is_verified, so none of these three sources
// can erase or silently grant another's meaning.
function futureTs(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now();
}
export function trustSealFromParts(
  isVerified: boolean | null | undefined,
  planExpiresAt: string | null | undefined,
  adVerifiedUntil?: string | null | undefined,
): boolean {
  return Boolean(isVerified) || futureTs(planExpiresAt) || futureTs(adVerifiedUntil);
}

// ── Ad-location scope ─────────────────────────────────────────
export const AD_SCOPE_LABEL: Record<AdLocationScope, string> = {
  none: "No ad targeting",
  state_1: "1 state",
  state_4: "Up to 4 states",
  pan_india: "Pan-India",
  global: "Custom / global",
};

// Max number of state targets a plan allows (Infinity = pan-India/global).
export function adStateAllowance(scope: AdLocationScope): number {
  switch (scope) {
    case "none": return 0;
    case "state_1": return 1;
    case "state_4": return 4;
    default: return Infinity; // pan_india / global
  }
}

export const canRunAds = (scope: AdLocationScope): boolean => scope !== "none";

// ── Formatting + pricing ──────────────────────────────────────
export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

// Honest yearly discount vs. 12× monthly (seed uses 10× monthly = ~17%).
export function yearlySavingsPct(monthly: number, yearly: number): number {
  if (!monthly || !yearly) return 0;
  const full = monthly * 12;
  if (full <= 0) return 0;
  return Math.round(((full - yearly) / full) * 100);
}

export function yearlySavingsAmount(monthly: number, yearly: number): number {
  return Math.max(0, monthly * 12 - yearly);
}

// ── Per-tier visual treatment (badges / chips) ────────────────
export interface TierStyle {
  label: string;
  chip: string;   // tailwind classes for a small badge/chip
  ring: string;   // ring/border accent for cards
}

export const TIER_STYLE: Record<PlanId, TierStyle> = {
  free:   { label: "Free",   chip: "bg-muted text-muted-foreground",                         ring: "border-border" },
  basic:  { label: "Basic",  chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",           ring: "border-sky-500/30" },
  silver: { label: "Silver", chip: "bg-slate-400/15 text-slate-600 dark:text-slate-300",     ring: "border-slate-400/40" },
  gold:   { label: "Gold",   chip: "bg-accent/15 text-accent",                               ring: "border-accent/40" },
  vip:    { label: "VIP",    chip: "bg-gradient-to-r from-fuchsia-500/15 to-amber-400/15 text-fuchsia-600 dark:text-fuchsia-300", ring: "border-fuchsia-500/40" },
};

export function tierStyle(id: string | null | undefined): TierStyle {
  return TIER_STYLE[(id as PlanId)] ?? TIER_STYLE.free;
}
