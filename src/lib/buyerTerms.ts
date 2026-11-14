import { supabase } from "@/lib/supabase";

/**
 * The version of the Terms the sign-up card shows (src/data/terms.ts). It must equal the database's
 * buyer_terms_version(): accept_buyer_terms() refuses any other ("stale_terms"), so a tab still showing old wording
 * can't record an acceptance of the new one. A change to what a buyer agrees to is a new version in both places.
 */
export const BUYER_TERMS_VERSION = "2026-11-v1";

/**
 * Records the acceptance and finishes sign-up in one database call (accept_buyer_terms, migration 20261114100000):
 * a terms_acceptances row, and onboarded, terms_version and terms_accepted_at on the profile. Throws when refused.
 */
export async function acceptBuyerTerms(): Promise<void> {
  const { error } = await supabase.rpc("accept_buyer_terms", { p_version: BUYER_TERMS_VERSION });
  if (error) throw error;
}

/** True when the refusal means the Terms changed since this page loaded. */
export function isStaleTerms(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { message?: unknown }).message === "stale_terms";
}
