import { Navigate } from "react-router-dom";
import { useUserRole } from "@/contexts/UserRoleContext";

// /dashboard showed invented figures and products to everyone ("+18% vs last month", "$24.99/yard") and nothing
// linked to it (2026-11-05; ToDo "Remove invented claims"). It now sends you to your real home, the same one
// the header's logo opens.
export default function RoleHomeRedirect() {
  const { role } = useUserRole();
  return <Navigate to={role === "buyer" ? "/home/new-arrivals" : "/seller-home"} replace />;
}
