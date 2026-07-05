import { Link } from "react-router-dom";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowRight,
  ShoppingBag,
  Building2,
  Search,
  FileText,
  Handshake,
  BadgeCheck,
  MessageSquare,
  BarChart3,
  Megaphone,
  Check,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CosoraLogo from "@/components/CosoraLogo";
import studioHero from "@/assets/cosora-studio-hero.jpg";

/**
 * Cosora landing page.
 * Theme lock: light. Single accent: Cosora red #C8102E (matched to the wordmark).
 * Type: Barlow Condensed (display, echoes the logo) + DM Sans (body).
 * Shape rule: buttons = pill, cards/images/panels = rounded-2xl.
 */

const RED = "#C8102E";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
};

/** Scroll-reveal wrapper. Collapses to static under reduced motion. */
const Reveal = ({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      custom={delay}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </motion.div>
  );
};

const Landing = () => {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans text-zinc-900 antialiased selection:bg-[#C8102E] selection:text-white">
      {/* ---------------------------------------------------------------- Nav */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-[#FAFAF8]/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 lg:px-10">
          <Link to="/" className="flex items-center">
            <CosoraLogo height={34} className="lg:hidden" />
            <CosoraLogo height={40} className="hidden lg:inline-block" />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#trade" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900">
              For buyers &amp; sellers
            </a>
            <a href="#how" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900">
              How it works
            </a>
            <a href="#why" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900">
              Why Cosora
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" className="rounded-full text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900">
                Sign in
              </Button>
            </Link>
            <Link to="/auth/login">
              <Button
                className="rounded-full bg-[#C8102E] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a60d24] active:scale-[0.98]"
              >
                Get started
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ------------------------------------------------------------- Hero */}
        <section className="mx-auto grid max-w-[1400px] items-center gap-10 px-5 pb-16 pt-12 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:pb-24 lg:pt-20">
          {/* Copy */}
          <div className="lg:col-span-6">
            <motion.span
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#C8102E]" />
              India&apos;s B2B fashion sourcing platform
            </motion.span>

            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 font-['Barlow_Condensed'] text-[3.25rem] font-extrabold uppercase italic leading-[0.92] tracking-[-0.01em] text-zinc-900 sm:text-7xl lg:text-[5.5rem]"
            >
              Where fashion
              <br />
              meets <span className="text-[#C8102E]">scale</span>
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-[48ch] text-base leading-relaxed text-zinc-600 lg:text-lg"
            >
              Source fabrics, post requirements, and get quotes from verified
              manufacturers across India. One platform for the whole supply chain.
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Link to="/auth/login" className="sm:w-auto">
                <Button
                  size="lg"
                  className="w-full gap-2 rounded-full bg-[#C8102E] px-7 text-base font-semibold text-white shadow-sm transition-all hover:bg-[#a60d24] active:scale-[0.98] sm:w-auto"
                >
                  Get started <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Button>
              </Link>
              <Link to="/browse" className="sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full rounded-full border-zinc-300 bg-white px-7 text-base font-medium text-zinc-800 transition-all hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] sm:w-auto"
                >
                  Browse products
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* Visual */}
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative lg:col-span-6"
          >
            <div className="overflow-hidden rounded-2xl border border-zinc-200 shadow-[0_24px_60px_-24px_rgba(200,16,46,0.28)]">
              <img
                src={studioHero}
                alt="Fashion studio shoot for a Cosora brand"
                className="aspect-[4/3] w-full object-cover lg:aspect-[5/4]"
                loading="eager"
              />
            </div>
            {/* single real stat, not a decorative caption */}
            <div className="absolute -bottom-5 left-5 rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-lg">
              <p className="font-['Barlow_Condensed'] text-3xl font-extrabold italic leading-none text-zinc-900">
                ₹500Cr+
              </p>
              <p className="mt-1 text-xs font-medium text-zinc-500">sourced through Cosora</p>
            </div>
          </motion.div>
        </section>

        {/* ------------------------------------------------------- Stats band */}
        <section className="border-y border-zinc-200 bg-white">
          <div className="mx-auto grid max-w-[1400px] grid-cols-2 divide-zinc-200 px-5 py-10 sm:divide-x lg:grid-cols-4 lg:px-10">
            {[
              { value: "50K+", label: "Products listed" },
              { value: "10K+", label: "Verified brands" },
              { value: "5K+", label: "Manufacturers" },
              { value: "28", label: "States covered" },
            ].map(({ value, label }, i) => (
              <Reveal key={label} delay={i} className="px-2 py-3 text-center sm:px-6">
                <p className="font-['Barlow_Condensed'] text-4xl font-extrabold italic leading-none text-zinc-900 lg:text-5xl">
                  {value}
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-500">{label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- Two-path / trade */}
        <section id="trade" className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10 lg:py-28">
          <Reveal className="max-w-2xl">
            <h2 className="font-['Barlow_Condensed'] text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-zinc-900 lg:text-6xl">
              Built for both sides<br className="hidden sm:block" /> of the trade
            </h2>
            <p className="mt-4 max-w-[52ch] text-base text-zinc-600 lg:text-lg">
              Whether you are sourcing your next collection or filling your
              production line, Cosora connects you to the right partner.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* Buyer panel */}
            <Reveal delay={0}>
              <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-8 transition-shadow hover:shadow-[0_20px_50px_-24px_rgba(24,24,27,0.25)] lg:p-10">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8102E]/10">
                  <ShoppingBag className="h-6 w-6 text-[#C8102E]" strokeWidth={1.75} />
                </div>
                <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-tight text-zinc-900">
                  For buyers
                </h3>
                <p className="mt-2 text-zinc-600">
                  Brands, retailers, and designers sourcing products at scale.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "Browse 50,000+ products from verified suppliers",
                    "Post a requirement and get matched quotes",
                    "Compare and negotiate in one chat thread",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-zinc-700">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#C8102E]" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/auth/login" className="mt-8">
                  <Button className="w-full gap-2 rounded-full bg-zinc-900 text-sm font-semibold text-white transition-all hover:bg-zinc-800 active:scale-[0.98] sm:w-auto">
                    Join as a buyer <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </Link>
              </div>
            </Reveal>

            {/* Seller panel */}
            <Reveal delay={1}>
              <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#C8102E]/30 bg-[#C8102E] p-8 text-white transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(200,16,46,0.55)] lg:p-10">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Building2 className="h-6 w-6 text-white" strokeWidth={1.75} />
                </div>
                <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-tight">
                  For sellers
                </h3>
                <p className="mt-2 text-white/80">
                  Manufacturers, mills, and suppliers reaching serious buyers.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "List unlimited products and services",
                    "Receive qualified leads from active buyers",
                    "Track Total Order Value and run ads",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-white/90">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-white" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/seller" className="mt-8">
                  <Button className="w-full gap-2 rounded-full bg-white text-sm font-semibold text-[#C8102E] transition-all hover:bg-white/90 active:scale-[0.98] sm:w-auto">
                    Join as a seller <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- How it works */}
        <section id="how" className="border-y border-zinc-200 bg-white">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-20 lg:grid-cols-12 lg:gap-16 lg:px-10 lg:py-28">
            <div className="lg:col-span-4">
              <Reveal>
                <h2 className="font-['Barlow_Condensed'] text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-zinc-900 lg:text-6xl">
                  Sourcing,<br />without the back<br className="hidden lg:block" /> and forth
                </h2>
                <p className="mt-4 max-w-[42ch] text-base text-zinc-600 lg:text-lg">
                  Three steps from a vague idea to a confirmed order, with
                  verified vendors at every stage.
                </p>
              </Reveal>
            </div>

            <div className="relative lg:col-span-8">
              {/* connecting line */}
              <span
                aria-hidden
                className="absolute left-6 top-6 hidden h-[calc(100%-3rem)] w-px bg-zinc-200 lg:block"
              />
              <div className="space-y-8">
                {[
                  {
                    icon: FileText,
                    title: "Post what you need",
                    body: "Describe your requirement or snap a photo. A Quick RFQ takes under 30 seconds.",
                  },
                  {
                    icon: Search,
                    title: "Get matched quotes",
                    body: "Verified manufacturers respond with pricing, MOQ, and lead times you can compare.",
                  },
                  {
                    icon: Handshake,
                    title: "Order with confidence",
                    body: "Negotiate in-app, lock terms, and track every order through to delivery.",
                  },
                ].map(({ icon: Icon, title, body }, i) => (
                  <Reveal key={title} delay={i}>
                    <div className="relative flex gap-5">
                      <div className="z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-[#C8102E] shadow-sm">
                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="pt-1">
                        <h3 className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-tight text-zinc-900">
                          {title}
                        </h3>
                        <p className="mt-1 max-w-[56ch] text-zinc-600">{body}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Why Cosora */}
        <section id="why" className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10 lg:py-28">
          <Reveal className="max-w-2xl">
            <h2 className="font-['Barlow_Condensed'] text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-zinc-900 lg:text-6xl">
              Why teams choose Cosora
            </h2>
            <p className="mt-4 max-w-[52ch] text-base text-zinc-600 lg:text-lg">
              The trust, tools, and reach that a fragmented supply chain has
              always been missing.
            </p>
          </Reveal>

          {/* Bento: 5 cells, asymmetric, mixed backgrounds */}
          <div className="mt-12 grid gap-5 md:grid-cols-6">
            {/* large image cell */}
            <Reveal delay={0} className="md:col-span-4">
              <div className="group relative h-full min-h-[20rem] overflow-hidden rounded-2xl border border-zinc-200">
                <img
                  src="https://picsum.photos/seed/cosora-textile-mill-fabric/1000/700"
                  alt="Fabric rolls at a textile manufacturer"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />
                <div className="relative flex h-full flex-col justify-end p-8">
                  <BadgeCheck className="mb-3 h-7 w-7 text-white" strokeWidth={1.75} />
                  <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-tight text-white">
                    Verified manufacturers
                  </h3>
                  <p className="mt-1 max-w-[44ch] text-sm text-white/85">
                    Every supplier is vetted, and TradeSEAL partners carry a paid
                    verification badge buyers can trust.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* red accent cell */}
            <Reveal delay={1} className="md:col-span-2">
              <div className="flex h-full min-h-[20rem] flex-col justify-between rounded-2xl bg-[#C8102E] p-8 text-white">
                <MessageSquare className="h-7 w-7" strokeWidth={1.75} />
                <div>
                  <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-tight">
                    Quotes &amp; chat in one place
                  </h3>
                  <p className="mt-2 text-sm text-white/85">
                    Compare offers and negotiate without leaving the platform.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* three small cells */}
            <Reveal delay={0} className="md:col-span-2">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-8">
                <BarChart3 className="h-7 w-7 text-[#C8102E]" strokeWidth={1.75} />
                <div className="mt-8">
                  <h3 className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-tight text-zinc-900">
                    Leads &amp; analytics
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    See who is viewing, enquiring, and ordering, in real time.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={1} className="md:col-span-2">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-8">
                <Megaphone className="h-7 w-7 text-[#C8102E]" strokeWidth={1.75} />
                <div className="mt-8">
                  <h3 className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-tight text-zinc-900">
                    Built-in ad platform
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Put your products in front of active buyers, on your budget.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={2} className="md:col-span-2">
              <div className="group relative h-full min-h-[12rem] overflow-hidden rounded-2xl border border-zinc-200">
                <img
                  src="https://picsum.photos/seed/cosora-garment-tailoring-studio/700/700"
                  alt="Garment production in a studio"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/75 to-transparent" />
                <div className="relative flex h-full flex-col justify-end p-8">
                  <h3 className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-tight text-white">
                    Pan-India network
                  </h3>
                  <p className="mt-1 text-sm text-white/85">
                    From Surat to Tiruppur, the country&apos;s makers in one place.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- Testimonial */}
        <section className="border-y border-zinc-200 bg-white">
          <div className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10 lg:py-28">
            <Reveal className="mx-auto max-w-3xl text-center">
              <div className="mb-6 flex justify-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-[#C8102E] text-[#C8102E]" strokeWidth={0} />
                ))}
              </div>
              <blockquote className="font-['Barlow_Condensed'] text-3xl font-bold uppercase leading-[1.05] tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
                &ldquo;We cut our sampling cycle from weeks to days. The vendors are
                real, the quotes are fast.&rdquo;
              </blockquote>
              <figcaption className="mt-8 flex items-center justify-center gap-3">
                <img
                  src="https://picsum.photos/seed/ananya-desai-founder/96/96"
                  alt=""
                  className="h-11 w-11 rounded-full object-cover"
                  loading="lazy"
                />
                <div className="text-left">
                  <p className="text-sm font-semibold text-zinc-900">Ananya Desai</p>
                  <p className="text-sm text-zinc-500">Founder, Indigo Loom Apparel</p>
                </div>
              </figcaption>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- Final CTA */}
        <section className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10 lg:py-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[#C8102E] px-8 py-16 text-center lg:px-16 lg:py-20">
              <h2 className="mx-auto max-w-3xl font-['Barlow_Condensed'] text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-white sm:text-6xl lg:text-7xl">
                Start sourcing smarter today
              </h2>
              <p className="mx-auto mt-4 max-w-[46ch] text-base text-white/85 lg:text-lg">
                Join the brands and manufacturers building India&apos;s fashion
                supply chain on Cosora.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/auth/login">
                  <Button
                    size="lg"
                    className="gap-2 rounded-full bg-white px-8 text-base font-semibold text-[#C8102E] shadow-sm transition-all hover:bg-white/90 active:scale-[0.98]"
                  >
                    Get started <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/40 bg-transparent px-8 text-base font-medium text-white transition-all hover:bg-white/10 active:scale-[0.98]"
                  >
                    Sign in
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* -------------------------------------------------------------- Footer */}
      <footer className="border-t border-zinc-200 bg-[#FAFAF8]">
        <div className="mx-auto max-w-[1400px] px-5 py-14 lg:px-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <CosoraLogo height={36} />
              <p className="mt-4 max-w-[34ch] text-sm text-zinc-500">
                The B2B sourcing marketplace for India&apos;s fashion and textile
                industry.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-900">Platform</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link to="/browse" className="text-zinc-500 transition-colors hover:text-zinc-900">Browse products</Link></li>
                <li><Link to="/post-requirement" className="text-zinc-500 transition-colors hover:text-zinc-900">Post a requirement</Link></li>
                <li><Link to="/cosora-studio" className="text-zinc-500 transition-colors hover:text-zinc-900">Cosora Studio</Link></li>
                <li><Link to="/seller" className="text-zinc-500 transition-colors hover:text-zinc-900">Become a seller</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-900">Company</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link to="/about" className="text-zinc-500 transition-colors hover:text-zinc-900">About</Link></li>
                <li><a href="#why" className="text-zinc-500 transition-colors hover:text-zinc-900">Why Cosora</a></li>
                <li><a href="#how" className="text-zinc-500 transition-colors hover:text-zinc-900">How it works</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-900">Support</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link to="/help" className="text-zinc-500 transition-colors hover:text-zinc-900">Help center</Link></li>
                <li><Link to="/report-fraud" className="text-zinc-500 transition-colors hover:text-zinc-900">Report fraud</Link></li>
                <li><Link to="/login" className="text-zinc-500 transition-colors hover:text-zinc-900">Sign in</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-200 pt-6 sm:flex-row">
            <p className="text-xs text-zinc-400">© 2026 Cosora. All rights reserved.</p>
            <p className="text-xs text-zinc-400">Made in India for India&apos;s fashion trade.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;