import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { fetchProductCardsByIds, type ProductCardData } from "@/lib/queries/products";
import { logFeaturedImpressions, useFeaturedListingsOn, useSpotlight } from "@/lib/queries/visibility";
import { useDisplayCurrency } from "@/contexts/DisplayCurrencyContext";

// The VIP Spotlight (subscriptions P10): products from VIP sellers, on the home page and on
// category pages, rotating by day and browsing session (spotlight_listings decides). Shown
// only where the featured_listings switch is on for the visitor; renders nothing when there
// is nothing to show. Each product seen is logged once per mount (log_featured_impressions,
// which only counts a product that really is a VIP seller's).

export default function SpotlightRail({ categoryId, className }: { categoryId?: string | null; className?: string }) {
  const on = useFeaturedListingsOn();
  const { data: ids = [] } = useSpotlight(on ? (categoryId ?? null) : undefined);
  const { showText } = useDisplayCurrency();
  const { data: cards = {} } = useQuery({
    queryKey: ["spotlight_cards", ids],
    enabled: on && ids.length > 0,
    queryFn: () => fetchProductCardsByIds(ids),
  });
  const items = useMemo(() => ids.map((id) => cards[id]).filter(Boolean) as ProductCardData[], [ids, cards]);
  const logged = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = items.filter((p) => !logged.current.has(p.id));
    fresh.forEach((p) => logged.current.add(p.id));
    void logFeaturedImpressions(fresh.map((p) => ({ productId: p.id, placement: "spotlight" as const })));
  }, [items]);

  if (!on || items.length === 0) return null;
  return (
    <section className={className} data-testid="spotlight-rail" aria-label="Spotlight">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-bold text-gray-900 lg:text-base">Spotlight</h2>
        <span className="text-[11px] text-gray-500">VIP sellers</span>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {items.map((p) => (
          <Link key={p.id} to={`/product/${p.id}`} data-testid="spotlight-item"
            className="group w-36 shrink-0 overflow-hidden rounded-xl border border-amber-200 bg-white lg:w-44">
            <div className="relative aspect-[4/5] bg-gray-100">
              <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">VIP</span>
            </div>
            <div className="p-2">
              <p data-no-translate className="truncate text-xs font-semibold text-gray-900 group-hover:underline">{p.name}</p>
              <p data-no-translate className="truncate text-[11px] text-gray-500">{p.manufacturer}</p>
              <p className="mt-0.5 text-xs font-bold text-gray-900">{showText(p.price)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
