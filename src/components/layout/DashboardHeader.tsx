 import { Bell, Search, Plus, Menu, FileText, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { RoleSwitcher } from "./RoleSwitcher";
import { useUserRole } from "@/contexts/UserRoleContext";

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

export const DashboardHeader = ({ onMenuClick }: DashboardHeaderProps) => {
  const { role } = useUserRole();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:h-16 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu size={22} />
        </button>

        {/* Desktop Role Switcher */}
        <div className="hidden lg:block">
          <RoleSwitcher variant="desktop" />
        </div>

        {/* Search - hidden on mobile, shown on tablet+ */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={role === "buyer" ? "Search products, vendors..." : "Search products, leads..."}
            className="w-48 pl-10 md:w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
       {/* Admin Button */}
       <Link to="/admin">
         <Button variant="outline" size="sm" className="hidden sm:inline-flex gap-2 border-primary/30 text-primary hover:bg-primary/10">
           <Shield className="h-4 w-4" />
           Admin
         </Button>
         <Button variant="outline" size="icon" className="h-9 w-9 sm:hidden border-primary/30 text-primary hover:bg-primary/10">
           <Shield className="h-4 w-4" />
         </Button>
       </Link>
 
        {/* Mobile search button */}
        <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:hidden">
          <Search size={20} />
        </button>

        {role === "buyer" ? (
          <Link to="/quotes">
            <Button variant="gold" size="sm" className="hidden sm:inline-flex">
              <FileText className="mr-2 h-4 w-4" />
              Request Quote
            </Button>
            <Button variant="gold" size="icon" className="h-9 w-9 sm:hidden">
              <FileText className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Link to="/upload">
            <Button variant="gold" size="sm" className="hidden sm:inline-flex">
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Button>
            <Button variant="gold" size="icon" className="h-9 w-9 sm:hidden">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
        )}

        <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Bell size={20} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
};
