import { Link } from "react-router-dom";
import { useUserRole } from "@/contexts/UserRoleContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  Instagram,
  Mail,
  Menu,
  Handshake,
  Shield,
  Users,
} from "lucide-react";
import { faqText, useFaqs } from "@/lib/queries/faqs";
import { useLang } from "@/lib/i18n";
import { PRIMARY_TYPES } from "@/data/vendorTypes";
import { SUPPORT_INSTAGRAM } from "@/lib/supportContact";
import { useOverlayState } from "@/hooks/useBackCloses";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

// What registration actually asks for (submit_vendor_registration(), 2026-11-13). Until 2026-11-14 this
// page's lists, logos, figures and testimonials were invented (ToDo "Remove invented claims", 2026-09-26);
// everything below is something a seller can check in the app.
const documents = [
  "PAN card",
  "A business registration: Udyam, GST or CIN",
  "Aadhaar card, with all but the last four digits masked",
  "Your business details and at least one photo of your premises",
  "Your first product, with a photo and a price",
];

const valueProps = [
  {
    icon: Users,
    title: "Attract new customers",
    desc: "Reach qualified buyers actively looking for verified manufacturers and suppliers.",
  },
  {
    icon: Handshake,
    title: "Buyers pay you directly",
    desc: "You agree the price and terms with each buyer. Plans and ads are optional extras that help more buyers find you.",
  },
  {
    icon: Shield,
    title: "Checked before it goes live",
    desc: "Cosora reviews every listing and every buyer requirement before anyone sees it.",
  },
];

const howItWorks = [
  { step: "1", title: "Register", desc: "Add your business details, documents and first product. Cosora reviews your registration before your store goes live." },
  { step: "2", title: "List your products", desc: "Upload products with photos, sizes and prices. Each listing goes live once Cosora has reviewed it." },
  { step: "3", title: "Get requirements and quote", desc: "Buyers post what they need. Matching requirements reach your leads, and you quote and chat directly." },
];

const menuLinks = [
  { label: "Cosora FAQ", href: "/help" },
  { label: "Blogs", href: "/seller/blogs" },
  { label: "About Us", href: "/blogs/about" },
  { label: "Contact Us", href: "mailto:hello@cosora.in", external: true },
  { label: "Work with us!", href: "https://cosora.in/careers", external: true },
  { label: "Terms and conditions", href: "/terms" },
  { label: "Report Fraud", href: "/report-fraud" },
  { label: "How it works", href: "#how-it-works" },
];

