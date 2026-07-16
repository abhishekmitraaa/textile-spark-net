import { motion } from "framer-motion";
import { Building2, Factory } from "lucide-react";
import { useUserRole, UserRole } from "@/contexts/UserRoleContext";
import { useSwitchRole } from "@/hooks/useSwitchRole";
import { cn } from "@/lib/utils";

interface RoleSwitcherProps {
  variant?: "desktop" | "mobile";
}

export const RoleSwitcher = ({ variant = "desktop" }: RoleSwitcherProps) => {
  const { role } = useUserRole();
  const switchRole = useSwitchRole();

  const handleRoleSelect = (nextRole: UserRole) => {
    if (nextRole === role) return;
    switchRole(nextRole);
  };

  const roles: { value: UserRole; label: string; icon: typeof Building2 }[] = [
    { value: "buyer", label: "Buyer", icon: Building2 },
    { value: "seller", label: "Seller", icon: Factory },
  ];

  const getActiveBackground = (roleValue: UserRole) =>
    roleValue === "seller" ? "bg-[#256fef]" : "bg-accent";

  if (variant === "mobile") {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-sidebar-accent/50 p-1">
        {roles.map((r) => (
          <button
            key={r.value}
            onClick={() => handleRoleSelect(r.value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
              role === r.value
                ? "text-accent-foreground"
                : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
            )}
          >
            {role === r.value && (
              <motion.div
                layoutId="role-switcher-mobile"
                className={cn("absolute inset-0 rounded-md", getActiveBackground(r.value))}
                transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
              />
            )}
            <r.icon size={14} className="relative z-10" />
            <span className="relative z-10">{r.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
      {roles.map((r) => (
        <button
          key={r.value}
          onClick={() => handleRoleSelect(r.value)}
          className={cn(
            "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            role === r.value
              ? "text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {role === r.value && (
            <motion.div
              layoutId="role-switcher-desktop"
              className={cn("absolute inset-0 rounded-md shadow-gold", getActiveBackground(r.value))}
              transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
            />
          )}
          <r.icon size={16} className="relative z-10" />
          <span className="relative z-10">{r.label}</span>
        </button>
      ))}
    </div>
  );
};
