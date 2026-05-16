import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const subRoles = [
  "Brand Owner / Founder",
  "Sourcing / Purchase Manager",
  "Merchandiser / Production Coordinator",
  "Designer / Design Head",
  "Buying House / Buying Agent",
  "Retail Chain / Institutional Buyer",
];

const SubRole = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (role: string) => {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <h1 className="font-logo text-accent text-2xl font-bold italic uppercase tracking-[-0.08em] text-center mb-8">Cosora</h1>

        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-2">
          What best describes you?
        </h2>
        <p className="text-muted-foreground text-sm text-center mb-8">Select all that apply</p>

        <div className="grid grid-cols-1 gap-3 mb-8">
          {subRoles.map((role) => {
            const isSelected = selected.includes(role);
            return (
              <button
                key={role}
                onClick={() => toggle(role)}
                className={`flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                  isSelected
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40"
                }`}
              >
                <span className="text-sm font-medium text-foreground">{role}</span>
                {isSelected && <Check className="w-5 h-5 text-accent flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        <Button
          onClick={() => navigate("/auth/account-info")}
          disabled={selected.length === 0}
          className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
        >
          Continue
        </Button>
      </motion.div>
    </div>
  );
};

export default SubRole;
