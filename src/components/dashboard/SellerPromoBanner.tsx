import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import homeBanner1 from "@/assets/vendorhome/homebanner1.jpg";
import homeBanner2 from "@/assets/vendorhome/homebanner2.jpg";
import { VendorDashboardBanners } from "@/components/dashboard/VendorDashboardBanners";
import { isBannerLive, useSiteConfig } from "@/lib/siteConfig";

const SLIDES = [
  { img: homeBanner2, alt: "Get prime placement above competitors: advertise on Cosora", to: "/advertisement-slideshow" },
  { img: homeBanner1, alt: "Get more leads: add your products", to: "/upload" },
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
          className="absolute inset-0 block transition-opacity duration-500 motion-reduce:transition-none"
          style={{ opacity: i === current ? 1 : 0 }}
        >
          {/* A blurred copy fills the frame, so the whole picture shows without bars or cropping. */}
          <img src={s.img} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
          <img src={s.img} alt={s.alt} className="relative h-full w-full object-contain" />
        </Link>
      ))}

      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-black/40 px-1.5 py-0.5">
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
