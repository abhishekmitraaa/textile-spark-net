import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingCart, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const roles = [
  {
    id: "buyer",
    label: "BUYER",
    icon: ShoppingCart,
    description: "I am a Brand Owner, Sourcing Manager, or I run a retail chain",
    bg: "bg-[#a4172c]",
  },
  {
    id: "seller",
    label: "SELLER",
    icon: Store,
    description: "I am a Manufacturer, Supplier, Freelancer, or Service Provider",
    bg: "bg-[#1b2a52]",
  },
];

const RoleSelection = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const handleContinue = () => {
    if (selected === "buyer") navigate("/auth/sub-role");
    if (selected === "seller") navigate("/seller");
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
        <h1 className="font-logo text-center text-3xl font-extrabold italic text-[#a4172c] uppercase tracking-tight mb-1">
          COSORA
        </h1>
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
                  "relative flex flex-col items-center gap-3 rounded-2xl border-2 p-5 transition-all",
                  isSelected ? "border-gray-900" : "border-transparent"
                )}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">
                    ✓
                  </div>
                )}
                <div className={cn("w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1", role.bg)}>
                  <role.icon className="w-6 h-6 text-white" strokeWidth={1.75} />
                  <span className="text-[9px] font-bold text-white tracking-wide">{role.label}</span>
                </div>
                <p className="text-xs text-gray-600 text-center leading-snug">{role.description}</p>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            selected
              ? "bg-[#a4172c] hover:bg-[#8c1325] text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          Continue
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