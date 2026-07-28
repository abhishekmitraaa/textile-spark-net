import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingCart, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";

// Gradients and proportions follow the Canva reference: the coloured panel is
// the dominant element of each card (a near-square block filling the card's
// top portion), not a small icon chip. Both gradients run straight down —
// buyer bright-to-deep red, seller indigo-to-black.
const roles = [
  {
    id: "buyer",
    label: "BUYER",
    icon: ShoppingCart,
    description: "I am a Brand Owner, Sourcing Manager, or I run a retail chain",
    bg: "bg-gradient-to-b from-[#ff3752] to-[#cf0006]",
  },
  {
    id: "seller",
    label: "SELLER",
    icon: Store,
    description: "I am a Manufacturer, Supplier, Freelancer, or Service Provider",
    bg: "bg-gradient-to-b from-[#3432c7] to-[#000000]",
  },
];

const RoleSelection = () => {
  const navigate = useNavigate();
  const { session, chooseRole } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected || saving) return;
    // For a signed-in (e.g. Google) user, persist the role now so future
    // sign-ins skip this screen and land on their side directly.
    if (session) {
      setSaving(true);
      try { await chooseRole(selected as "buyer" | "seller"); } catch { /* non-blocking */ }
      setSaving(false);
    }
    if (selected === "buyer") navigate("/auth/sub-role");
    else navigate("/seller");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        {/* COSORA wordmark */}
        <div className="flex justify-center mb-1">
          <CosoraLogo height={30} />
        </div>
        <p className="text-center text-xs text-gray-400 mb-10">Business Made Easy &amp; Enjoyable</p>

        <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">I am a..</h2>
        <p className="text-sm text-gray-500 text-center mb-8">Select your role and get started</p>

        {/* Role cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {roles.map(role => {
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelected(role.id)}
                className={cn(
                  "relative flex flex-col items-center gap-3 rounded-xl border-2 bg-white p-3 text-left transition-colors",
                  isSelected ? "border-gray-900" : "border-gray-200 hover:border-gray-300"
                )}
              >
                {/* Sits on the gradient, so it needs the white ring to read
                    against both the deep red and the near-black. */}
                {isSelected && (
                  <div className="absolute top-5 right-5 z-10 w-5 h-5 bg-green-500 ring-2 ring-white rounded-full flex items-center justify-center text-white text-xs">
                    ✓
                  </div>
                )}
                <div className={cn("w-full aspect-square rounded-lg flex flex-col items-center justify-center gap-2", role.bg)}>
                  <role.icon className="w-9 h-9 text-white" strokeWidth={1.75} />
                  <span className="text-[11px] font-bold text-white tracking-wide">{role.label}</span>
                </div>
                <p className="text-xs text-gray-600 text-center leading-snug">{role.description}</p>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected || saving}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            // Active state is the buyer brand coral, per the Canva reference.
            // The disabled state is deliberately untouched.
            selected && !saving
              ? "bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : "Continue"}
        </button>

        <p className="text-sm text-gray-500 text-center mt-5">
          Already have an account?{" "}
          <Link to="/auth/login" className="text-[#a4172c] font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default RoleSelection;