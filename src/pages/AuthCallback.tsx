import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { applyPendingSignupProfile } from "@/lib/queries/signupProfile";
import { clearAuthStart } from "@/lib/authHistory";

// ─────────────────────────────────────────────────────────────
// The landing page for BOTH redirect-based sign-ins:
//   - Google OAuth, and
//   - the email-confirmation link, which Register.tsx sets as its
//     emailRedirectTo and its own comment calls "the real end of the signup
//     flow for most users".
//
// The Supabase client parses the auth response from the URL automatically
// (detectSessionInUrl), so by the time the session/profile resolve we just
// need to route:
//   - not signed in            → back to /login
//   - first-time user          → /auth/role-selection (pick buyer/seller)
//   - returning user           → their chosen side (buyer home / seller home)
//
// ...but routing is not all this page owes the user. handle_new_user() writes
// exactly email, full_name, phone and active_role to `profiles` and nothing
// else, so the brand name (seller) or company (buyer) typed at signup lives
// ONLY in auth user metadata until applyPendingSignupProfile() moves it into
// vendor_profiles / buyer_profiles. That write needs a session, and signup has
// none while email confirmation is on — this page is the first moment one
// exists. Login.tsx and Register.tsx already call it; this path did not, so
// every user arriving by the confirmation link silently lost the name.
// ─────────────────────────────────────────────────────────────

export default function AuthCallback() {
  const { loading, session, profile, profileError, refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();
  // The effect re-fires when `profile` arrives, and StrictMode double-invokes
  // it in dev. The write underneath is an upsert and safe to repeat, but there
  // is no reason to issue it twice.
  const appliedRef = useRef(false);
  // A redirect sign-in (Google) didn't start on Login's phone form: an earlier, abandoned attempt's mark must not
  // rewind this one (lib/authHistory.ts).
  useEffect(() => { clearAuthStart(); }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) { navigate("/login", { replace: true }); return; }
    if (!profile) return; // wait for the profile row to load (a read that keeps failing shows Retry below)

    let cancelled = false;
    void (async () => {
      if (!appliedRef.current) {
        appliedRef.current = true;
        // No-ops when metadata carries no brand_name (a Google sign-in never
        // does) and never throws — see its docblock. Awaited rather than
        // fired-and-forgotten so a slow write cannot lose the race with the
        // redirect that unmounts this page.
        await applyPendingSignupProfile(session.user);
      }
      if (cancelled) return;
      if (!profile.onboarded) {
        navigate("/auth/role-selection", { replace: true });
      } else {
        navigate(profile.active_role === "seller" ? "/seller-home" : "/home/new-arrivals", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [loading, session, profile, navigate]);

  // The profile couldn't be read even after retrying (audit item 6): this page used to spin forever.
  if (session && !profile && profileError) {
    return (
      <div className="min-h-screen grid place-items-center bg-white px-6">
        <div className="text-center max-w-xs" role="alert">
          <CosoraLogo height={34} />
          <p className="mt-5 text-base font-semibold text-gray-900">We couldn't load your account</p>
          <p className="mt-1 text-sm text-gray-500">Check your connection and try again.</p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              disabled={retrying}
              onClick={async () => { setRetrying(true); await refreshProfile(); setRetrying(false); }}
              className="px-5 py-2.5 rounded-xl bg-brand-buyer text-white text-sm font-bold disabled:opacity-60"
            >
              {retrying ? "Trying…" : "Retry"}
            </button>
            <button
              type="button"
              onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}
              className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="text-center">
        <CosoraLogo height={34} />
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Signing you in…
        </div>
      </div>
    </div>
  );
}
