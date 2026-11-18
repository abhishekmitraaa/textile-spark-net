import { useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { HelpCircle, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Decision = "open" | "login" | "home";

/**
 * Wraps a buyer sign-up screen (Role, Sub-role, Account Information, Interest Preference, Terms).
 *
 * - Signed out: sign in first. The steps save to the account, so without one they wrote nothing (audit item 3).
 * - Sign-up finished (onboarded, and the current Terms accepted): Home, replacing the entry, so neither the back button
 *   nor a new tab reopens a step or role selection (audit item 7). Sellers go to Seller Home.
 * - Onboarded before Terms acceptances were recorded: only the Terms screen stays open.
 *
 * It decides once, on arrival, from the database's profile: accepting the Terms updates the profile while the Terms
 * screen is still showing, and that must not jump away before the screen moves on.
 *
 * Every step shows Help and Sign out (2026-11-18 review, H-06): the sign-up gate sends an unfinished account back here
 * from every buyer page, and the steps had no way out, so a wrong number or a shared phone was stuck until sign-up was
 * finished. Signing out does not change how anyone signs in.
 */
export default function SignupStep({ children }: { children: ReactNode }) {
  const { session, profile, profileError, loading } = useAuth();
  const { pathname } = useLocation();
  const onArrival = useRef<Decision | null>(null);

  if (loading) return null;
  if (onArrival.current === null) {
    if (!session) onArrival.current = "login";
    // The profile couldn't be read even after retrying: show the step rather than a blank page. Its saves go to the
    // account, and the database refuses what a finished account may not redo.
    else if (!profile && profileError) onArrival.current = "open";
    // Signed in but the profile hasn't loaded yet: wait for it rather than decide on nothing.
    else if (!profile || profile.id !== session.user.id) return null;
    else if (profile.onboarded && (profile.terms_version || pathname !== "/auth/terms")) onArrival.current = "home";
    else onArrival.current = "open";
  }

  if (onArrival.current === "login") return <Navigate to="/auth/login" replace />;
  if (onArrival.current === "home") {
    return <Navigate to={profile?.active_role === "seller" ? "/seller-home" : "/home/new-arrivals"} replace />;
  }
  return (
    <>
      {children}
      <SignupExits />
    </>
  );
}

/** Help and Sign out, pinned to the top-right corner, above every step's own header. */
function SignupExits() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const leave = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <nav
      aria-label="Account"
      className="fixed right-3 top-3 z-[60] flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 p-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur"
    >
      {/* Icons only on a phone, so the pill clears the steps' centred logo; the words stay for screen readers. */}
      <Link to="/help" aria-label="Help" className="inline-flex items-center gap-1 rounded-full p-1.5 hover:bg-gray-100 sm:px-2.5">
        <HelpCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden /> <span className="hidden sm:inline">Help</span>
      </Link>
      <button
        type="button"
        onClick={leave}
        disabled={signingOut}
        aria-label="Sign out"
        className="inline-flex items-center gap-1 rounded-full p-1.5 hover:bg-gray-100 disabled:opacity-60 sm:px-2.5"
      >
        <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
      </button>
    </nav>
  );
}
