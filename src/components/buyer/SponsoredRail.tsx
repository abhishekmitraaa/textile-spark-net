import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Megaphone, Star } from "lucide-react";
import { useActiveAds, logAdImpression, logAdClick, adDestination, type ActiveAd } from "@/lib/queries/ads";
import { logEngagement, markNavSource } from "@/lib/queries/engagement";

// Buyer-facing "Sponsored" rail. Surfaces vendor ad campaigns (active, promoting
// a live product) as tappable cards. Impressions are logged once per ad per
// mount; a tap logs a click and opens whatever the campaign's goal actually
// bought — the storefront for a profile-goal placement, the product otherwise
// (see adDestination in queries/ads.ts). See queries/ads.ts.
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];

// `category` (optional) filters serving to ads targeting that category plus
// untargeted ads — pass a real category context (e.g. the product page's own
// category) to make category targeting take effect.
export default function SponsoredRail({ max = 10, className, category }: { max?: number; className?: string; category?: string | null }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { data: ads = [] } = useActiveAds(max, category);
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

  // Honours the campaign goal the vendor paid for: a storePromotion/brandAd
  // placement opens the storefront, everything else opens the product. This
  // used to navigate to `/product/${a.productId}` unconditionally, so a
  // "Visit your profile" campaign delivered product traffic and a
  // profile-only ad (no product_id) was a card that did nothing at all.
  const open = (a: ActiveAd) => {
    void logAdClick(a.adId);
    const dest = adDestination(a);
    if (!dest) return;
    // The destination logs the view; tell it this arrival was bought.
    markNavSource("ad");
    if (dest.kind === "profile") {
      // Ad-attributed profile views are reported separately from ad-attributed
      // product views, so the event is logged here where the goal is known.
      void logEngagement({ eventType: "profile_view", vendorId: a.vendorId, adId: a.adId, source: "ad" });
    }
    navigate(dest.path);
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
