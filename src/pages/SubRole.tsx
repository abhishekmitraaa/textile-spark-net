import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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
    setSelected(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-6">
      {/* Back arrow */}
      <button onClick={() => navigate("/auth/role-selection")} className="mb-4 -ml-1 p-1.5">
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        <h2 className="text-xl font-bold text-gray-900 mb-1">What best describes you?</h2>
        <p className="text-sm text-gray-400 mb-6">Select your primary role</p>

        <div className="space-y-1 mb-8">
          {subRoles.map(role => {
            const isSelected = selected.includes(role);
            return (
              <button
                key={role}
                onClick={() => toggle(role)}
                className="w-full flex items-center gap-3 py-3.5 text-left border-b border-gray-100 last:border-0"
              >
                <span className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isSelected ? "border-[#a4172c]" : "border-gray-300"
                )}>
                  {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-[#a4172c]" />}
                </span>
                <span className="text-sm text-gray-800">{role}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => navigate("/auth/account-info")}
          disabled={selected.length === 0}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            selected.length > 0
              ? "bg-[#a4172c] hover:bg-[#8c1325] text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          Continue
        </button>

        <p className="text-sm text-gray-500 text-center mt-5">
          Already have an account?{" "}
          <Link to="/auth/login" className="text-[#a4172c] font-semibold hover:underline">
            Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default SubRole;