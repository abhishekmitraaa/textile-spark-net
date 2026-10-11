import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import CategoryPickerGrid from "@/components/buyer/CategoryPickerGrid";
import { usePreferences, setCategories } from "@/lib/preferencesStore";
import { OTHER_INTEREST_ID, tidyOtherInterest } from "@/lib/buyerCategories";

// Buyer registration interests. These are the shared buyer categories used by
// the For You feed + profile, so selections here persist to the same real,
// account-tied place (buyer_profiles.preferred_categories via the store) and
// show up everywhere the buyer's preferences are used.
//
// Layout follows the Interest Preference design (2026-10-11): titled header,
// a note on what the picks are for, the photo grid, and Save pinned to the
// bottom so it stays in reach on a phone while the grid scrolls.

const InterestPreference = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  // Same screen serves two routes: the registration step (/auth/...) and the
  // later "edit my interests" flow (/profile/...). Branch navigation so a buyer
  // editing preferences isn't dropped back into the signup flow.
  const inProfile = useLocation().pathname.startsWith("/profile");
  const prefs = usePreferences();
  const [selected, setSelected] = useState<string[]>(prefs.categories);
  const [otherText, setOtherText] = useState(prefs.otherInterest);
  // Mirror store→local until the buyer starts editing, so a signed-in buyer who
  // already has saved preferences sees them pre-selected once the store hydrates.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setSelected(prefs.categories);
    setOtherText(prefs.otherInterest);
  }, [prefs.categories, prefs.otherInterest]);

  const toggle = (id: string) => {
    touched.current = true;
    setSelected((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };
  const editOther = (v: string) => {
    touched.current = true;
    setOtherText(v);
  };

  // "Others" counts once it says what: an empty Others is no interest at all.
  const otherOn = selected.includes(OTHER_INTEREST_ID);
  const otherMissing = otherOn && tidyOtherInterest(otherText) === "";
  const isValid = selected.length > 0 && !otherMissing;
  const count = selected.length;

  const handleSave = () => {
    if (!isValid) return;
    // Persist to the real account-tied store (DB when signed in, local otherwise).
    setCategories(selected, otherOn ? tidyOtherInterest(otherText) : "");
    // Registration → continue to terms; profile edit → back to the profile page.
    navigate(inProfile ? "/profile" : "/auth/terms");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => navigate(inProfile ? "/profile" : "/auth/account-info")}
            aria-label="Back"
            className="rounded-full p-1.5 text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-buyer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Interest Preference</h1>
        </div>
      </header>

      <motion.main
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28"
      >
        <div className="rounded-xl bg-gray-50 px-4 py-3.5">
          <p className="text-sm font-semibold text-gray-900">Select your preferred brands or product information.</p>
          <p className="mt-1 text-xs text-gray-500">We will recommend brands and products based on your selections.</p>
        </div>

        <div className="mt-5 mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-gray-900">Your Interest</h2>
          {count > 0 && <span className="text-xs font-medium text-brand-buyer">{`${count} selected`}</span>}
        </div>

        <CategoryPickerGrid
          selected={selected}
          onToggle={toggle}
          otherText={otherText}
          onOtherTextChange={editOther}
        />
      </motion.main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {otherMissing && (
            <p className="mb-2 text-center text-xs text-gray-500">Tell us what “Others” is, or unselect it.</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className={cn(
              "w-full py-3.5 text-sm font-bold rounded-xl transition-colors active:scale-[0.99]",
              isValid
                ? "bg-brand-buyer hover:bg-brand-buyer/90 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            )}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default InterestPreference;
