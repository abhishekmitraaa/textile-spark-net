import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  CATEGORY_TAXONOMY, subCategoryHref, flatSubcategories,
  type TopCategory, type SubCategory,
} from "@/lib/categoryTaxonomy";
import {
  Search, X, ChevronRight, Shirt, Flower2, Baby, Footprints, Watch, Sparkles,
  Package, Layers, Scissors, Wrench, Briefcase, Grid2X2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const grid = { hidden: {}, show: { transition: { staggerChildren: 0.035 } } };
const tile = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.28 } } };

const ICONS: Record<string, typeof Shirt> = {
  Shirt, Flower2, Baby, Footprints, Watch, Sparkles, Package, Layers, Scissors, Wrench, Briefcase,
};

const Categories = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [activeId, setActiveId] = useState(CATEGORY_TAXONOMY[0].id);
  const [query, setQuery] = useState("");

  const active = useMemo(() => CATEGORY_TAXONOMY.find((c) => c.id === activeId)!, [activeId]);

  // Group the active category's subs by their optional `group` header.
  const grouped = useMemo(() => {
    const map = new Map<string, SubCategory[]>();
    for (const s of active.subs) {
      const key = s.group ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()];
  }, [active]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return flatSubcategories()
      .filter(({ category, sub }) => sub.label.toLowerCase().includes(q) || category.label.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query]);

  const go = (cat: TopCategory, s: SubCategory) => navigate(subCategoryHref(cat, s));

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-4">
        {/* Header */}
        <div className="mb-3">
          <h1 className="text-xl font-extrabold text-gray-900">Shop by Category</h1>
          <p className="text-sm text-gray-500">Browse products, services and experts across the supply chain</p>
        </div>

        {/* Cross-category search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories…"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-9 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] focus:bg-white"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* ── Search results overlay ── */}
      {query ? (
        <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24">
          <p className="text-xs text-gray-400 mb-2">{searchResults.length} match{searchResults.length === 1 ? "" : "es"}</p>
          {searchResults.length === 0 ? (
            <div className="py-16 text-center">
              <Grid2X2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No categories match “{query}”.</p>
            </div>
          ) : (
            <motion.div variants={grid} initial="hidden" animate="show" className="divide-y divide-gray-100">
              {searchResults.map(({ category, sub }) => (
                <motion.button
                  key={category.id + sub.label} variants={tile}
                  onClick={() => go(category, sub)}
                  className="w-full flex items-center gap-3 py-3 text-left"
                >
                  <span className="w-9 h-9 rounded-lg bg-[#ef4d62]/10 flex items-center justify-center shrink-0">
                    {(() => { const I = ICONS[category.icon] ?? Grid2X2; return <I className="w-4 h-4 text-[#ef4d62]" />; })()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{sub.label}</span>
                    <span className="block text-[11px] text-gray-400">{category.label}{sub.group ? ` · ${sub.group}` : ""}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>
      ) : (
        /* ── Rail + subcategory panel ── */
        <div className="max-w-2xl lg:max-w-6xl mx-auto px-2 lg:px-6 pb-24 flex gap-2 lg:gap-6">
          {/* Left rail */}
          <div className="w-[86px] lg:w-56 shrink-0">
            <div className="sticky top-[68px] max-h-[calc(100dvh-90px)] overflow-y-auto scrollbar-hide pr-1 space-y-1.5">
              {CATEGORY_TAXONOMY.map((c) => {
                const I = ICONS[c.icon] ?? Grid2X2;
                const on = c.id === activeId;
                return (
                  <button key={c.id} onClick={() => setActiveId(c.id)}
                    className={cn("w-full rounded-xl border p-2 flex flex-col lg:flex-row items-center lg:gap-2.5 text-center lg:text-left transition-colors relative",
                      on ? "border-[#ef4d62] bg-[#ef4d62]/5" : "border-transparent hover:bg-gray-50")}>
                    {on && <motion.span layoutId="cat-rail" className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-[#ef4d62]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                    <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", on ? "bg-[#ef4d62] text-white" : "bg-gray-100 text-gray-500")}>
                      <I className="w-4 h-4" />
                    </span>
                    <span className={cn("mt-1 lg:mt-0 text-[10px] lg:text-sm font-semibold leading-tight", on ? "text-[#ef4d62]" : "text-gray-600")}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={active.id}
                initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: E }}>
                {/* Banner */}
                <div className="relative rounded-2xl overflow-hidden aspect-[16/7] lg:aspect-[16/5] bg-gray-100 mb-4">
                  <img src={active.image} alt={active.label} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <h2 className="text-lg font-extrabold text-white leading-tight">{active.label}</h2>
                    <p className="text-[11px] text-white/85">{active.blurb}</p>
                  </div>
                </div>

                {/* Subcategory tiles, grouped */}
                {grouped.map(([group, subs]) => (
                  <div key={group || "all"} className="mb-5">
                    {group && <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{group}</p>}
                    <motion.div variants={grid} initial="hidden" animate="show"
                      className="grid grid-cols-3 lg:grid-cols-5 gap-2.5">
                      {subs.map((s, i) => (
                        <motion.button key={s.label} variants={tile} whileTap={reduced ? undefined : { scale: 0.96 }}
                          onClick={() => go(active, s)}
                          className="group flex flex-col items-center gap-1.5">
                          <span className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-100 ring-1 ring-gray-100 group-hover:ring-[#ef4d62]/40 transition">
                            <img src={active.images[i % active.images.length]} alt=""
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                          </span>
                          <span className="text-[11px] font-medium text-gray-700 text-center leading-tight line-clamp-2">{s.label}</span>
                        </motion.button>
                      ))}
                    </motion.div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
    </BuyerShell>
  );
};

export default Categories;
