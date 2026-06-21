import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// EVERYDAY FASHION HERO — center-emphasis auto-advancing carousel
//
// Layout: a light-grey card. The active slide sits at the visual center
// at full scale; the previous and next slides peek in from the sides,
// scaled down and faded. Every ~4.2s the active index advances by one;
// each slide animates to its new role (center / peek / off-screen) via
// the same set of x + scale + opacity transitions, so the impression is
// "next product slides into the center, current product slides out left."
//
// Wrap-around uses shortest-path offset math so going from the last item
// back to the first does not jump visually.
//
// Discrete state (activeIndex) is correct here — only one of N positions
// at a time. Per the design skill's rule, continuous pointer-driven values
// would use motion values instead; this is the right tool for the job.
//
// Accessibility:
//  - Honors prefers-reduced-motion (no auto-advance, instant transitions).
//  - Pauses on hover so users can read the active slide.
//  - aria-live=polite on the heading region announces slide changes
//    indirectly through the slide counter.
// ─────────────────────────────────────────────────────────────

interface HeroSlide {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  price: string;
  moq: string;
  image: string;
  sponsored?: boolean;
}

const SLIDES: HeroSlide[] = [
  { id: "ef-1", vendorId: "v1", name: "Satin Slip Dress",    category: "Dress",    price: "₹459", moq: "MOQ 12", image: "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=600&h=800&fit=crop", sponsored: true },
  { id: "ef-2", vendorId: "v2", name: "Camp Collar Shirt",   category: "Shirt",    price: "₹499", moq: "MOQ 10", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&h=800&fit=crop" },
  { id: "ef-3", vendorId: "v3", name: "Ribbed Tank Top",     category: "Top",      price: "₹299", moq: "MOQ 20", image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=600&h=800&fit=crop" },
  { id: "ef-4", vendorId: "v4", name: "Tailored Trouser",    category: "Trouser",  price: "₹699", moq: "MOQ 10", image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=600&h=800&fit=crop" },
  { id: "ef-5", vendorId: "v5", name: "Oversized Blazer",    category: "Blazer",   price: "₹1,299", moq: "MOQ 8", image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&h=800&fit=crop" },
  { id: "ef-6", vendorId: "v6", name: "Pleated Midi Skirt",  category: "Skirt",    price: "₹399", moq: "MOQ 15", image: "https://images.unsplash.com/photo-1583496661160-fb5886a13d27?w=600&h=800&fit=crop" },
  { id: "ef-7", vendorId: "v7", name: "Linen Wrap Top",      category: "Top",      price: "₹529", moq: "MOQ 12", image: "https://images.unsplash.com/photo-1520975918318-3ec5b67f3e44?w=600&h=800&fit=crop" },
  { id: "ef-8", vendorId: "v8", name: "Long Trench Coat",    category: "Coat",     price: "₹1,899", moq: "MOQ 6", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&h=800&fit=crop" },
];

const AUTO_ADVANCE_MS = 4200;
const SIDE_OFFSET_PCT = 42;       // distance of each peek from center (% of container width)
const PEEK_SCALE = 0.76;
const PEEK_OPACITY = 0.4;
const SWIPE_OFFSET_PX = 60;       // min absolute drag distance to count as a swipe
const SWIPE_VELOCITY = 500;       // px/s velocity threshold for a fast flick

// ─────────────────────────────────────────────────────────────

interface SlideProps {
  slide: HeroSlide;
  offset: number;            // shortest-path distance from active index
  saved: boolean;
  onToggleSave: (id: string) => void;
  reducedMotion: boolean;
}

function Slide({ slide, offset, saved, onToggleSave, reducedMotion }: SlideProps) {
  const isActive = offset === 0;
  const isVisible = Math.abs(offset) <= 1;

  return (
    <motion.div
      className="absolute top-1/2 left-1/2 w-[48%] lg:w-[40%]"
      style={{ transformOrigin: "center center" }}
      animate={{
        x: `${-50 + offset * SIDE_OFFSET_PCT}%`,
        y: "-50%",
        scale: isActive ? 1 : PEEK_SCALE,
        opacity: isVisible ? (isActive ? 1 : PEEK_OPACITY) : 0,
        zIndex: isActive ? 20 : 10 - Math.abs(offset),
        pointerEvents: isActive ? "auto" : "none",
      }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: 0.7, ease: [0.32, 0.72, 0, 1] }
      }
      aria-hidden={!isActive}
    >
      <Link
        to={`/product/${slide.id}`}
        className="block relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-200 shadow-lg"
        tabIndex={isActive ? 0 : -1}
      >
        <img
          src={slide.image}
          alt={slide.name}
          className="absolute inset-0 w-full h-full object-cover"
          loading={Math.abs(offset) <= 1 ? "eager" : "lazy"}
          draggable={false}
        />

        {slide.sponsored && (
          <span className="absolute top-3 left-3 text-[10px] font-semibold text-white bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded">
            sponsored
          </span>
        )}

        <button
          onClick={e => { e.preventDefault(); onToggleSave(slide.id); }}
          className="absolute top-3 right-3 w-8 h-8 lg:w-9 lg:h-9 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
          aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={saved}
          tabIndex={isActive ? 0 : -1}
        >
          {saved
            ? <BookmarkCheck className="w-4 h-4 text-[#ef4d62] fill-[#ef4d62]/15" />
            : <Bookmark className="w-4 h-4 text-gray-600" />}
        </button>

        {/* Bottom gradient + product info */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 via-black/15 to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <p className="text-[11px] lg:text-xs uppercase tracking-wider opacity-80">{slide.category}</p>
          <p className="text-lg lg:text-xl font-bold leading-tight">{slide.price}</p>
          <p className="text-[10px] lg:text-xs opacity-90">{slide.moq}</p>
        </div>
      </Link>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────

export default function EverydayFashionHero() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const total = SLIDES.length;

  const goTo = (i: number) => setActiveIndex(((i % total) + total) % total);
  const goNext = () => setActiveIndex(i => (i + 1) % total);
  const goPrev = () => setActiveIndex(i => (i - 1 + total) % total);

  // Auto-advance interval. Cleared on unmount, paused on hover/drag,
  // suspended entirely for users who prefer reduced motion.
  useEffect(() => {
    if (prefersReducedMotion || paused) return;
    const id = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
    // goNext is stable (no deps); ignore lint complaint about leaving it out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, prefersReducedMotion, total]);

  const toggleSave = (id: string) => {
    setSaved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute shortest-path offset for each slide so wrap-around feels smooth.
  const offsetFor = (i: number): number => {
    let raw = i - activeIndex;
    if (raw > total / 2) raw -= total;
    if (raw < -total / 2) raw += total;
    return raw;
  };

  return (
    <section
      className="relative rounded-2xl bg-gray-100 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="New everyday fashion arrivals"
    >
      {/* Heading */}
      <header className="px-4 lg:px-6 pt-5 lg:pt-7 pb-3 lg:pb-4 text-center">
        <h1 className="text-base lg:text-2xl font-bold text-gray-900 tracking-tight">NEW EVERYDAY FASHION</h1>
        <p className="text-xs lg:text-sm text-gray-500 mt-0.5">Discover New Fashion Everyday</p>
      </header>

      {/* Stage — drag-x for swipe gesture; offset/velocity threshold on release */}
      <motion.div
        className="relative h-[300px] lg:h-[440px] touch-pan-y select-none"
        aria-live="polite"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        dragMomentum={false}
        onDragStart={() => setPaused(true)}
        onDragEnd={(_, info) => {
          const { offset, velocity } = info;
          const flick = offset.x * velocity.x;
          if (offset.x < -SWIPE_OFFSET_PX || velocity.x < -SWIPE_VELOCITY || flick < -10_000) {
            goNext();
          } else if (offset.x > SWIPE_OFFSET_PX || velocity.x > SWIPE_VELOCITY || flick > 10_000) {
            goPrev();
          }
          setPaused(false);
        }}
      >
        {SLIDES.map((slide, i) => (
          <Slide
            key={slide.id}
            slide={slide}
            offset={offsetFor(i)}
            saved={saved.has(slide.id)}
            onToggleSave={toggleSave}
            reducedMotion={prefersReducedMotion}
          />
        ))}
      </motion.div>

      {/* Counter + dot indicators */}
      <footer className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4">
        {/* Dot indicators (clickable) */}
        <div className="flex items-center gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === activeIndex ? "true" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === activeIndex ? "w-5 bg-[#ef4d62]" : "w-1.5 bg-gray-300 hover:bg-gray-400"
              )}
            />
          ))}
        </div>

        {/* Counter */}
        <span className="text-[11px] lg:text-xs text-gray-400 font-mono tabular-nums tracking-wider">
          {String(activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </footer>
    </section>
  );
}