import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { setSavedUser } from "@/lib/savedStore";
import { setRecentUser } from "@/lib/recentlyViewedStore";
import { setPreferencesUser } from "@/lib/preferencesStore";

// Bridges auth state into the buyer-side stores: on sign-in they hydrate from
// the DB (Saved wishlist + Recently Viewed + category preferences) and mirror
// mutations there; on sign-out they revert to the local (localStorage) state.
//
// It also empties the data cache when an account signs out or another signs in
// (2026-10-19). The cache outlived sign-out, so on a shared phone the next
// account briefly saw the previous one's support requests, quotes and chats
// until each screen refetched. resetQueries drops every cached answer and
// refetches the ones on screen, now as the new account (or as a visitor).
// Renders nothing.
export default function StoreSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const uid = user?.id ?? null;
    void setSavedUser(uid);
    void setRecentUser(uid);
    void setPreferencesUser(uid);
    // Not on the first run (the page just loaded), and not for a visitor signing in: nothing of anyone's is cached.
    if (previous.current && previous.current !== uid) void queryClient.resetQueries();
    previous.current = uid;
  }, [user?.id, queryClient]);
  return null;
}
