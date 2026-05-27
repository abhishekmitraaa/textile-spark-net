import { Link } from "react-router-dom";
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
  Percent,
  Shield,
  Star,
  Users,
} from "lucide-react";
import hotpingLogo from "@/assets/brands/hotping.png";
import mocoBlingLogo from "@/assets/brands/moco-bling.png";
import merongShopLogo from "@/assets/brands/merong-shop.png";
import styleNandaLogo from "@/assets/brands/style-nanda.png";
import chuuFashionLogo from "@/assets/brands/chuu-fashion.png";
import codibookLogo from "@/assets/brands/codibook.png";
import gogosingLogo from "@/assets/brands/gogosing.png";
import envylookLogo from "@/assets/brands/envylook.png";
import styleonmeLogo from "@/assets/brands/styleonme.png";
import secretLabelLogo from "@/assets/brands/secret-label.png";
import imvelyLogo from "@/assets/brands/imvely.png";
import cherrykokoLogo from "@/assets/brands/cherrykoko.png";
import sappunLogo from "@/assets/brands/sappun.png";
import brandiLogo from "@/assets/brands/brandi.png";
import pastelLogo from "@/assets/brands/pastel.png";
import nuguLogo from "@/assets/brands/nugu.png";
import ohotoroLogo from "@/assets/brands/ohotoro.png";
import naning9Logo from "@/assets/brands/naning9.png";
import holicholicLogo from "@/assets/brands/holicholic.png";
import uptownHolicLogo from "@/assets/brands/uptown-holic.png";
import elevenAmLogo from "@/assets/brands/11am.png";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const documents = [
  "PAN Card",
  "CIN details",
  "Aadhaar card",
  "GST number (if applicable)",
  "Primary business information",
];

const valueProps = [
  {
    icon: Users,
    title: "Attract new customers",
    desc: "Reach qualified buyers actively looking for verified manufacturers and suppliers.",
  },
  {
    icon: Percent,
    title: "0% commission fee",
    desc: "Keep 100% of your earnings. No commission cuts or hidden deductions.",
  },
  {
    icon: Shield,
    title: "Trusted by brands",
    desc: "Join a trusted network of fashion brands and sourcing teams across India.",
  },
];

const brandLogos = [
  { name: "Hotping", src: hotpingLogo },
  { name: "Moco Bling", src: mocoBlingLogo },
  { name: "Merong Shop", src: merongShopLogo },
  { name: "Style Nanda", src: styleNandaLogo },
  { name: "Chuu Fashion", src: chuuFashionLogo },
  { name: "Codibook", src: codibookLogo },
  { name: "Gogosing", src: gogosingLogo },
  { name: "Envylook", src: envylookLogo },
  { name: "Styleonme", src: styleonmeLogo },
  { name: "Secret Label", src: secretLabelLogo },
  { name: "Imvely", src: imvelyLogo },
  { name: "Cherrykoko", src: cherrykokoLogo },
  { name: "Sappun", src: sappunLogo },
  { name: "Brandi", src: brandiLogo },
  { name: "Pastel", src: pastelLogo },
  { name: "Nugu", src: nuguLogo },
  { name: "Ohotoro", src: ohotoroLogo },
  { name: "Naning9", src: naning9Logo },
  { name: "Holicholic", src: holicholicLogo },
  { name: "Uptown Holic", src: uptownHolicLogo },
  { name: "11AM", src: elevenAmLogo },
];

const testimonials = [
  {
    name: "Arshad Khan",
    business: "Surat Textile Co., Surat",
    quote: "Cosora replaced brokers for us. We now speak directly to buyers and close faster.",
    rating: 5,
  },
  {
    name: "Neha Iyer",
    business: "Delhi Fabric House, Delhi",
    quote: "Our catalog is finally visible to serious brands. Lead quality is noticeably better.",
    rating: 5,
  },
  {
    name: "Amit Patel",
    business: "Tiruppur Knitwear Hub, Tamil Nadu",
    quote: "We started getting RFQs within days. The onboarding was quick and clear.",
    rating: 5,
  },
];

const faqs = [
  {
    q: "How long does onboarding take?",
    a: "Around 10 minutes with PAN, Aadhaar, business address, and one product photo.",
  },
  {
    q: "Is there any joining fee?",
    a: "Registration is completely free. You can list products once verified.",
  },
  {
    q: "How do I get buyer leads?",
    a: "Buyers discover you through search, category pages, and requirement postings.",
  },
  {
    q: "Can I sell outside India?",
    a: "Yes. Cosora connects you with buyer teams across 150+ countries.",
  },
];

const menuLinks = [
  { label: "Cosora FAQ", href: "/help" },
  { label: "Blogs", href: "/seller/blogs" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "mailto:hello@cosora.in", external: true },
  { label: "Work with us!", href: "https://cosora.in/careers", external: true },
  { label: "Terms and conditions", href: "/auth/terms" },
  { label: "Report Fraud", href: "/report-fraud" },
  { label: "Success Stories", href: "#success-stories" },
];

