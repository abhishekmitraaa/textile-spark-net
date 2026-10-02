import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/contexts/UserRoleContext";

/**
 * Entry point for "Post RFQ" links that arrive from outside this app, chiefly
 * the Cosora Journal at /blogs, which is a separate Next.js app proxied onto
 * this origin and has no access to the session.
 *
 * Because the blog is served from www.cosora.in, it shares this origin, and the
 * Supabase session lives in localStorage here. So a signed-in reader clicking
 * through is already authenticated: this route only has to decide where they
 * belong.
 *
 *   signed-in buyer   -> the RFQ form
 *   signed-in vendor  -> their dashboard, since vendors answer RFQs rather than post them
 *   signed out        -> the landing page
 *
 * Deliberately not a redirect-after-login flow: nothing in this app carries an
 * intended destination through login today, and the Google OAuth round trip
 * would need its own carrier to survive.
 */
export default function GoPostRfq() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { role } = useUserRole();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/", { replace: true });
      return;
    }

    // profile.active_role is the stored source of truth; the role context is the
    // live view of it and wins when the user has toggled sides this session.
    const seller = role === "seller" || profile?.active_role === "seller";
    navigate(seller ? "/seller-home" : "/requirement/post-requirement", { replace: true });
  }, [loading, user, profile, role, navigate]);

  // Deliberately blank rather than a spinner: the decision resolves in a frame
  // or two once the session is read, and a flashed spinner reads worse.
  return <div className="min-h-screen bg-white" aria-busy="true" />;
}
