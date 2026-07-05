import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Megaphone, Star } from "lucide-react";
import { useActiveAds, logAdImpression, logAdClick, type ActiveAd } from "@/lib/queries/ads";

// Buyer-facing "Sponsored" rail. Surfaces vendor ad campaigns (active, promoting
// a live product) as tappable cards. Impressions are logged once per ad per
// mount; a tap logs a click and opens the promoted product. See queries/ads.ts.
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];

export default function SponsoredRail({ max = 10, className }: { max?: number; className?: string }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { data: ads = [] } = useActiveAds(max);
  const logged = useRef<Set<string>>(new Set());

  useEffect(() => {
    ads.forEach((a) => {
      if (!logged.current.has(a.adId)) {
        logged.current.add(a.adId);
        void logAdImpression(a.adId);
      }
    });
  }, [ads]);

  if (ads.length === 0) return null;

  const open = (a: ActiveAd) => {
    void logAdClick(a.adId);
    if (a.productId) navigate(`/product/${a.productId}`);
  };

  return (
    <section className={className}>
      <div className="flex items-center gap-1.5 mb-3">
        <Megaphone className="h-4 w-4 text-[#ef4d62]" />
        <h2 className="text-sm font-bold text-gray-900">Sponsored</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
        {ads.map((a) => (
          <motion.button
            key={a.adId}
            onClick={() => open(a)}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={{ duration: 0.13, ease: E }}
            className="group relative w-36 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white text-left"
          >
            <div className="relative aspect-[3/4] bg-gray-100">
              {a.imageUrl && <img src={a.imageUrl} alt={a.productName ?? "Sponsored product"} className="h-full w-full object-cover" loading="lazy" />}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
                Ad
              </span>
            </div>
            <div className="p-2">
              <p className="truncate text-[11px] font-bold text-gray-900">{a.productName ?? a.title}</p>
              {a.vendorName && <p className="truncate text-[10px] text-gray-500">{a.vendorName}</p>}
              <div className="mt-0.5 flex items-center justify-between">
                {a.price && <span className="text-[11px] font-bold text-[#ef4d62]">{a.price}</span>}
                <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-400">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" /> Featured
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
