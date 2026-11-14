import { useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
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
  return <>{children}</>;
}
