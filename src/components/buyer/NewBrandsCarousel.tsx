import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Brand } from "@/lib/followingStore";
import { logAdImpression, logAdClick, adDestination, type ActiveAd } from "@/lib/queries/ads";
import { logEngagement, markNavSource } from "@/lib/queries/engagement";
import SponsoredNote from "@/components/buyer/SponsoredNote";

// ─────────────────────────────────────────────────────────────
// "Looking for New Brands?" — swipeable brand discovery carousel.
// Each slide is a suggested brand with its top inquired products.
// Swiping left reveals the next brand. Shared between the Following
// feed and the Following → View All page.
//
// PAID SLIDES (Phase 5, `followingBrands`). Store Promotion / Brand Ad
// campaigns are interleaved among the organic suggestions rather than given
// their own rail, matching the agreed placement mockup: "One paid slide mixed
// into the organic brand-discovery carousel, capped at roughly 1 in 4 so it
// doesn't crowd out real suggestions."
//
// The cap is the whole reason interleaving is acceptable here. A paid slide
// sits where an organic suggestion would, so without a hard ratio the section
// stops being discovery and becomes an ad unit wearing discovery's heading.
// AD_RATIO below is that ratio, and it is enforced by construction: the number
// of paid slides is derived from how many organic ones there are, never from
// how many campaigns are available to sell.
//
// A paid slide is labelled twice — an "AD" chip by the name and "Sponsored ·
// Paid placement" where an organic slide shows "location · N followers" — so
// it is never ambiguous which brands are here on merit.
// ─────────────────────────────────────────────────────────────

/** One paid slide per this many organic slides. 3 → a paid slide is 1 in 4. */
const AD_RATIO = 3;

type Slide =
  | { kind: "organic"; key: string; brand: Brand }
  | { kind: "ad"; key: string; ad: ActiveAd; brand: Brand | undefined };

