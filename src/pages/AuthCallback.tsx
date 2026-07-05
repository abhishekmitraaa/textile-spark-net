import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// OAuth landing page (Google redirects here).
//
// The Supabase client parses the auth response from the URL automatically
// (detectSessionInUrl), so by the time the session/profile resolve we just
// need to route:
//   - not signed in            → back to /login
//   - first-time user          → /auth/role-selection (pick buyer/seller)
//   - returning user           → their chosen side (buyer home / seller home)
// ─────────────────────────────────────────────────────────────

export default function AuthCallback() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) { navigate("/login", { replace: true }); return; }
    if (!profile) return; // wait for the profile row to load
    if (!profile.onboarded) {
      navigate("/auth/role-selection", { replace: true });
    } else {
      navigate(profile.active_role === "seller" ? "/seller-home" : "/home/new-arrivals", { replace: true });
    }
  }, [loading, session, profile, navigate]);

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
