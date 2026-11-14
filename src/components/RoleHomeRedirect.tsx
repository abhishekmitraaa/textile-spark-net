import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// /dashboard showed invented figures and products to everyone ("+18% vs last month", "$24.99/yard") and nothing
// linked to it (2026-11-14; ToDo "Remove invented claims"). It now sends you to your real home, the one the header's
// logo opens. It waits for sign-in to settle: the role context starts as buyer until the profile arrives, so
// reading it at once sent sellers to the buyer home.
export default function RoleHomeRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  const seller = profile?.active_role === "seller" || profile?.active_role === "vendor";
  return <Navigate to={seller ? "/seller-home" : "/home/new-arrivals"} replace />;
}
