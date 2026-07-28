import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import CategoryPickerGrid from "@/components/buyer/CategoryPickerGrid";
import { usePreferences, setCategories } from "@/lib/preferencesStore";

// Buyer registration interests. These are the shared buyer categories used by
// the For You feed + profile, so selections here persist to the same real,
// account-tied place (buyer_profiles.preferred_categories via the store) and
// show up everywhere the buyer's preferences are used.

const InterestPreference = () => {
  const navigate = useNavigate();
  // Same screen serves two routes: the registration step (/auth/...) and the
  // later "edit my interests" flow (/profile/...). Branch navigation so a buyer
  // editing preferences isn't dropped back into the signup flow.
  const inProfile = useLocation().pathname.startsWith("/profile");
  const prefs = usePreferences();
  const [selected, setSelected] = useState<string[]>(prefs.categories);
  const [query, setQuery] = useState("");
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
    // Registration → continue to terms; profile edit → back to the profile page.
    navigate(inProfile ? "/profile" : "/auth/terms");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-5 py-6">
      {/* Back arrow */}
      <button onClick={() => navigate(inProfile ? "/profile" : "/auth/account-info")} className="mb-2 -ml-1 p-1.5 self-start">
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-lg mx-auto w-full"
      >
        {/* Same question, same wording and same control as the For You
            preference step on the buyer side — see CategoryPickerGrid. */}
        <div className="text-center mb-5">
          <h1 className="text-xl font-bold text-gray-900">What are you looking to source?</h1>
          <p className="mt-1.5 text-sm text-gray-500">Select all that apply</p>
        </div>

        <CategoryPickerGrid selected={selected} onToggle={toggle} query={query} setQuery={setQuery} />

        <button
          onClick={handleSave}
          disabled={!isValid}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors mt-6 active:scale-[0.99]",
            isValid
              ? "bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white"
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
