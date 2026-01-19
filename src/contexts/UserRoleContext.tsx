import { createContext, useContext, useState, ReactNode } from "react";

export type UserRole = "buyer" | "seller";

interface UserRoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  toggleRole: () => void;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export const UserRoleProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<UserRole>("buyer");

  const toggleRole = () => {
    setRole((prev) => (prev === "buyer" ? "seller" : "buyer"));
  };

  return (
    <UserRoleContext.Provider value={{ role, setRole, toggleRole }}>
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
