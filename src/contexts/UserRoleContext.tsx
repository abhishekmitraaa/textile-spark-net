import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type UserRole = "buyer" | "seller";

const VENDOR_REGISTERED_KEY = "cosora.vendorRegistered";

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
  const [role, setRole] = useState<UserRole>("buyer");

  // Persisted: "registered once, never register again" survives reloads.
  const [vendorRegistered, setVendorRegisteredState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(VENDOR_REGISTERED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setVendorRegistered = (v: boolean) => {
    setVendorRegisteredState(v);
    try {
      localStorage.setItem(VENDOR_REGISTERED_KEY, String(v));
    } catch {
      /* storage unavailable — keep in-memory value */
    }
  };

  // An account that is already a seller/vendor has, by definition, completed
  // vendor registration — never send such a user back through onboarding.
  useEffect(() => {
    const r = profile?.active_role;
    if ((r === "seller" || r === "vendor") && !vendorRegistered) {
      setVendorRegistered(true);
    }
  }, [profile?.active_role, vendorRegistered]);

  const toggleRole = () => {
    setRole((prev) => (prev === "buyer" ? "seller" : "buyer"));
  };

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
