import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  Star,
  X,
} from "lucide-react";
import heroImage from "@/assets/cosora-studio-hero.jpg";
import { allPhotographers } from "./PhotographerProfile";

/* ── Motion (project standard, see CLAUDE.md) ───────────────────────────── */
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = { show: { transition: { staggerChildren: 0.055 } } };
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

/* ── Static content ─────────────────────────────────────────────────────── */
// Chip labels are shortened so the filter row stays on one scrollable line;
// `value` still matches the full string stored on each studio's `specialties`.
const SHOOT_TYPES = [
  { label: "All", value: "All" },
  { label: "Apparel", value: "Apparel Shoot" },
  { label: "Footwear", value: "Footwear Shoot" },
  { label: "Accessories", value: "Accessories Shoot" },
  { label: "Jewelry", value: "Jewelry Shoot" },
  { label: "Fabric", value: "Fabric Shoot" },
  { label: "Flat Lay", value: "Flat Lay" },
  { label: "Model", value: "Model Shoot" },
  { label: "Lifestyle", value: "Lifestyle Shoot" },
];

const STATS = [
  { value: "50+", label: "Verified studios" },
  { value: "2,400+", label: "Shoots delivered" },
  { value: "800+", label: "Vendors served" },
];

const PACKAGES = [
  {
    name: "Basic",
    price: "₹5,000",
    detail: "10 products, plain background, 2 day delivery",
    popular: false,
  },
  {
    name: "Standard",
    price: "₹12,000",
    detail: "25 products, styled shots, model optional, 3 day delivery",
    popular: true,
  },
  {
    name: "Premium",
    price: "₹25,000",
    detail: "50 products, lifestyle and flat lay, 5 day delivery",
    popular: false,
  },
];

const cityOf = (location: string) => location.split(",")[0].trim();

/**
 * Cover photo for a studio card. A few portfolio URLs in the seed data are
 * dead, and with a single cover image (instead of the old 4-up collage) a dead
 * URL is the whole card. So walk down the portfolio until one loads, and fall
 * back to a neutral tile if none do.
 */
