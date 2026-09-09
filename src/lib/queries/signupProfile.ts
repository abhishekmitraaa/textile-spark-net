import type { User } from "@supabase/supabase-js";
import { saveVendorProfile } from "@/lib/queries/vendorStore";
import { saveProfileFull } from "@/lib/queries/profile";
import { EMPTY_PROFILE } from "@/lib/queries/profile";

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
 * Apply whatever the signup form captured but could not write.
 *
 * Idempotent: both underlying writes are upserts keyed on the user id, so
 * running this on every sign-in is harmless. Best-effort by design — a failure
 * here must never block a sign-in, because the same values are re-collected in
 * onboarding (seller) or editable in My Profile (buyer).
 */
export async function applyPendingSignupProfile(user: User): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const brandName = typeof meta.brand_name === "string" ? meta.brand_name.trim() : "";
  if (!brandName) return;

  const role = meta.active_role === "seller" ? "seller" : "buyer";
  try {
    if (role === "seller") {
      await saveVendorProfile(user.id, { brandName });
    } else {
      await saveProfileFull(user.id, {
        ...EMPTY_PROFILE,
        fullName: typeof meta.full_name === "string" ? meta.full_name : "",
        email: user.email ?? "",
        phone: typeof meta.phone === "string" ? meta.phone : "",
        businessName: brandName,
      });
    }
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
