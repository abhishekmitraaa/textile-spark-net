import { Search } from "lucide-react";
import { BUYER_CATEGORIES } from "@/lib/buyerCategories";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// The buyer-side category picker: searchable two-column tiles with the
// category emoji and a readable label, coral when active.
//
// Extracted verbatim from ForYou's onboarding/"Edit Preferences" picker so the
// registration interest step can use the SAME component rather than a
// look-alike. Previously that step had its own cramped 4-column emoji-circle
// grid in the old maroon, so the two surfaces asking the identical question
// looked like they belonged to different products.
//
// Presentational only: the caller owns `selected` and `onToggle`, because
// ForYou writes straight through to the preferences store while the
// registration step holds a local draft until Save.
// ─────────────────────────────────────────────────────────────

interface Props {
  selected: string[];
  onToggle: (id: string) => void;
  query: string;
  setQuery: (v: string) => void;
}

export default function CategoryPickerGrid({ selected, onToggle, query, setQuery }: Props) {
  const filtered = BUYER_CATEGORIES.filter((c) =>
    c.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product types"
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((cat) => {
          const active = selected.includes(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => onToggle(cat.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border-2 p-3 transition-all active:scale-[0.98]",
                active ? "border-[#ef4d62] bg-[#ef4d62]/5" : "border-gray-200 hover:border-[#ef4d62]/40",
              )}
            >
              <span className="text-xl">{cat.icon}</span>
              <span className="text-sm font-medium text-gray-800 text-left">{cat.label}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-gray-400">No types match</p>
        )}
      </div>
    </div>
  );
}
