import { useRef, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerRegistration, type SellerRegistrationStatus } from "@/lib/queries/sellerRegistration";
import { RegistrationPending } from "@/components/vendor/RegistrationPending";

/**
 * Wraps the screens a seller's registration passes through. A registered (or exempt) seller goes to Seller Home;
 * with `showPending`, an overseas seller waiting for approval sees that instead of the form.
 *
 * It waits for the database's answer (my_seller_registration) before deciding. It used to decide on the first
 * render from a localStorage hint, so a registered seller on a new browser was shown the empty form and could
 * register again (onboarding audit #4). The answer is then kept for the visit: registering turns it to
 * "registered" while the welcome screen is still showing, and that must not jump away mid-screen.
 */
export default function RegisteredVendorGate({ children, showPending = false }: { children: ReactNode; showPending?: boolean }) {
  const { user, loading } = useAuth();
  const registration = useSellerRegistration(user?.id);
  const onArrival = useRef<SellerRegistrationStatus | null>(null);

  if (loading) return null;
  // Signed out: the form explains that a registration needs an account.
  if (!user) return <>{children}</>;
  if (registration.isPending) return null;
  // The read failed: show the form; the database refuses a second registration on its own.
  if (registration.isError) return <>{children}</>;
  if (onArrival.current === null) onArrival.current = registration.data.status;

  if (onArrival.current === "registered" || onArrival.current === "exempt") return <Navigate to="/seller-home" replace />;
  if (onArrival.current === "pending" && showPending) return <RegistrationPending />;
  return <>{children}</>;
}