const VendorLanding = () => {
  // Back closes the menu (review M-29).
  const [landingMenuOpen, setLandingMenuOpen] = useOverlayState();
  // Seller Registration FAQs are admin-edited in Cosora-Admin (/faqs) and read
  // live, signed out included. They replaced a hardcoded list here (2026-09-23).
  const { data: faqs, isPending: faqsLoading } = useFaqs("seller_registration");
  const lang = useLang();
  // A registered seller reaches this page by going back from Seller Home after registering: the buttons take them home
  // instead of offering to register again (2026-11-14).
  const { vendorRegistered } = useUserRole();
  const startTo = vendorRegistered ? "/seller-home" : "/onboarding";

  return (
    <div className="vendor-shell min-h-screen bg-[#ffffff] text-brand-ink">
      <header className="sticky top-0 z-50 border-b border-brand-border bg-[#ffffff]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="block">
            <img
              src="/cosoravendorlogo.png"
              alt="Cosora For Sellers"
              className="block h-12 w-auto object-contain sm:h-14"
              draggable={false}
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button
                size="sm"
                className="h-9 rounded-full bg-brand-vendor px-4 text-sm font-semibold text-[#ffffff] hover:bg-brand-vendor/90"
              >
                Login
              </Button>
            </Link>
            <Sheet open={landingMenuOpen} onOpenChange={setLandingMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border text-brand-ink transition-colors hover:bg-[#f5f5f5]"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 border-l border-brand-border bg-[#ffffff] p-4">
                <SheetHeader>
                  <SheetTitle className="text-left text-base font-semibold text-brand-ink">
                    Cosora Menu
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-4 space-y-2">
                  {menuLinks.map((item) => {
                    const isExternal = Boolean(item.external);
                    const isHash = item.href.startsWith("#");
                    // /blogs is the Journal app, reverse-proxied onto this
                    // origin. Same origin, but outside this router, so it needs
                    // a real anchor; a <Link> would match nothing and 404.
                    // Not target="_blank": it is the same site, not a new one.
                    const isProxied = item.href.startsWith("/blogs");
                    if (isExternal || isHash || isProxied) {
                      return (
                        <a
                          key={item.label}
                          href={item.href}
                          target={isExternal ? "_blank" : undefined}
                          rel={isExternal ? "noopener noreferrer" : undefined}
                          className="flex items-center justify-between rounded-xl border border-brand-border px-3 py-2 text-sm font-medium text-brand-ink transition-colors hover:bg-[#f5f5f5]"
                        >
                          {item.label}
                          <ChevronRight className="h-4 w-4 text-brand-ink/60" />
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center justify-between rounded-xl border border-brand-border px-3 py-2 text-sm font-medium text-brand-ink transition-colors hover:bg-[#f5f5f5]"
                      >
                        {item.label}
                        <ChevronRight className="h-4 w-4 text-brand-ink/60" />
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-5 rounded-2xl border border-brand-border bg-[#f5f5f5] p-3 text-xs text-brand-ink/70">
                  For support, write to <span className="font-semibold text-brand-ink">hello@cosora.in</span>
                </div>
                <Link to={startTo} className="mt-4 block">
                  <Button className="w-full rounded-full bg-brand-vendor text-[#ffffff] hover:bg-brand-vendor/90">
                    {vendorRegistered ? "Go to seller home" : "Get Started"}
                  </Button>
                </Link>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-4">
        <div className="flex justify-center">
          <span className="rounded-full border border-brand-border bg-[#f5f5f5] px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-ink">
            Register and sell for free on Cosora, the B2B marketplace for fashion and textiles
          </span>
        </div>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 shadow-sm">
            <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
              Sell to fashion and textile buyers,{" "}
              <span className="text-brand-buyer">directly</span>
            </h1>

            <div className="mt-4 overflow-hidden rounded-2xl border border-brand-border bg-[#f5f5f5]">
              <div className="aspect-video w-full">
                <iframe
                  className="h-full w-full"
                  src="https://www.youtube.com/embed/quogY2hgYFY"
                  title="Cosora Onboarding Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
                <Clock className="h-4 w-4 text-brand-vendor" />
                Get Started - it only takes 10 minutes
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {documents.map((doc) => (
                  <div key={doc} className="flex items-center gap-2 text-sm text-brand-ink/70">
                    <CheckCircle2 className="h-4 w-4 text-brand-success" />
                    {doc}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Link to={startTo} className="block">
                <Button className="h-12 w-full rounded-full bg-brand-vendor text-base font-semibold text-[#ffffff] hover:bg-brand-vendor/90">
                  {vendorRegistered ? "Go to seller home" : "Get Started"}
                </Button>
              </Link>
              <button
                type="button"
                className="w-full text-xs font-medium text-brand-vendor underline"
              >
                View existing applications
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-brand-border bg-[#f5f5f5] p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                B2B sourcing marketplace
              </span>
              <h2 className="mt-3 text-xl font-bold text-brand-ink">
                Get Seen by Serious Buyers. Get More Orders.
              </h2>
              <p className="mt-2 text-base text-brand-ink/70">
                Cosora is built for manufacturers, wholesalers, and suppliers who want to deal with buyers directly.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-brand-border shadow-sm">
              <div className="relative h-48">
                <img
                  src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&h=800&fit=crop"
                  alt="Cosora wholesale marketplace"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-brand-ink/70" />
                <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-[#ffffff]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ffffff]/70">Fashion Wholesale No.1: Market</p>
                  <h3 className="mt-2 text-lg font-bold">Online marketplace for fashion wholesale</h3>
                  <p className="mt-2 text-xs text-[#ffffff]/80">
                    Direct access to top brands and trusted manufacturers.
                  </p>
                  <a
                    href="https://cosora.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center justify-center rounded-full bg-brand-buyer px-5 py-2 text-xs font-semibold text-[#ffffff]"
                  >
                    Explore as Guest
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="space-y-4"
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold">Why should you partner with Cosora?</h2>
            <p className="mt-2 text-base text-brand-ink/70">
              Reach the right buyers, stay visible, and grow with trust signals that matter.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {valueProps.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-vendor/10 text-brand-vendor">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-brand-ink">{title}</h3>
                <p className="mt-1 text-sm text-brand-ink/70">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Link to={startTo}>
              <Button className="rounded-full bg-brand-vendor px-6 py-3 text-sm font-semibold text-[#ffffff] hover:bg-brand-vendor/90">
                {vendorRegistered ? "Go to seller home" : "Get Started"}
              </Button>
            </Link>
          </div>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          id="how-it-works"
          className="space-y-4"
        >
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {howItWorks.map((h) => (
              <div key={h.step} className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 shadow-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-vendor/10 text-sm font-bold text-brand-vendor">
                  {h.step}
                </span>
                <p className="mt-3 text-sm font-semibold">{h.title}</p>
                <p className="mt-1 text-sm text-brand-ink/70">{h.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          id="faq"
          className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div
            data-faq-surface="seller_registration"
            className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 shadow-sm"
          >
            <h3 className="text-lg font-semibold">Frequently asked questions</h3>
            {faqsLoading ? (
              <p className="mt-4 text-sm text-brand-ink/70">Loading questions…</p>
            ) : (
              faqs && faqs.length > 0 && (
                <Accordion type="single" collapsible className="mt-4">
                  {faqs.map((faq) => {
                    // A stored translation (P5) is already in the reader's language.
                    const text = faqText(faq, lang);
                    return (
                      <AccordionItem key={faq.id} value={faq.id} className="border-brand-border" data-no-translate={text.stored || undefined}>
                        <AccordionTrigger className="text-left text-sm font-medium text-brand-ink">
                          {text.question}
                        </AccordionTrigger>
                        {/* whitespace-pre-line: answers can hold line-broken lists. */}
                        <AccordionContent className="whitespace-pre-line text-base text-brand-ink/70">
                          {text.answer}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )
            )}
            <div className="mt-4 rounded-xl border border-brand-border bg-[#f5f5f5] p-3 text-sm text-brand-ink/70">
              Still have questions? Write to{" "}
              <a href="mailto:hello@cosora.in" className="font-semibold text-brand-vendor">
                hello@cosora.in
              </a>
            </div>
          </div>

          <div className="rounded-2xl bg-brand-buyer p-4 text-[#ffffff] shadow-sm">
            <span className="inline-flex items-center rounded-full bg-[#ffffff]/20 px-3 py-1 text-xs font-semibold">
              Limited-Time Offer
            </span>
            <h3 className="mt-3 text-xl font-bold">Pricing</h3>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-[#ffffff] p-4 text-brand-ink">
                <p className="text-sm font-semibold">Daily ads start at just</p>
                <p className="mt-1 text-2xl font-bold text-brand-buyer">₹22/day</p>
                <p className="mt-1 text-sm text-brand-ink/70">Start small and scale as you grow.</p>
              </div>
              <div className="rounded-2xl bg-[#ffffff] p-4 text-brand-ink">
                <p className="text-sm font-semibold">Registration Fee</p>
                <p className="mt-1 text-2xl font-bold text-brand-vendor">FREE</p>
                <p className="mt-1 text-sm text-brand-ink/70">Register and list products on the Free plan at no cost.</p>
              </div>
            </div>
            <Link to={startTo} className="mt-4 block">
              <Button className="h-11 w-full rounded-full bg-brand-vendor text-sm font-semibold text-[#ffffff] hover:bg-brand-vendor/90">
                {vendorRegistered ? "Go to seller home" : "Get Started"}
              </Button>
            </Link>
          </div>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 text-center shadow-sm"
        >
          <h2 className="text-2xl font-bold">Expand your reach</h2>
          <p className="mt-2 text-4xl font-bold text-brand-vendor">150+ countries</p>
          <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-brand-border bg-[#f5f5f5]">
            <Globe className="h-16 w-16 text-brand-vendor/40" />
          </div>
          <Link to={startTo} className="mt-4 inline-flex">
            <Button className="rounded-full bg-brand-vendor px-6 py-3 text-sm font-semibold text-[#ffffff] hover:bg-brand-vendor/90">
              {vendorRegistered ? "Go to seller home" : "Get Started"}
            </Button>
          </Link>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 shadow-sm">
            <h3 className="text-base font-semibold">Who sells on Cosora</h3>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRIMARY_TYPES.map((t) => (
                <div
                  key={t.value}
                  className="flex h-16 items-center justify-center rounded-xl border border-brand-border bg-[#f5f5f5] px-2 text-center text-sm font-medium text-brand-ink"
                >
                  {t.label}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-brand-border bg-[#f5f5f5] p-3 text-sm text-brand-ink/70">
              Explore as Guest takes you to the buyer view at cosora.in.
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                title: "Built for fashion and textile sourcing",
                desc: "Apparel, fabrics, trims, labels, packaging and the services around them, in one marketplace.",
              },
              {
                title: "Requirements come to you",
                desc: "Buyers post what they need, and the requirements that fit your products reach your leads first.",
              },
              {
                title: "In your language",
                desc: "Use Cosora in English, Hindi or Gujarati.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-brand-border bg-[#ffffff] p-4 shadow-sm">
                <p className="text-sm font-semibold text-brand-ink">{item.title}</p>
                <p className="mt-1 text-sm text-brand-ink/70">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-brand-border bg-[#f5f5f5] px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-brand-ink/70 sm:flex-row">
          <div className="flex items-center gap-4">
            <a
              href="mailto:hello@cosora.in"
              className="flex items-center gap-1.5 font-medium text-brand-ink"
            >
              <Mail className="h-4 w-4 text-brand-vendor" /> hello@cosora.in
            </a>
            <a
              href={SUPPORT_INSTAGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-medium text-brand-ink"
            >
              <Instagram className="h-4 w-4 text-brand-buyer" /> Instagram
            </a>
          </div>
          <p className="text-xs text-brand-ink/60">© 2024 Cosora</p>
        </div>
      </footer>
    </div>
  );
};

export default VendorLanding;
