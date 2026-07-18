import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUYER_CATEGORIES } from "@/lib/buyerCategories";
import { usePreferences, setCategories } from "@/lib/preferencesStore";

// Buyer registration interests. These are the shared buyer categories used by
// the For You feed + profile, so selections here persist to the same real,
// account-tied place (buyer_profiles.preferred_categories via the store) and
// show up everywhere the buyer's preferences are used.

const InterestPreference = () => {
  const navigate = useNavigate();
  const prefs = usePreferences();
  const [selected, setSelected] = useState<string[]>(prefs.categories);
  // Mirror store→local until the buyer starts editing, so a signed-in buyer who
  // already has saved preferences sees them pre-selected once the store hydrates.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setSelected(prefs.categories);
  }, [prefs.categories]);

  const toggle = (id: string) => {
    touched.current = true;
    setSelected((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  const isValid = selected.length > 0;

  const handleSave = () => {
    // Persist to the real account-tied store (DB when signed in, local otherwise).
    setCategories(selected);
    navigate("/auth/terms");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-5 py-6">
      {/* Back arrow */}
      <button onClick={() => navigate("/auth/account-info")} className="mb-2 -ml-1 p-1.5 self-start">
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-lg mx-auto w-full"
      >
        <h2 className="text-lg font-bold text-gray-900 mb-1">Interest Preference</h2>

        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 mb-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Select the product categories you usually source. We'll use these to recommend brands and products across Cosora.
          </p>
        </div>

        <p className="text-sm font-bold text-gray-800 mb-3">Your Interest</p>

        <div className="grid grid-cols-4 gap-x-3 gap-y-4 mb-2">
          {BUYER_CATEGORIES.map((cat) => {
            const isSelected = selected.includes(cat.id);
            return (
              <button key={cat.id} onClick={() => toggle(cat.id)} className="text-center">
                <div className={cn(
                  "relative aspect-square rounded-full overflow-hidden mb-1.5 ring-2 transition-all flex items-center justify-center bg-gray-50",
                  isSelected ? "ring-[#a4172c]" : "ring-transparent"
                )}>
                  <span className="text-2xl" aria-hidden>{cat.icon}</span>
                  {isSelected && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[#a4172c] flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-gray-600 font-medium leading-tight line-clamp-2">
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleSave}
          disabled={!isValid}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors mt-6",
            isValid
              ? "bg-[#a4172c] hover:bg-[#8c1325] text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          Save
        </button>
      </motion.div>
    </div>
  );
};

export default InterestPreference;
