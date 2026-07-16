import { useNavigate } from "react-router-dom";
import { useUserRole, UserRole } from "@/contexts/UserRoleContext";

// Central Buyer/Seller switch used by every in-app role toggle.
//
// Buyer → Seller: the seller side needs far more information (business, PAN,
// owner, photos…), so the first switch routes into the full vendor registration
// at /onboarding. Once that's completed the `vendorRegistered` flag is set and
// every later switch goes straight to the seller dashboard.
//
// Seller → Buyer: always allowed. Vendor data is a superset of buyer data, so
// there's nothing extra to collect — no buyer registration is ever required.
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
    } else {
      setRole("buyer");
      navigate("/home/new-arrivals");
    }
  };
}