const StudioCover = ({ images, name }: { images: string[]; name: string }) => {
  const [index, setIndex] = useState(0);
  const src = images[index];

  return (
    <div className="aspect-[4/3] overflow-hidden bg-gray-50">
      {src ? (
        <img
          src={src}
          alt={`Recent work by ${name}`}
          loading="lazy"
          onError={() => setIndex((i) => i + 1)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Camera className="h-6 w-6 text-gray-300" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
};

const CosoraStudio = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const [shootType, setShootType] = useState("All");
  const [city, setCity] = useState("All");
  const [query, setQuery] = useState("");

  const [showChat, setShowChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<{ from: "cosora" | "vendor"; text: string }[]>([
    {
      from: "cosora",
      text: "Welcome to Cosora Studio. Tell us what you need shot, how many products, and your city. We will match you with a studio.",
    },
  ]);

  const cities = useMemo(
    () => Array.from(new Set(allPhotographers.map((p) => cityOf(p.location)))).sort(),
    [],
  );

  const studios = allPhotographers.filter((p) => {
    const byType = shootType === "All" || p.specialties.includes(shootType);
    const byCity = city === "All" || cityOf(p.location) === city;
    const q = query.trim().toLowerCase();
    const bySearch = q === "" || p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q);
    return byType && byCity && bySearch;
  });

  const filtered = shootType !== "All" || city !== "All" || query.trim() !== "";

  const clearFilters = () => {
    setShootType("All");
    setCity("All");
    setQuery("");
  };

  const openChat = (seed?: string) => {
    if (seed) setThread((t) => [...t, { from: "vendor", text: seed }]);
    setShowChat(true);
  };

  const send = () => {
    if (!draft.trim()) return;
    setThread((t) => [...t, { from: "vendor", text: draft.trim() }]);
    setDraft("");
    window.setTimeout(() => {
      setThread((t) => [
        ...t,
        {
          from: "cosora",
          text: "Got it. Our team will send you two or three studio options with quotes within a few hours.",
        },
      ]);
    }, 1200);
  };

  return (
    <DashboardLayout>
      <motion.div
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-6xl space-y-8 pb-6"
      >
        {/* ── Hero: split composition, no scrim, one primary action ───────── */}
        <motion.section
          variants={section}
          className="grid overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:grid-cols-[1.05fr_1fr]"
        >
          <div className="order-2 flex flex-col justify-center p-6 md:order-1 md:p-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#256fef]/10 px-3 py-1 text-xs font-medium text-[#256fef]">
              <Camera className="h-3.5 w-3.5" strokeWidth={2} />
              Premium studio service
            </span>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#363636] md:text-4xl">
              Cosora Studio
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              Book verified product photographers across India. Pick a studio, tell us what you need,
              we handle the rest.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <motion.div whileTap={reduced ? undefined : TAP} transition={TAP_T}>
                <Button
                  onClick={() => openChat()}
                  className="h-11 rounded-full bg-[#256fef] px-6 font-semibold text-white hover:bg-[#1d5ed6]"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat &amp; Book Now
                </Button>
              </motion.div>
              <motion.a
                href="#studios"
                whileTap={reduced ? undefined : TAP}
                transition={TAP_T}
                className="inline-flex h-11 items-center rounded-full border border-[#d0d4dc] px-6 text-sm font-semibold text-[#363636] transition-colors hover:border-[#256fef] hover:text-[#256fef]"
              >
                Browse studios
              </motion.a>
            </div>
          </div>

          <div className="relative order-1 min-h-[180px] md:order-2 md:min-h-[340px]">
            <img
              src={heroImage}
              alt="Fashion product shoot in progress at a Cosora partner studio"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </motion.section>

        {/* ── Proof: plain numbers, hairline separated, no card boxes ─────── */}
        <motion.section variants={section} className="grid grid-cols-3 divide-x divide-gray-100">
          {STATS.map((s) => (
            <div key={s.label} className="px-3 text-center first:pl-0 last:pr-0">
              <p className="text-xl font-bold text-[#363636] md:text-2xl">{s.value}</p>
              <p className="mt-0.5 text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </motion.section>

        {/* ── Browse controls ─────────────────────────────────────────────── */}
        <motion.section variants={section} id="studios" className="space-y-3 scroll-mt-20">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                aria-label="Search studios"
                placeholder="Search a studio"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 rounded-full border-[#d0d4dc] pl-11 text-sm text-[#363636] placeholder:text-gray-400 focus-visible:border-[#256fef] focus-visible:ring-1 focus-visible:ring-[#256fef] focus-visible:ring-offset-0"
              />
            </div>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger
                aria-label="Filter by city"
                className="h-11 rounded-full border-[#d0d4dc] px-5 text-sm font-medium text-[#363636] focus:ring-1 focus:ring-[#256fef] focus:ring-offset-0 sm:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="All">All cities</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {SHOOT_TYPES.map((t) => {
              const active = shootType === t.value;
              return (
                <motion.button
                  key={t.value}
                  whileTap={reduced ? undefined : TAP}
                  transition={TAP_T}
                  onClick={() => setShootType(t.value)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[#256fef] text-white"
                      : "border border-[#d0d4dc] text-gray-500 hover:border-[#256fef] hover:text-[#256fef]"
                  }`}
                >
                  {t.label}
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        {/* ── Studio grid ─────────────────────────────────────────────────── */}
        <motion.div
          variants={reduced ? {} : listContainer}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {studios.map((s) => (
            <motion.button
              key={s.id}
              type="button"
              variants={listItem}
              whileTap={reduced ? undefined : TAP}
              transition={TAP_T}
              onClick={() => navigate(`/cosora-studio/${s.id}`)}
              className="group w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#256fef]/40"
            >
              <StudioCover images={s.portfolio} name={s.name} />

              <div className="p-4">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-sm font-semibold text-[#363636]">{s.name}</h3>
                  {s.verified && (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-[#14ae5c]" strokeWidth={2} />
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {cityOf(s.location)} · {s.turnaround} delivery
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {s.specialties.slice(0, 2).map((x) => x.replace(" Shoot", "")).join(", ")}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <p className="text-sm font-bold text-[#363636]">
                    {s.startingAt}
                    <span className="font-normal text-gray-400"> /look</span>
                  </p>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-[#363636]">{s.rating}</span>({s.reviews})
                    <ArrowRight className="ml-1 h-3.5 w-3.5 text-[#256fef] transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>

        {studios.length === 0 && (
          <motion.div variants={section} className="py-16 text-center">
            <Camera className="mx-auto h-8 w-8 text-gray-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-[#363636]">No studios match that filter</p>
            <p className="mt-1 text-xs text-gray-500">Try another shoot type or city.</p>
            {filtered && (
              <button
                onClick={clearFilters}
                className="mt-4 text-xs font-semibold text-[#256fef] hover:underline"
              >
                Clear filters
              </button>
            )}
          </motion.div>
        )}

        {/* ── Packages ────────────────────────────────────────────────────── */}
        <motion.section variants={section}>
          <h2 className="text-base font-bold text-[#363636]">Shoot packages</h2>
          <p className="mt-1 text-sm text-gray-500">
            Flat rates across every partner studio. Custom volumes are quoted on chat.
          </p>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:grid md:grid-cols-3">
            {PACKAGES.map((p) => (
              <div
                key={p.name}
                className={`border-b border-gray-100 p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${
                  p.popular ? "bg-[#256fef]/[0.04]" : ""
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-[#363636]">{p.name}</p>
                  {p.popular && (
                    <span className="text-[11px] font-medium text-[#256fef]">Most popular</span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold text-[#363636]">{p.price}</p>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">{p.detail}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── Photographers and support ───────────────────────────────────── */}
        <motion.section
          variants={section}
          className="grid overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:grid-cols-2"
        >
          <div className="border-b border-gray-100 p-6 md:border-b-0 md:border-r">
            <h3 className="text-base font-bold text-[#363636]">Shoot for brands on Cosora</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Product, fashion and textile photographers get listed here, set their own rates, and pay
              zero commission on the first 10 shoots.
            </p>
            <motion.div
              whileTap={reduced ? undefined : TAP}
              transition={TAP_T}
              className="mt-5 inline-block"
            >
              <Button
                onClick={() =>
                  openChat("I am a photographer and I would like to join Cosora Studio.")
                }
                className="h-11 rounded-full bg-[#256fef] px-6 font-semibold text-white hover:bg-[#1d5ed6]"
              >
                Apply to join
              </Button>
            </motion.div>
          </div>

          <div className="p-6">
            <h3 className="text-base font-bold text-[#363636]">Talk to the studio team</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              For custom packages, bulk catalogue shoots or anything the packages above do not cover.
            </p>
            <div className="mt-5 space-y-2.5 text-sm text-gray-500">
              <a
                href="mailto:studio@cosora.in"
                className="flex items-center gap-2.5 transition-colors hover:text-[#256fef]"
              >
                <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                studio@cosora.in
              </a>
              <a
                href="tel:+919876543210"
                className="flex items-center gap-2.5 transition-colors hover:text-[#256fef]"
              >
                <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                +91 98765 43210
              </a>
              <p className="text-xs text-gray-400">
                Studios in Mumbai, Delhi, Bangalore, Surat, Jaipur and Tirupur.
              </p>
            </div>
          </div>
        </motion.section>
      </motion.div>

      {/* ── Booking chat ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ ease: E, duration: 0.24 }}
            className="fixed bottom-20 right-4 z-50 flex h-[440px] w-[calc(100vw-2rem)] max-w-[340px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl lg:bottom-6 lg:right-6"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#363636]">Cosora Studio</p>
                <p className="text-[11px] text-gray-400">Replies in about 5 minutes</p>
              </div>
              <button
                onClick={() => setShowChat(false)}
                aria-label="Close chat"
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-[#363636]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {thread.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.from === "vendor" ? "justify-end" : "justify-start"}`}
                >
                  <p
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      m.from === "vendor"
                        ? "rounded-br-md bg-[#256fef] text-white"
                        : "rounded-bl-md bg-gray-50 text-[#363636]"
                    }`}
                  >
                    {m.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Message"
                  placeholder="What do you need shot?"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  className="h-10 rounded-full border-[#d0d4dc] text-xs text-[#363636] placeholder:text-gray-400 focus-visible:border-[#256fef] focus-visible:ring-1 focus-visible:ring-[#256fef] focus-visible:ring-offset-0"
                />
                <motion.button
                  whileTap={reduced ? undefined : TAP}
                  transition={TAP_T}
                  onClick={send}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#256fef] text-white transition-colors hover:bg-[#1d5ed6]"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </div>
              {/* Legally required disclosure. Do not remove (see CLAUDE.md). */}
              <p className="mt-2 text-center text-[10px] text-gray-400">
                We&apos;ll be monitoring the messages for your safety.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showChat && (
        <motion.button
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ease: E, duration: 0.3 }}
          whileTap={reduced ? undefined : TAP}
          onClick={() => setShowChat(true)}
          aria-label="Chat with the Cosora Studio team"
          className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#256fef] text-white shadow-lg transition-colors hover:bg-[#1d5ed6] lg:bottom-6 lg:right-6"
        >
          <MessageCircle className="h-5 w-5" />
        </motion.button>
      )}
    </DashboardLayout>
  );
};

export default CosoraStudio;
