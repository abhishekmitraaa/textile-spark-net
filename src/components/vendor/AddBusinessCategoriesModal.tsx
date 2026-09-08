import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { CATEGORY_GROUPS } from "@/data/businessCategoryGroups";

// ─────────────────────────────────────────────────────────────
// The business-category picker, shared by /onboarding and /business-profile.
//
// Both surfaces write the same column (vendor_profiles.category), so they use
// this one component rather than two copies that drift. It is presentational:
// it hands the caller a finished list on "Proceed" and knows nothing about
// persistence — /business-profile saves optimistically through
// saveVendorProfile, /onboarding holds the list until the registration is
// submitted.
//
// Vendor blue is #256fef throughout. A default shadcn <Button> or bg-primary
// here would render the BUYER coral (#ef4d62) on a vendor page.
// ─────────────────────────────────────────────────────────────

function SelectCategoryModal({
  isOpen, onClose, selected, onToggle,
}: {
  isOpen: boolean;
  onClose: () => void;
  selected: string[];
  onToggle: (cat: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return CATEGORY_GROUPS;
    const q = search.toLowerCase();
    return CATEGORY_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [search]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <h3 className="text-base font-bold text-gray-900">Add Business Categories</h3>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs text-[#256fef] font-semibold mb-2">Add Categories</p>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories..."
              className="bg-transparent flex-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-10">No results for "{search}"</p>}
          {filtered.map((group) => (
            <div key={group.group}>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">{group.group}</p>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => {
                  const isSel = selected.includes(item);
                  return (
                    <button
                      key={item}
                      onClick={() => onToggle(item)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        isSel
                          ? "bg-[#256fef] text-white border-[#256fef]"
                          : "bg-white text-gray-700 border-gray-300 hover:border-[#256fef]/60"
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-3 bg-[#256fef] text-white font-bold rounded-xl hover:bg-[#1d5ed6] transition-colors">
            Done {selected.length > 0 && `(${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddBusinessCategoriesModal({
  isOpen, onClose, categories, onCategoriesChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onCategoriesChange: (cats: string[]) => void;
}) {
  const [showSelect, setShowSelect] = useState(false);
  const [local, setLocal] = useState<string[]>(categories);
  const toggle = (cat: string) =>
    setLocal((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));

  // This component stays mounted while closed, so `local` would otherwise keep
  // whatever it was seeded with on first render. That used to be harmless
  // against a hardcoded array; now that `categories` arrives asynchronously
  // from the profile row, a stale seed would let "Proceed" save an empty list
  // over the vendor's real categories. Re-seed each time the sheet opens.
  useEffect(() => { if (isOpen) setLocal(categories); }, [isOpen, categories]);

  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50">
        <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
            <h3 className="text-base font-bold text-gray-900">Add Business Categories</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-sm text-gray-600 mb-1">
              Categories describe what your business is and the products and services your business offers.
              Please add at least one category for customers to find your business.
            </p>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 mt-5">Selected Categories</p>
            {local.length === 0 && <p className="text-sm text-gray-400 mb-4">No categories added yet.</p>}
            <div className="flex flex-wrap gap-2 mb-4">
              {local.map((cat) => (
                <span key={cat} className="flex items-center gap-1.5 bg-[#256fef] text-white text-xs font-medium px-3 py-1.5 rounded-full">
                  {cat}
                  <button onClick={() => toggle(cat)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <button onClick={() => setShowSelect(true)} className="flex items-center gap-1.5 text-[#256fef] font-semibold text-sm">
              <span className="text-lg font-bold">+</span> Add New Category
            </button>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 space-y-3">
            <button
              onClick={() => setShowSelect(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-[#256fef] text-[#256fef] font-bold rounded-xl hover:bg-[#256fef]/5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
            <button
              onClick={() => { onCategoriesChange(local); onClose(); }}
              className="w-full py-3 bg-[#256fef] text-white font-bold rounded-xl hover:bg-[#1d5ed6] transition-colors"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>
      <SelectCategoryModal isOpen={showSelect} onClose={() => setShowSelect(false)} selected={local} onToggle={toggle} />
    </>
  );
}