const VendorLanding = () => {
  return (
    <div className="min-h-screen bg-[#ffffff] text-[#363636]">
      <header className="sticky top-0 z-50 border-b border-[#d0d4dc] bg-[#ffffff]/95 backdrop-blur">
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
                className="h-9 rounded-full bg-[#256fef] px-4 text-sm font-semibold text-[#ffffff] hover:bg-[#256fef]/90"
              >
                Login
              </Button>
            </Link>
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d0d4dc] text-[#363636] transition-colors hover:bg-[#f5f5f5]"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 border-l border-[#d0d4dc] bg-[#ffffff] p-4">
                <SheetHeader>
                  <SheetTitle className="text-left text-base font-semibold text-[#363636]">
                    Cosora Menu
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-4 space-y-2">
                  {menuLinks.map((item) => {
                    const isExternal = Boolean(item.external);
                    const isHash = item.href.startsWith("#");
                    if (isExternal || isHash) {
                      return (
                        <a
                          key={item.label}
                          href={item.href}
                          target={isExternal ? "_blank" : undefined}
                          rel={isExternal ? "noopener noreferrer" : undefined}
                          className="flex items-center justify-between rounded-xl border border-[#d0d4dc] px-3 py-2 text-sm font-medium text-[#363636] transition-colors hover:bg-[#f5f5f5]"
                        >
                          {item.label}
                          <ChevronRight className="h-4 w-4 text-[#363636]/60" />
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center justify-between rounded-xl border border-[#d0d4dc] px-3 py-2 text-sm font-medium text-[#363636] transition-colors hover:bg-[#f5f5f5]"
                      >
                        {item.label}
                        <ChevronRight className="h-4 w-4 text-[#363636]/60" />
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-5 rounded-2xl border border-[#d0d4dc] bg-[#f5f5f5] p-3 text-xs text-[#363636]/70">
                  For support, write to <span className="font-semibold text-[#363636]">hello@cosora.in</span>
                </div>
                <Link to="/onboarding" className="mt-4 block">
                  <Button className="w-full rounded-full bg-[#256fef] text-[#ffffff] hover:bg-[#256fef]/90">
                    Get Started
                  </Button>
                </Link>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-4">
        <div className="flex justify-center">
          <span className="rounded-full border border-[#d0d4dc] bg-[#f5f5f5] px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#363636]">
            Sell for free on India&apos;s largest online B2B marketplace
          </span>
        </div>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 shadow-sm">
            <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
              Sell online to Global customers at{" "}
              <span className="text-[#ef4d62]">0% Commission</span>
            </h1>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[#d0d4dc] bg-[#f5f5f5]">
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
              <div className="flex items-center gap-2 text-sm font-semibold text-[#363636]">
                <Clock className="h-4 w-4 text-[#256fef]" />
                Get Started - it only takes 10 minutes
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {documents.map((doc) => (
                  <div key={doc} className="flex items-center gap-2 text-sm text-[#363636]/70">
                    <CheckCircle2 className="h-4 w-4 text-[#14ae5c]" />
                    {doc}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Link to="/onboarding" className="block">
                <Button className="h-12 w-full rounded-full bg-[#256fef] text-base font-semibold text-[#ffffff] hover:bg-[#256fef]/90">
                  Get Started
                </Button>
              </Link>
              <button
                type="button"
                className="w-full text-xs font-medium text-[#256fef] underline"
              >
                View existing applications
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[#d0d4dc] bg-[#f5f5f5] p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#363636]/60">
                B2B sourcing marketplace
              </span>
              <h2 className="mt-3 text-xl font-bold text-[#363636]">
                Get Seen by Serious Buyers. Get More Orders.
              </h2>
              <p className="mt-2 text-base text-[#363636]/70">
                Cosora is built for manufacturers, wholesalers, and suppliers who need direct access to verified buyers.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#d0d4dc] shadow-sm">
              <div className="relative h-48">
                <img
                  src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&h=800&fit=crop"
                  alt="Cosora wholesale marketplace"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[#363636]/70" />
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
                    className="mt-4 inline-flex items-center justify-center rounded-full bg-[#ef4d62] px-5 py-2 text-xs font-semibold text-[#ffffff]"
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
            <p className="mt-2 text-base text-[#363636]/70">
              Reach the right buyers, stay visible, and grow with trust signals that matter.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {valueProps.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#256fef]/10 text-[#256fef]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#363636]">{title}</h3>
                <p className="mt-1 text-sm text-[#363636]/70">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:gap-4 sm:pb-0">
            {brandLogos.map((brand) => (
              <div
                key={brand.name}
                className="flex h-20 w-32 flex-shrink-0 snap-start items-center justify-center rounded-2xl border border-[#d0d4dc] bg-[#f5f5f5] sm:w-40 lg:w-44"
              >
                <img
                  src={brand.src}
                  alt={`${brand.name} logo`}
                  className="h-9 w-auto object-contain sm:h-10"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Link to="/onboarding">
              <Button className="rounded-full bg-[#256fef] px-6 py-3 text-sm font-semibold text-[#ffffff] hover:bg-[#256fef]/90">
                Get Started
              </Button>
            </Link>
          </div>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          id="success-stories"
          className="space-y-4"
        >
          <h2 className="text-center text-2xl font-bold">Seller success stories</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 shadow-sm">
                <div className="mb-2 flex gap-1">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-[#ef4d62] text-[#ef4d62]" />
                  ))}
                </div>
                <p className="text-base text-[#363636]">"{t.quote}"</p>
                <p className="mt-3 text-sm font-semibold">{t.name}</p>
                <p className="text-sm text-[#363636]/70">{t.business}</p>
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
          <div className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Frequently asked questions</h3>
              <a
                href="/help"
                className="rounded-full border border-[#d0d4dc] px-3 py-1 text-[11px] font-semibold text-[#256fef]"
              >
                FAQ FILE LINK
              </a>
            </div>
            <Accordion type="single" collapsible className="mt-4">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-[#d0d4dc]">
                  <AccordionTrigger className="text-left text-sm font-medium text-[#363636]">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base text-[#363636]/70">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <div className="mt-4 rounded-xl border border-[#d0d4dc] bg-[#f5f5f5] p-3 text-sm text-[#363636]/70">
              Looking for more answers? Visit the Cosora FAQ for complete onboarding guidance.
            </div>
          </div>

          <div className="rounded-2xl bg-[#ef4d62] p-4 text-[#ffffff] shadow-sm">
            <span className="inline-flex items-center rounded-full bg-[#ffffff]/20 px-3 py-1 text-xs font-semibold">
              Limited-Time Offer
            </span>
            <h3 className="mt-3 text-xl font-bold">Pricing</h3>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-[#ffffff] p-4 text-[#363636]">
                <p className="text-sm font-semibold">Daily ads start at just</p>
                <p className="mt-1 text-2xl font-bold text-[#ef4d62]">Rs 25/day</p>
                <p className="mt-1 text-sm text-[#363636]/70">Start small and scale as you grow.</p>
              </div>
              <div className="rounded-2xl bg-[#ffffff] p-4 text-[#363636]">
                <p className="text-sm font-semibold">Registration Fee</p>
                <p className="mt-1 text-2xl font-bold text-[#256fef]">FREE</p>
                <p className="mt-1 text-sm text-[#363636]/70">List products and get verified at no cost.</p>
              </div>
            </div>
            <Link to="/onboarding" className="mt-4 block">
              <Button className="h-11 w-full rounded-full bg-[#256fef] text-sm font-semibold text-[#ffffff] hover:bg-[#256fef]/90">
                Get Started
              </Button>
            </Link>
          </div>
        </motion.section>

        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 text-center shadow-sm"
        >
          <h2 className="text-2xl font-bold">Expand your reach</h2>
          <p className="mt-2 text-4xl font-bold text-[#256fef]">150+ countries</p>
          <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-[#d0d4dc] bg-[#f5f5f5]">
            <Globe className="h-16 w-16 text-[#256fef]/40" />
          </div>
          <Link to="/onboarding" className="mt-4 inline-flex">
            <Button className="rounded-full bg-[#256fef] px-6 py-3 text-sm font-semibold text-[#ffffff] hover:bg-[#256fef]/90">
              Get Started
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
          <div className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 shadow-sm">
            <h3 className="text-base font-semibold">Trusted by global brands</h3>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {brandLogos.slice(0, 12).map((brand) => (
                <div
                  key={brand.name}
                  className="flex h-20 items-center justify-center rounded-xl border border-[#d0d4dc] bg-[#f5f5f5]"
                >
                  <img
                    src={brand.src}
                    alt={`${brand.name} logo`}
                    className="h-9 w-auto object-contain"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-[#d0d4dc] bg-[#f5f5f5] p-3 text-sm text-[#363636]/70">
              Explore as Guest takes you to the buyer view at cosora.in.
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                title: "Best fashion wholesale",
                desc: "Trusted by over 1 million users worldwide. Seamless service for businesses globally.",
              },
              {
                title: "A wide range of fashion items",
                desc: "Women&apos;s, men&apos;s, and children&apos;s clothing. Over 60,000 items updated daily.",
              },
              {
                title: "Trusted by 95% of shopping malls",
                desc: "Preferred by retailers and buying teams across India.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-[#d0d4dc] bg-[#ffffff] p-4 shadow-sm">
                <p className="text-sm font-semibold text-[#363636]">{item.title}</p>
                <p className="mt-1 text-sm text-[#363636]/70">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-[#d0d4dc] bg-[#f5f5f5] px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-[#363636]/70 sm:flex-row">
          <div className="flex items-center gap-4">
            <a
              href="mailto:hello@cosora.in"
              className="flex items-center gap-1.5 font-medium text-[#363636]"
            >
              <Mail className="h-4 w-4 text-[#256fef]" /> hello@cosora.in
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-medium text-[#363636]"
            >
              <Instagram className="h-4 w-4 text-[#ef4d62]" /> Instagram
            </a>
          </div>
          <p className="text-xs text-[#363636]/60">© 2024 Cosora</p>
        </div>
      </footer>
    </div>
  );
};

export default VendorLanding;
