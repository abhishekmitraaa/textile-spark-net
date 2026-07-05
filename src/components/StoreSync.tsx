import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { setSavedUser } from "@/lib/savedStore";
import { setRecentUser } from "@/lib/recentlyViewedStore";

// Bridges auth state into the buyer-side stores: on sign-in they hydrate from
// the DB (Saved wishlist + Recently Viewed) and mirror mutations there; on
// sign-out they revert to the local (localStorage) seed. Renders nothing.
export default function StoreSync() {
  const { user } = useAuth();
  useEffect(() => {
    const uid = user?.id ?? null;
    void setSavedUser(uid);
    void setRecentUser(uid);
  }, [user?.id]);
  return null;
}
