import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { saveVendorProfile } from "@/lib/queries/vendorStore";
import { saveProfileFull } from "@/lib/queries/profile";

// ─────────────────────────────────────────────────────────────
// The company/brand name a user typed at signup.
//
// With email confirmation ON, auth.signUp() returns NO session — so the client
// cannot write buyer_profiles/vendor_profiles at that moment, because RLS has
// no auth.uid() to check. The name rides along in user metadata instead and is
// applied on the first sign-in that actually has a session.
//
// `active_role` deliberately does NOT work this way: it is applied by
// handle_new_user() at signup, because landing a confirmed seller on the buyer
// side of the app is a bug you notice much later than a missing brand name.
//
// Both writes go through the EXISTING persistence paths (saveVendorProfile /
// saveProfileFull) — no third way to write a profile.
// ─────────────────────────────────────────────────────────────

export interface PendingSignupProfile {
  fullName: string;
  phone: string;
  /** Brand name for a seller, company for a buyer. */
  brandName: string;
  role: "buyer" | "seller";
}

/** The metadata blob handed to auth.signUp(). */
export function signupMetadata(p: PendingSignupProfile): Record<string, string> {
  return {
    full_name: p.fullName,
    phone: p.phone,
    // Read by handle_new_user(), whitelisted to buyer/seller there.
    active_role: p.role,
    // Read back by applyPendingSignupProfile() below.
    brand_name: p.brandName,
  };
}

/**
 * Apply whatever the signup form captured but could not write, once.
 *
 * It runs on every sign-in, and writes only the name signup captured: the
 * vendor's brand or the buyer's company, and only while none is saved. Then it
 * clears `brand_name` from the metadata, because once applied it is no longer
 * pending. Left there, it was written back on every later sign-in, reverting a
 * renamed brand or bringing back a company the buyer had cleared (MPF-20).
 *
 * Best-effort by design — a failure here must never block a sign-in, because
 * the same values are re-collected in onboarding (seller) or editable in My
 * Profile (buyer). If the write fails, the metadata is kept and the next
 * sign-in tries again. If only the clearing fails, the next sign-in finds the
 * name saved, writes nothing, and tries the clearing again.
 */
export async function applyPendingSignupProfile(user: User): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const brandName = typeof meta.brand_name === "string" ? meta.brand_name.trim() : "";
  if (!brandName) return;

  const role = meta.active_role === "seller" ? "seller" : "buyer";
  try {
    if (role === "seller") {
      // Only while no brand is saved: once there is one, it's the vendor's to
      // rename, and this used to write the signup brand back over it.
      const { data: vp, error } = await supabase
        .from("vendor_profiles").select("brand_name").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (!vp?.brand_name) await saveVendorProfile(user.id, { brandName });
    } else {
      // This used to save a whole EMPTY_PROFILE-based object, so every sign-in
      // blanked the buyer's other profile fields and set country to "India"
      // (MPF-9). The name, email and phone are left out: handle_new_user()
      // wrote them when the account was created, and re-sending them undid
      // later edits (a phone-only account's missing email blanked a saved one).
      // The company is written only while none is saved: once the buyer has
      // one, it's theirs to change.
      const { data: bp, error } = await supabase
        .from("buyer_profiles").select("company").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (!bp?.company) await saveProfileFull(user.id, { businessName: brandName });
    }

    // Applied, or already there: either way it's no longer pending. Only
    // brand_name changes; updateUser merges into the rest of the metadata.
    const { error: metaError } = await supabase.auth.updateUser({ data: { brand_name: null } });
    if (metaError) throw metaError;
  } catch (err) {
    // STILL non-blocking on purpose — see the docblock. A failed write here must
    // never stop someone signing in, and the same values are re-collected in
    // onboarding (seller) or editable in My Profile (buyer).
    //
    // But it is no longer SILENT. This runs on all three sign-in paths now
    // (Register, Login, AuthCallback), including the confirmation link that
    // most real users arrive by, so a persistent failure would lose every new
    // vendor's brand name with nothing anywhere to show for it. The id and role
    // are logged because "it failed" is not actionable — which account, and
    // which of the two write paths, is.
    console.error(
      `[signupProfile] failed to apply pending signup profile for ${user.id} (role=${role}):`,
      err,
    );
  }
}
