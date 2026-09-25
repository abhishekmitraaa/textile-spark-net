import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUserRole, UserRole } from "@/contexts/UserRoleContext";

// Central Buyer/Seller switch used by every in-app role toggle.
//
// Buyer → Seller: the seller side needs far more information (business, PAN,
// owner, photos…), so the first switch routes into the full vendor registration
// at /onboarding. Once that's completed the `vendorRegistered` flag is set and
// every later switch goes straight to the seller dashboard.
//
// Seller → Buyer: only for a seller who has completed that registration (Mitra,
// 2026-09-25, MPF-22). Onboarding collects everything the buyer side needs, so a
// completed registration is what makes the buyer side available; a seller-role
// account without one (a signup that stopped part-way, or a seeded account) is
// sent to /onboarding to finish it first. Afterwards both directions are free.
// `vendorRegistered` is vendor_profiles.onboarding_complete (UserRoleContext).
export function useSwitchRole() {
  const navigate = useNavigate();
  const { setRole, vendorRegistered } = useUserRole();

  return (nextRole: UserRole) => {
    if (nextRole === "seller") {
      if (vendorRegistered) {
        setRole("seller");
        navigate("/seller-home");
      } else {
        // Role flips to seller only after registration completes (in Onboarding).
        navigate("/onboarding");
      }
    } else if (vendorRegistered) {
      setRole("buyer");
      navigate("/home/new-arrivals");
    } else {
      toast("Finish your seller registration to use the buyer side");
      navigate("/onboarding");
    }
  };
}
