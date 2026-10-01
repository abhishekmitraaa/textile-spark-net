import { useState, useMemo } from "react";
import { useFaqs, groupFaqs } from "@/lib/queries/faqs";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Search, Phone, Mail, Flag,
  ShoppingBag, CreditCard, User, HelpCircle, ChevronRight,
  Instagram, ArrowLeft, Store,
} from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { DeleteAccountCard } from "@/components/buyer/DeleteAccountCard";
import { useUserRole } from "@/contexts/UserRoleContext";
import {
  SUPPORT_EMAIL, SUPPORT_HOURS_LABEL, SUPPORT_INSTAGRAM, SUPPORT_PHONE, SUPPORT_PHONE_LABEL, supportMailto,
} from "@/lib/supportContact";

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
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

// FAQ content lives in public.faqs (surface "buyer_help") and is edited from
// Cosora-Admin's FAQs page with no deploy (2026-09-23). Only the data source
// changed here. Each category keeps the icon it had when it was hardcoded, and
// a category an admin adds later gets HelpCircle.
const FAQ_CATEGORY_ICONS: Record<string, typeof HelpCircle> = {
  "Getting Started": HelpCircle,
  "Orders & Quotes": ShoppingBag,
  "Payments & Billing": CreditCard,
  "Account Management": User,
};


// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