export default function NewBrandsCarousel({
  brands, onFollow, sponsored = [],
}: {
  brands: Brand[];
  onFollow: (b: Brand) => void;
  /** Eligible storePromotion/brandAd campaigns. Empty renders a purely organic carousel. */
  sponsored?: ActiveAd[];
}) {
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
  const organic = useMemo(
    () => slideIds.map((id) => byId.get(id)).filter((b): b is Brand => Boolean(b)),
    [slideIds, byId],
  );

  // Interleave. `floor(organic / AD_RATIO)` means fewer than three organic
  // suggestions produce NO paid slide at all — deliberately. With one or two
  // real brands to show, a paid slide would be a third to a half of the
  // carousel, which is the crowding-out the cap exists to prevent. Those
  // campaigns still serve in the other placements, and Following's own
  // "Most Popular" rail covers the case where discovery has run dry.
  const slides = useMemo<Slide[]>(() => {
    const budget = Math.floor(organic.length / AD_RATIO);
    const ads = sponsored.slice(0, budget);
    const out: Slide[] = [];
    let ai = 0;
    organic.forEach((brand, i) => {
      out.push({ kind: "organic", key: `b-${brand.id}`, brand });
      if ((i + 1) % AD_RATIO === 0 && ai < ads.length) {
        const ad = ads[ai++];
        out.push({ kind: "ad", key: `ad-${ad.adId}`, ad, brand: ad.vendorId ? byId.get(ad.vendorId) : undefined });
      }
    });
    return out;
  }, [organic, sponsored, byId]);

  // Impressions fire once per campaign per mount. Vendors are billed against
  // these, so a re-render or a swipe back must not inflate them.
  const logged = useRef<Set<string>>(new Set());
  useEffect(() => {
    slides.forEach((s) => {
      if (s.kind !== "ad" || logged.current.has(s.ad.adId)) return;
      logged.current.add(s.ad.adId);
      void logAdImpression(s.ad.adId);
    });
  }, [slides]);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx);
  };

  // Store Promotion / Brand Ad are profile-goal placements, so adDestination()
  // sends the tap to the vendor's storefront — which is what the vendor bought.
  const openAd = (ad: ActiveAd) => {
    void logAdClick(ad.adId);
    const dest = adDestination(ad);
    if (!dest) return;
    markNavSource("ad");
    if (dest.kind === "profile") {
      void logEngagement({ eventType: "profile_view", vendorId: ad.vendorId, adId: ad.adId, source: "ad" });
    }
    navigate(dest.path);
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
        {slides.map((slide) => {
          if (slide.kind === "ad") return <SponsoredSlide key={slide.key} ad={slide.ad} brand={slide.brand} onOpen={openAd} />;
          const brand = slide.brand;
          const following = brand.isFollowing;
          return (
            <div key={slide.key} className="snap-center shrink-0 w-full">
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
          {slides.map((s, i) => (
            <button
              key={s.key}
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

/**
 * A paid brand slide. Same frame as an organic one so it does not read as a
 * banner bolted into the carousel, but labelled twice — the "AD" chip and
 * "Sponsored · Paid placement" in place of "location · N followers". A buyer
 * must never have to guess which suggestions were bought.
 *
 * No Follow button. An organic slide's primary action is Follow; this one's is
 * "visit the storefront", which is what a Store Promotion / Brand Ad campaign
 * actually pays for. Offering Follow here would also quietly convert an ad
 * impression into a follow the vendor did not buy.
 *
 * `brand` is the vendor's real row when the carousel already has it (same
 * vendor_profiles fetch), used only for the logo and product tiles. When it is
 * missing the slide still renders from the campaign's own fields rather than
 * inventing a logo.
 */
function SponsoredSlide({
  ad, brand, onOpen,
}: {
  ad: ActiveAd;
  brand: Brand | undefined;
  onOpen: (ad: ActiveAd) => void;
}) {
  const name = ad.vendorName ?? brand?.name ?? "Sponsored brand";
  // The campaign's own creative first, then the promoted product's image. Only
  // tiles that have a real image are rendered — never a placeholder, and never
  // padded out to two to match the organic grid.
  const tiles = [
    ad.imageUrl ? { name: ad.productName ?? ad.title, price: ad.price, image: ad.imageUrl } : null,
    ...(brand?.topProducts ?? []).slice(0, 1).map((p) => ({ name: p.name, price: p.price, image: p.image })),
  ].filter((t): t is { name: string; price: string | null; image: string } => Boolean(t));

  return (
    <div className="snap-center shrink-0 w-full">
      <div className="rounded-xl bg-white overflow-hidden border border-gray-100">
        <div className="flex items-center gap-2.5 p-3">
          <button onClick={() => onOpen(ad)} className="shrink-0">
            {brand?.logo ? (
              <img src={brand.logo} alt={name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                {name.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </button>
          <button onClick={() => onOpen(ad)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-900 truncate">{name}</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide shrink-0">AD</span>
            </div>
            <p className="text-[11px] text-gray-500 truncate">Paid placement</p>
          </button>
          <button
            onClick={() => onOpen(ad)}
            className="shrink-0 rounded-full bg-[#ef4d62] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#ef4d62]/90"
          >
            Visit
          </button>
        </div>

        {tiles.length > 0 && (
          <div className={cn("grid gap-px bg-gray-100", tiles.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {tiles.map((t, i) => (
              <button key={i} onClick={() => onOpen(ad)} className="relative aspect-square bg-gray-100">
                <img src={t.image} alt={t.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left">
                  <p className="truncate text-[10px] font-semibold text-white">{t.name}</p>
                  {t.price && <p className="text-[10px] font-bold text-white">{t.price}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        {/* On the SLIDE, never on the carousel. This section mixes paid and
            organic brands, so a section-level "Sponsored" would label real
            suggestions as ads — the opposite of a disclosure. */}
        <SponsoredNote className="mt-0 px-3 pb-2" />
      </div>
    </div>
  );
}
