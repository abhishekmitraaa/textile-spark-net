import { useRef, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/contexts/UserRoleContext";

/**
 * Wraps the screens a seller's registration passes through. They stay in the
 * browser's history under Seller Home, so the back button used to reopen an
 * empty registration form for a seller who had just finished it. A seller who
 * is already registered on arrival goes to Seller Home instead.
 *
 * Decided once, on arrival: registration itself turns the answer true while
 * its last screen is still showing.
 */
export default function RegisteredVendorGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const { vendorRegistered } = useUserRole();
  const registeredOnArrival = useRef<boolean | null>(null);
  if (loading) return null;
  if (registeredOnArrival.current === null) registeredOnArrival.current = vendorRegistered;
  if (registeredOnArrival.current) return <Navigate to="/seller-home" replace />;
  return <>{children}</>;
}
