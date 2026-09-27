import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { syncLanguageForUser } from "@/lib/languagePreference";

// Applies the signed-in account's saved language once per account per page
// load: at sign-in, and when the app opens with a session already there.
// A later change on this device goes through chooseLang(), which saves it.
export default function LanguageSync() {
  const { user } = useAuth();
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!user) { synced.current = null; return; }
    if (synced.current === user.id) return;
    synced.current = user.id;
    syncLanguageForUser(user).catch(() => { /* the device keeps its language; the next pick saves again */ });
  }, [user]);

  return null;
}
