import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Brand } from "@/lib/followingStore";

// ─────────────────────────────────────────────────────────────
// "Looking for New Brands?" — swipeable brand discovery carousel.
// Each slide is a suggested brand with its top inquired products.
// Swiping left reveals the next brand. Shared between the Following
// feed and the Following → View All page.
// ─────────────────────────────────────────────────────────────

export default function NewBrandsCarousel({ brands, onFollow }: { brands: Brand[]; onFollow: (b: Brand) => void }) {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  // Freeze which brand ids appear as slides here, independent of live follow
  // state. Without this, clicking Follow flips `isFollowing` in the store,
  // the caller's filtered list drops the brand on the next render, and the
  // slide vanishes instantly — the button never gets to show "Following".
  // Ids are only ever added (a genuinely new, not-yet-seen suggestion), never
  // removed, so a freshly-followed brand keeps its slide and just flips its
  // own button to "Following".
  const seenRef = useRef<Set<string>>(new Set());
  const [slideIds, setSlideIds] = useState<string[]>([]);
  useEffect(() => {
    const fresh = brands.filter((b) => !b.isFollowing && !seenRef.current.has(b.id));
    if (fresh.length) {
      fresh.forEach((b) => seenRef.current.add(b.id));
      setSlideIds((prev) => [...prev, ...fresh.map((b) => b.id)]);
    }
  }, [brands]);

  const byId = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const slides = useMemo(
    () => slideIds.map((id) => byId.get(id)).filter((b): b is Brand => Boolean(b)),
    [slideIds, byId],
  );

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx);
  };

  if (slides.length === 0) return null;

  return (
    <section className="rounded-2xl bg-[#ececeb] p-3 lg:p-4">
      <h2 className="text-sm lg:text-lg font-bold text-gray-900 mb-2.5">Looking for New Brands?</h2>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-1 px-1 gap-3"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {slides.map((brand) => {
          const following = brand.isFollowing;
          return (
            <div key={brand.id} className="snap-center shrink-0 w-full">
              <div className="rounded-xl bg-white overflow-hidden border border-gray-100">
                {/* Brand header */}
                <div className="flex items-center gap-2.5 p-3">
                  <button onClick={() => navigate(`/vendor/${brand.id}`)} className="shrink-0">
                    <img src={brand.logo} alt={brand.name} className="w-10 h-10 rounded-full object-cover" />
                  </button>
                  <button onClick={() => navigate(`/vendor/${brand.id}`)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-900 truncate">{brand.name}</span>
                      {brand.isAd && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide shrink-0">AD</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{brand.location} · {brand.followers} followers</p>
                  </button>
                  <button
                    onClick={() => { if (!following) { onFollow(brand); toast.success(`Following ${brand.name}`); } }}
                    className={cn(
                      "shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors",
                      following ? "bg-gray-100 text-gray-500" : "bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white"
                    )}
                  >
                    {following ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {following ? "Following" : "Follow"}
                  </button>
                </div>

                {/* Top inquired products */}
                <div className="grid grid-cols-2 gap-px bg-gray-100">
                  {brand.topProducts.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(`/vendor/${brand.id}`)}
                      className="relative aspect-square bg-gray-100"
                    >
                      <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left">
                        <p className="text-[10px] font-semibold text-white truncate">{p.name}</p>
                        <p className="text-[10px] font-bold text-white">{p.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {slides.map((b, i) => (
            <button
              key={b.id}
              onClick={() => {
                const el = trackRef.current;
                if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
              }}
              aria-label={`Go to brand ${i + 1}`}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-4 bg-[#ef4d62]" : "w-1.5 bg-gray-400/60")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
