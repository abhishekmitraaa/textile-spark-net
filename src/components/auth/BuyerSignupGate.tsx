import { useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlag } from "@/lib/queries/featureFlags";
import { useSellerRegistration } from "@/lib/queries/sellerRegistration";

// Pages that stay open whatever state sign-up is in: help is how a stuck account gets out.
const ALWAYS_OPEN = [/^\/help(\/|$)/, /^\/profile\/help(\/|$)/, /^\/report-fraud$/, /^\/feedback$/];

/**
 * Sends a signed-in buyer who hasn't finished sign-up back to it (buyer sign-up audit items 4 and 11d; D3), while the
 * `buyer_signup_required` switch is on for the account:
 *   - not onboarded → role selection (the start of sign-up);
 *   - onboarded but no Terms acceptance recorded → the Terms step, once (accepting records it, so no loop).
 * Never a seller: a seller-side account, or one whose seller registration is registered, exempt or waiting for
 * approval (sellers sign the Supplier Agreement, not the buyer Terms). Signed out, loading, or a failed read: no
 * redirect. This is navigation; the database decides what an account may do.
 */
export default function BuyerSignupGate({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const { pathname } = useLocation();
  const on = useFeatureFlag("buyer_signup_required") === true;
  const registration = useSellerRegistration(on && user ? user.id : undefined);
  // Once the page is on screen it stays while the registration is read (2026-11-19, review M-01): it used to render
  // the page, then nothing, then the page again, so it mounted twice and its ads were counted twice.
  const shown = useRef(false);
  const page = () => { shown.current = true; return <>{children}</>; };

  if (!on || loading || !user || !profile || profile.id !== user.id) return page();
  if (ALWAYS_OPEN.some((re) => re.test(pathname))) return page();
  if (profile.active_role === "seller") return page();
  if (registration.isPending) return shown.current ? page() : null;
  const seller = registration.data?.status;
  if (registration.isError || seller === "registered" || seller === "exempt" || seller === "pending") return page();

  if (!profile.onboarded) return <Navigate to="/auth/role-selection" replace />;
  if (!profile.terms_version) return <Navigate to="/auth/terms" replace />;
  return page();
}
