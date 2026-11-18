import { useUserRole } from "@/contexts/UserRoleContext";

/**
 * The home of the side the person is on: where a shared page's Back goes when there is nothing in this app to go back
 * to (Terms, Privacy, Help opened from a link or a new tab). Sellers on the seller side get Seller Home.
 */
export function useHomePath(): "/seller-home" | "/home/new-arrivals" {
  const { role } = useUserRole();
  return role === "seller" ? "/seller-home" : "/home/new-arrivals";
}
