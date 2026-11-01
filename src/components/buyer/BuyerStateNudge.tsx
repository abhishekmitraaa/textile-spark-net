import { useNavigate } from "react-router-dom";
import { MapPin, X } from "lucide-react";

// Ranking Fit (documentation/ranking-fit-design-2026-11-01.md): a seller's lead feed puts requirements from
// buyers in its state, or a state it serves, higher, and reads the buyer's state from their business details.
// A buyer without one is asked for it on Profile and My Quotes; never on the requirement form (Mitra, 2026-10-07).
// Shown when stateCodeFor(profile state) is null: a state the database can't turn into the code Fit compares.

export default function BuyerStateNudge({ onDismiss, className = "" }: { onDismiss: () => void; className?: string }) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-brand-buyer/20 bg-brand-buyer/5 px-4 py-3 ${className}`}>
      <MapPin className="h-4 w-4 shrink-0 text-brand-buyer" />
      <p className="min-w-0 flex-1 text-sm text-gray-700">
        <span className="font-semibold text-gray-900">Add your state</span>{" "}
        so suppliers near you see your requirements sooner.
      </p>
      <button
        onClick={() => navigate("/profile/business-details?focus=state")}
        className="shrink-0 rounded-xl bg-brand-buyer px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-buyer/90"
      >
        Add state
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
