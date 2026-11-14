import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/** The profile columns sign-in routes on (AuthContext's profile, the code screen's landing). */
export const PROFILE_COLUMNS = "id, full_name, active_role, onboarded, avatar_url, terms_version" as const;

export type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "active_role" | "onboarded" | "avatar_url" | "terms_version"
>;

// supabase-js already retries a GET that answers 503 or 520, after 1, 2 and 4 seconds (postgrest-js's
// RETRYABLE_STATUS_CODES): those aren't retried again here, or a down database would take half a minute to say so.
const CLIENT_RETRIED = new Set([503, 520]);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The signed-in account's profile row (buyer sign-up audit item 6). A failed read used to count as "no profile": the
 * code screen sent a returning buyer to role selection, and the sign-in callback spun forever. Any other failure, a
 * dropped connection or a row not there yet is read again after 0.5 and 1 seconds. Null means it still failed: the
 * caller shows Retry and never guesses.
 */
export async function readProfileRow(uid: string, delays: number[] = [500, 1000]): Promise<ProfileRow | null> {
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    try {
      const res = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", uid).maybeSingle();
      if (!res.error && res.data) return res.data as ProfileRow;
      status = res.status;
    } catch {
      /* a dropped connection: read again */
    }
    if (CLIENT_RETRIED.has(status) || attempt >= delays.length) return null;
    await wait(delays[attempt]);
  }
}
