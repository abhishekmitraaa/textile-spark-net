import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { ArrowRight, Megaphone, PackagePlus } from "lucide-react";
import { VendorDashboardBanners } from "@/components/dashboard/VendorDashboardBanners";
import { isBannerLive, useSiteConfig } from "@/lib/siteConfig";

// Drawn by the app, in its own words (2026-11-19, review M-71). They were two pictures with their text baked in: one
// promised "proven strategies" and "Contact us" from a 6.7 KB image stretched to fit, the other showed another
// marketplace's app. Text here is translated like the rest of the page and says only what Cosora does.
const SLIDES = [
  {
    Icon: Megaphone, to: "/advertisement-slideshow", cta: "See ad options",
    title: "Get seen by more buyers",
    body: "Promote a listing or your store on Cosora's pages. A campaign starts once Cosora approves it.",
  },
  {
    Icon: PackagePlus, to: "/upload", cta: "Add a product",
    title: "Get more leads",
    body: "Buyers find you through your listings. Add your products, then quote on open requirements.",
  },
];
const ROTATE_MS = 6000;

/**
 * Seller Home's banner (SH-009, SH-087). The banners super admins schedule in Cosora-Admin › Content show when any is
 * live; otherwise Cosora's two built-in slides, which are calm: each picture whole (it carries its own headline, so
 * nothing is laid over it), dots and a pause button, no rotation under reduced motion or while pointed at or focused,
 * and the slide off screen can't be reached.
 */
export function SellerPromoBanner() {
  const { data, isPending } = useSiteConfig();
  if (isPending) return <div className="aspect-[3/1] w-full rounded-xl bg-muted lg:aspect-auto lg:h-full lg:min-h-[12rem]" />;
  const scheduled = (data?.banners ?? []).some((b) => isBannerLive(b, Date.now()));
  return scheduled ? <VendorDashboardBanners /> : <BuiltInBanner />;
}

function BuiltInBanner() {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const rotating = !reduced && !paused && !held;

  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setCurrent((c) => (c + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [rotating]);

  return (
    <div
      data-testid="builtin-banner"
      data-active-slide={current}
      role="region"
      aria-roledescription="carousel"
      aria-label="Cosora for sellers"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
      className="relative aspect-[3/1] w-full overflow-hidden rounded-xl bg-muted lg:aspect-auto lg:h-full lg:min-h-[12rem]"
    >
      {SLIDES.map((s, i) => (
        <Link
          key={s.to}
          to={s.to}
          data-slide={i}
          aria-hidden={i !== current}
          // The slide off screen is out of the tab order and the accessibility tree.
          ref={(el) => el?.toggleAttribute("inert", i !== current)}
          className="absolute inset-0 block bg-white transition-opacity duration-500 motion-reduce:transition-none"
          style={{ opacity: i === current ? 1 : 0 }}
        >
          <span className="flex h-full w-full items-center gap-4 bg-gradient-to-br from-brand-vendor/10 via-white to-brand-vendor/5 px-5 py-4 lg:px-7">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-vendor/10 sm:flex">
              <s.Icon className="h-6 w-6 text-brand-vendor" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-gray-900 lg:text-lg">{s.title}</span>
              <span className="mt-1 block text-xs text-gray-600 lg:text-sm">{s.body}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-vendor">
                {s.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </span>
          </span>
        </Link>
      ))}

      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-black/30 px-1.5 py-0.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show slide ${i + 1}`}
            aria-current={i === current}
            onClick={() => setCurrent(i)}
            className="flex h-6 w-6 items-center justify-center"
          >
            <span className={`h-2 w-2 rounded-full ${i === current ? "bg-white" : "bg-white/50"}`} />
          </button>
        ))}
        {!reduced && (
          <button
            type="button"
            aria-label={paused ? "Play slideshow" : "Pause slideshow"}
            onClick={() => setPaused((p) => !p)}
            className="flex h-6 w-6 items-center justify-center text-white"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
