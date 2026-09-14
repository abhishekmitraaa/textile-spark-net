import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Megaphone, Star } from "lucide-react";
import { useActiveAds, logAdImpression, logAdClick, adDestination, type ActiveAd } from "@/lib/queries/ads";
import { logEngagement, markNavSource } from "@/lib/queries/engagement";
import { AD_SLOTS, ON_PLATFORM_CARD_TYPES, adSlotBlock, type AdSlotId } from "@/lib/adSlots";
import SponsoredNote from "@/components/buyer/SponsoredNote";

// Buyer-facing "Sponsored" rail. Surfaces vendor ad campaigns (eligible,
// promoting a live product) as tappable cards. Impressions are logged once per
// ad per mount; a tap logs a click and opens whatever the campaign's goal
// actually bought — the storefront for a profile-goal placement, the product
// otherwise (see adDestination in queries/ads.ts).
//
// Every campaign reaching this component has passed is_ad_eligible() in the
// database: approved by an admin, inside its schedule, from a vendor in good
// standing, matching the category/city context. Nothing is filtered here.
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];

// Two ways to ask for inventory:
//   `slot`      — a Phase 5 placement. Ad types, size and heading come from
//                 AD_SLOTS, so a page cannot render an ad type the placement
//                 plan never gave it a slot for.
//   `max`       — a general rail, used by ProductDetail, which predates the
//                 slot map and is not one of the five artboards. It still does
//                 NOT accept every ad type: it falls back to
//                 ON_PLATFORM_CARD_TYPES, because an unfiltered call returns
//                 every eligible campaign including the off-platform ones
//                 (fbInsta, googleProduct, socialCombo) and the undeliverable
//                 ones (searchListing, directBroadcast, webMobileCombo). Those
//                 were rendering here as ordinary product cards — a vendor who
//                 bought Facebook reach got a card on a Cosora product page.
//
// `category` (optional) filters serving to ads targeting that category plus
// untargeted ads — pass a real category context to make targeting take effect.
//
// `block` is which repetition of the slot this instance renders (Mitra,
// 2026-09-13: slots must recur down a page, not sit as one rail at the top).
// Every instance of the same slot on a page shares ONE fetch — React Query keys
// on (max, category, types), so mounting three of these is one request — and
// each renders a DISJOINT slice of it via adSlotBlock. A buyer scrolling the
// page therefore meets more sponsored positions but never the same campaign
// twice, and each ad logs exactly one impression. Blocks past the end of the
// available inventory render nothing rather than looping back to the start.
export default function SponsoredRail({
  max = 10, className, category, slot, label, block = 0,
}: {
  max?: number;
  className?: string;
  category?: string | null;
  slot?: AdSlotId;
  label?: string;
  block?: number;
}) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const spec = slot ? AD_SLOTS[slot] : null;
  const { data: window = [] } = useActiveAds(spec?.max ?? max, category, spec?.types ?? ON_PLATFORM_CARD_TYPES);
  // An untyped rail (ProductDetail) has no slot and so no blocks: it is the
  // whole window, exactly as before. Memoised because adSlotBlock returns a new
  // array each call, and the impression effect below keys on this identity.
  const ads = useMemo(
    () => (slot ? adSlotBlock(slot, window, block) : window),
    [slot, window, block],
  );
  const heading = label ?? spec?.label ?? "Sponsored";
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
        <h2 className="text-sm font-bold text-gray-900">{heading}</h2>
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
              {/* A bumped Wholesaler Pick is ordered ahead of every other
                  campaign in this rail for 72 hours. A placement that outranks
                  everything else should be visible as such rather than
                  silently privileged — the buyer can see why it is first. */}
              {a.isBumped && (
                <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[#ef4d62] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                  <ArrowUp className="h-2.5 w-2.5" /> Bumped
                </span>
              )}
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
      <SponsoredNote />
    </section>
  );
}
