import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type UserRole = "buyer" | "seller";

// localStorage is only a hint for vendorRegistered, per account, so on a shared
// browser one account's flag never answers for another. The old unkeyed value
// can't be attributed to anyone and is dropped.
const LEGACY_VENDOR_REGISTERED_KEY = "cosora.vendorRegistered";
const hintKey = (accountId: string) => `cosora.vendorRegistered.${accountId}`;

function readHint(accountId: string): boolean {
  try {
    return localStorage.getItem(hintKey(accountId)) === "true";
  } catch {
    return false;
  }
}

function writeHint(accountId: string, v: boolean) {
  try {
    localStorage.setItem(hintKey(accountId), String(v));
  } catch {
    /* storage unavailable: the database value still applies */
  }
}

/** profiles.active_role → the side the app shows. */
const sideOf = (activeRole: string | undefined): UserRole =>
  activeRole === "seller" || activeRole === "vendor" ? "seller" : "buyer";

// Marks a role set before the signed-in profile arrived (OtpVerify sets it at
// sign-in while AuthContext is still loading), so the load keeps it.
const BEFORE_PROFILE = "(before profile)";

interface UserRoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  toggleRole: () => void;
  /** True once the user has completed the full vendor registration. */
  vendorRegistered: boolean;
  setVendorRegistered: (v: boolean) => void;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export const UserRoleProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const accountId = profile?.id ?? null;
  const accountRef = useRef<string | null>(accountId);
  accountRef.current = accountId;

  // ── The side on load (MPF-13) ──
  // profiles.active_role is the side the account is on. It seeds `role` once per
  // account per page load, when the profile arrives. Every page load used to
  // start as buyer, so a vendor who refreshed got the buyer sidebar and nav.
  // A role set after that, or before it (see BEFORE_PROFILE), stands for the
  // rest of the session: an in-app switch isn't undone by a profile refetch. A
  // hard reload seeds from active_role again.
  const [role, setRoleState] = useState<UserRole>("buyer");
  const settledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      // Signed out: forget the account and go back to the default side.
      if (settledFor.current !== null && settledFor.current !== BEFORE_PROFILE) {
        settledFor.current = null;
        setRoleState("buyer");
      }
      return;
    }
    if (settledFor.current === accountId) return;
    if (settledFor.current === BEFORE_PROFILE) {
      settledFor.current = accountId;
      return;
    }
    settledFor.current = accountId;
    setRoleState(sideOf(profile?.active_role));
  }, [accountId, profile?.active_role]);

  const setRole = useCallback((next: UserRole) => {
    settledFor.current = accountRef.current ?? BEFORE_PROFILE;
    setRoleState(next);
  }, []);

  const toggleRole = useCallback(() => {
    settledFor.current = accountRef.current ?? BEFORE_PROFILE;
    setRoleState((prev) => (prev === "buyer" ? "seller" : "buyer"));
  }, []);

  // ── vendorRegistered (MPF-13) ──
  // The database decides: vendor_profiles.onboarding_complete, which the vendor
  // registration sets (Mitra's call: that column alone, not active_role). It
  // used to live only in localStorage, so a buyer who had registered went
  // through /onboarding again on a second device. The account's localStorage
  // hint answers only until the read returns, and is corrected to match it.
  const registration = useQuery({
    queryKey: ["vendor_registered", accountId],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select("onboarding_complete")
        .eq("id", accountId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.onboarding_complete === true;
    },
    enabled: Boolean(accountId),
  });

  const hint = useMemo(() => (accountId ? readHint(accountId) : false), [accountId]);
  const vendorRegistered = accountId ? registration.data ?? hint : false;

  useEffect(() => {
    if (accountId && registration.data !== undefined) writeHint(accountId, registration.data);
  }, [accountId, registration.data]);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_VENDOR_REGISTERED_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Called by Onboarding once its write (onboarding_complete = true) succeeded,
  // so the cached database answer agrees with it at once.
  const setVendorRegistered = useCallback(
    (v: boolean) => {
      const id = accountRef.current;
      if (!id) return;
      writeHint(id, v);
      queryClient.setQueryData(["vendor_registered", id], v);
    },
    [queryClient],
  );

  return (
    <UserRoleContext.Provider
      value={{ role, setRole, toggleRole, vendorRegistered, setVendorRegistered }}
    >
      {children}
    </UserRoleContext.Provider>
  );
};

export const useUserRole = () => {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error("useUserRole must be used within a UserRoleProvider");
  }
  return context;
};
