import { motion, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Camera, Mail } from "lucide-react";
import heroImage from "@/assets/cosora-studio-hero.jpg";
import { useUserRole } from "@/contexts/UserRoleContext";
import BuyerShell from "@/components/buyer/BuyerShell";
import { SUPPORT_EMAIL } from "@/lib/supportContact";

// Cosora Studio (2026-11-05; ToDo "Remove invented claims and real brand names still on live pages").
// Until then this page listed invented studios with real brands as clients ("Featured in Vogue India"),
// invented ratings, review counts and flat-rate packages, a made-up phone number, and a booking chat
// whose message went nowhere and whose reply was scripted. No photographer has joined yet, so the page
// says that, and both actions are emails to Cosora's real inbox (Mitra 2026-11-05: "Replace with honest
// copy"). When studios exist, list them from the database here.

/* ── Motion (project standard, see CLAUDE.md) ───────────────────────────── */
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};

const mail = (subject: string) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

const ACTIONS = [
  {
    title: "Need product photos?",
    body: "Tell us what you sell, how many products and where you are. We'll write back when Cosora Studio can take your shoot.",
    cta: "Email us about a shoot",
    href: mail("Cosora Studio: a shoot for my listings"),
  },
  {
    title: "Are you a photographer?",
    body: "Product, fashion and textile photographers can write to us with their city and a few samples of their work to be among the first listed.",
    cta: "Email us to join",
    href: mail("Cosora Studio: I'm a photographer"),
  },
];

const CosoraStudio = () => {
  // A shared page keeps the side the person came from (2026-11-19, review M-14: buyers got the seller dashboard frame).
  const { role } = useUserRole();
  const Layout = role === "seller" ? DashboardLayout : BuyerShell;
  const reduced = useReducedMotion();

  return (
    <Layout>
      <motion.div
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-6xl space-y-8 pb-6"
      >
        <motion.section
          variants={section}
          className="grid overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:grid-cols-[1.05fr_1fr]"
        >
          <div className="order-2 flex flex-col justify-center p-6 md:order-1 md:p-9">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-vendor/10 px-3 py-1 text-xs font-medium text-brand-vendor">
              <Camera className="h-3.5 w-3.5" strokeWidth={2} />
              Coming soon
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Cosora Studio</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              Product photography for your Cosora listings. We're bringing photographers on board now; no studio can be
              booked through Cosora yet.
            </p>
          </div>
          <div className="relative order-1 min-h-[180px] md:order-2 md:min-h-[340px]">
            <img src={heroImage} alt="A fashion product shoot" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </motion.section>

        <motion.section
          variants={section}
          className="grid overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:grid-cols-2"
        >
          {ACTIONS.map((a) => (
            <div key={a.title} className="border-b border-gray-100 p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <h2 className="text-base font-bold text-brand-ink">{a.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{a.body}</p>
              <a
                href={a.href}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-brand-vendor px-6 text-sm font-semibold text-white transition-colors hover:bg-[#1d5ed6]"
              >
                <Mail className="h-4 w-4" />
                {a.cta}
              </a>
            </div>
          ))}
        </motion.section>
      </motion.div>
    </Layout>
  );
};

export default CosoraStudio;
