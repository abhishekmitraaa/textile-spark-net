import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { bannerImageUrl, isBannerLive, useSiteConfig, type SiteBanner } from "@/lib/siteConfig";

/**
 * The vendor dashboard's banners (admin completion Phase 9; it replaced the hardcoded
 * PromoBanner). Written by super admins on Cosora-Admin's Content page, read from the
 * site-config snapshot (lib/siteConfig.ts).
 *
 * Only active banners inside their schedule show, in the admin's order. Links are paths
 * on this site, checked again in parseBanner. Nothing renders while loading, on an error
 * or with no banners: this strip is promotion, not something a vendor needs.
 * Banner copy is Cosora's own text, so AutoTranslate translates it when the catalogues
 * have it (src/i18n/external-strings.json, "site_banners").
 */
export function VendorDashboardBanners() {
  const { data } = useSiteConfig();
  const now = Date.now();
  const banners = (data?.banners ?? []).filter((b) => isBannerLive(b, now));

  if (banners.length === 0) return null;
  if (banners.length === 1) return <BannerCard banner={banners[0]} />;

  return (
    <Carousel opts={{ loop: true }} className="relative">
      <CarouselContent>
        {banners.map((b) => (
          <CarouselItem key={b.id}>
            <BannerCard banner={b} withArrows />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2 top-1/2 -translate-y-1/2 border-white/40 bg-white/20 text-white hover:bg-white/30" />
      <CarouselNext className="right-2 top-1/2 -translate-y-1/2 border-white/40 bg-white/20 text-white hover:bg-white/30" />
    </Carousel>
  );
}

function BannerCard({ banner: b, withArrows = false }: { banner: SiteBanner; withArrows?: boolean }) {
  // In the carousel the previous/next buttons sit at the card's edges: keep text clear of them.
  const padding = withArrows ? "px-12 py-4 sm:px-14 sm:py-6" : "p-4 sm:p-6";
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-vendor/90 via-brand-vendor to-brand-vendor/80 ${padding}`}>
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/10 blur-xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-lg font-bold text-white sm:text-xl">
            {b.link_path && !b.cta_label ? (
              <Link to={b.link_path} className="hover:underline">
                {b.title}
              </Link>
            ) : (
              b.title
            )}
          </h3>
          {b.subtitle && <p className="text-sm text-white/80">{b.subtitle}</p>}
          {b.link_path && b.cta_label && (
            <Button asChild size="sm" className="mt-3 gap-2 bg-white text-brand-vendor shadow-lg hover:bg-white/90">
              <Link to={b.link_path}>
                {b.cta_label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        {b.image_path && (
          <img
            src={bannerImageUrl(b.image_path)}
            alt=""
            loading="lazy"
            className="h-32 w-full shrink-0 rounded-xl object-cover sm:h-28 sm:w-48"
          />
        )}
      </div>
    </div>
  );
}
