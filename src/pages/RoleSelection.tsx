import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Building2 } from "lucide-react";

const roles = [
  {
    id: "buyer",
    label: "BUYER",
    icon: ShoppingBag,
    description: "I am a Brand Owner, Sourcing Manager, or I run a retail chain",
  },
  {
    id: "seller",
    label: "SELLER",
    icon: Building2,
    description: "I am a Manufacturer, Supplier, Freelancer, or Service Provider",
  },
];

const RoleSelection = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const handleContinue = () => {
    if (selected === "buyer") navigate("/auth/sub-role");
    if (selected === "seller") navigate("/register");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md text-center"
      >
        <h1 className="font-display text-accent text-2xl italic mb-8">Cosora</h1>

        <h2 className="font-display text-2xl font-bold text-foreground mb-2">I am a..</h2>
        <p className="text-muted-foreground text-sm mb-8">Select your role and get started</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {roles.map((role) => {
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelected(role.id)}
                className={`rounded-xl border-2 p-6 text-left transition-all ${
                  isSelected
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40"
                }`}
              >
                <role.icon
                  className={`w-8 h-8 mb-3 ${isSelected ? "text-accent" : "text-muted-foreground"}`}
                />
                <p className="font-semibold text-foreground text-sm mb-1">{role.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{role.description}</p>
              </button>
            );
          })}
        </div>

        <Button
          onClick={handleContinue}
          disabled={!selected}
          className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
        >
          Continue
        </Button>

        <p className="text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Sign In
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default RoleSelection;