const Help = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const isSeller = role === "seller";
  const [faqOpen, setFaqOpen]         = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Same shape the hardcoded array had, so everything below renders as before.
  const { data: faqRows, isPending: faqsLoading } = useFaqs("buyer_help");
  const faqCategories = useMemo(
    () => groupFaqs(faqRows ?? []).map((g) => ({
      id: g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: g.label,
      icon: FAQ_CATEGORY_ICONS[g.label] ?? HelpCircle,
      faqs: g.faqs,
    })),
    [faqRows],
  );

  const filteredCategories = faqCategories.map(cat => ({
    ...cat,
    faqs: cat.faqs.filter(
      f => f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
           f.answer.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.faqs.length > 0);

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ fontFamily: "'Open Sans', Roboto, system-ui, sans-serif" }}
    >
      {/* ── Back header (no home tab strip in the profile section) ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Help &amp; Support</h1>
        </div>
      </div>

      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl lg:max-w-6xl mx-auto px-4 py-6 space-y-6 pb-28">

          {/* ── Welcome ── */}
          <motion.div variants={section}>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Welcome to Cosora's Customer Service
            </h2>
            <p className="text-sm text-gray-500">What can we help you with?</p>
          </motion.div>

          {/* Vendors land here from Settings and the seller sidebar, but the answers
              below are written for buyers (MPF-15). Until seller help exists, say so
              and point them at the people who can help. */}
          {isSeller && (
            <motion.div variants={section}>
              <Card className="border-brand-vendor/20 bg-brand-vendor/5">
                <CardContent className="p-4 flex gap-3">
                  <Store className="w-5 h-5 text-brand-vendor shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    The questions on this page are written for buyers. For help with your store, KYC,
                    leads, ads or billing, call or email us using the details below.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Desktop: contact/account rail (left) + FAQ & guides (right).
              Mobile: wrappers carry no layout, so the stack is unchanged. */}
          <motion.div variants={reduced ? {} : page} className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8 lg:items-start">
            {/* Left rail — contact & account */}
            <motion.div variants={reduced ? {} : page} className="space-y-6 lg:sticky lg:top-20">

          {/* ── Contact Us ── a phone line staffed in support hours, and email. */}
          <motion.div variants={section}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Contact Us</h3>
            <p className="text-xs text-gray-500 mb-4">{SUPPORT_HOURS_LABEL}</p>
            <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
              <motion.a
                variants={listItem}
                whileTap={TAP}
                transition={TAP_T}
                href={`tel:${SUPPORT_PHONE}`}
                className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 h-12 bg-brand-vendor rounded-full flex items-center justify-center mb-2">
                  <Phone className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Call us</span>
                <span className="text-xs text-gray-500">{SUPPORT_PHONE_LABEL}</span>
              </motion.a>

              <motion.a
                variants={listItem}
                whileTap={TAP}
                transition={TAP_T}
                href={supportMailto("Help request")}
                className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 border border-gray-300">
                  <Mail className="w-6 h-6 text-gray-900" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Email us</span>
                <span className="text-xs text-gray-500">{SUPPORT_EMAIL}</span>
              </motion.a>
            </motion.div>
            <Link
              to="/report-fraud"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline"
            >
              <Flag className="w-3.5 h-3.5" /> Report fraud
            </Link>
          </motion.div>

          {/* ── Follow Us ── */}
          <motion.div variants={section}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Follow Us</h3>
            <p className="text-xs text-gray-500 mb-4">
              Get connected for our latest news & updates!
            </p>
            <a
              href={SUPPORT_INSTAGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 bg-black rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors"
            >
              <Instagram className="w-5 h-5 text-white" />
            </a>
          </motion.div>

          {/* ── Email ── */}
          <motion.div variants={section} className="flex items-center gap-2 text-sm text-gray-700">
            <Mail className="w-4 h-4 shrink-0" />
            <span className="font-medium">Email -</span>
            <a href={supportMailto("Help request")} className="text-blue-600 hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </motion.div>

          {/* ── Delete Account ── emailed code, 14-day cooling-off, then anonymized */}
          <motion.div variants={section} data-clarity-mask="True">
            <DeleteAccountCard />
          </motion.div>
            </motion.div>{/* /Left rail */}

            {/* Right main — FAQ & quick guides */}
            <motion.div variants={reduced ? {} : page} className="space-y-6 mt-6 lg:mt-0">

          {/* ── FAQ — single collapsible dropdown ── */}
          <motion.div variants={section}>
            <Card className="border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setFaqOpen(p => !p)}
                className="w-full flex items-center justify-between px-6 py-5 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-brand-vendor/10">
                    <HelpCircle className="w-5 h-5 text-brand-vendor" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      Frequently Asked Questions
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {faqOpen
                        ? "Click to collapse"
                        : faqsLoading
                          ? "Loading questions…"
                          : `${faqCategories.reduce((a, c) => a + c.faqs.length, 0)} questions across ${faqCategories.length} topics`}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${faqOpen ? "rotate-90" : ""}`}
                />
              </button>

              {faqOpen && (
                <div className="border-t border-border">
                  {/* Search */}
                  <div className="px-6 py-4 border-b border-border/50 bg-muted/20">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search FAQs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm bg-background border-border"
                      />
                    </div>
                  </div>

                  {(searchQuery ? filteredCategories : faqCategories).length === 0 ? (
                    <div className="py-10 text-center">
                      <HelpCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      {searchQuery ? (
                        <>
                          <p className="text-sm text-muted-foreground">No results for "{searchQuery}"</p>
                          <button onClick={() => setSearchQuery("")} className="text-sm text-brand-vendor hover:underline mt-1">
                            Clear search
                          </button>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">{faqsLoading ? "Loading questions…" : "No questions yet."}</p>
                      )}
                    </div>
                  ) : (
                    (searchQuery ? filteredCategories : faqCategories).map((cat, catIdx) => (
                      <div key={cat.id} className={catIdx > 0 ? "border-t border-border/50" : ""}>
                        {/* Category label */}
                        <div className="flex items-center gap-2.5 px-6 py-3 bg-muted/10">
                          <div className="p-1.5 rounded-lg bg-brand-vendor/10">
                            <cat.icon className="w-3.5 h-3.5 text-brand-vendor" />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {cat.title}
                          </span>
                        </div>
                        {/* Q&As */}
                        <Accordion type="single" collapsible className="w-full">
                          {cat.faqs.map((faq, i) => (
                            <AccordionItem
                              key={i}
                              value={`${cat.id}-${i}`}
                              className="border-0 border-b border-border/40 last:border-b-0 px-6"
                            >
                              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline hover:text-brand-vendor py-4 gap-3">
                                {faq.question}
                              </AccordionTrigger>
                              <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                                {faq.answer}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          </motion.div>
            </motion.div>{/* /Right main */}
          </motion.div>{/* /two-column grid */}

          {/* ── Still Need Help ── */}
          <motion.div variants={section}>
            <Card className="bg-gradient-to-r from-brand-vendor/5 via-brand-vendor/10 to-brand-vendor/5 border-brand-vendor/20">
              <CardContent className="py-8 text-center">
                <h3 className="text-xl font-semibold text-foreground mb-2">Still need help?</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto text-sm">
                  Call us during support hours, or email us any time and the Cosora team will get back to you.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild className="bg-brand-vendor hover:bg-brand-vendor/90">
                    <a href={`tel:${SUPPORT_PHONE}`}>
                      <Phone className="w-4 h-4 mr-2" />
                      Call us
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="border-border">
                    <a href={supportMailto("Help request")}>
                      <Mail className="w-4 h-4 mr-2" />
                      Email us
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

      </motion.div>

      <MobileBottomNav />
    </div>
  );
};

export default Help;