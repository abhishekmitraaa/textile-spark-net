import { useState, useMemo } from "react";
import { faqText, useFaqs, groupFaqs } from "@/lib/queries/faqs";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Search, Phone, Mail, Flag,
  ShoppingBag, CreditCard, User, HelpCircle, ChevronRight,
  Instagram, ArrowLeft, Store, MessageCircle, PhoneCall, Lightbulb, ListChecks, BookOpen,
  ShieldCheck, Users, Package, Megaphone,
} from "lucide-react";
import type { ReactNode } from "react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { DeleteAccountCard } from "@/components/buyer/DeleteAccountCard";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/lib/i18n";
import {
  SUPPORT_EMAIL, SUPPORT_INSTAGRAM, SUPPORT_PHONE, SUPPORT_PHONE_LABEL, supportMailto,
} from "@/lib/supportContact";
import { hoursLabel, labelIn, useHelpGuides, useSupportStatus } from "@/lib/queries/support";
import { HoursBanner } from "@/components/support/SupportFrame";

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

// FAQ content lives in public.faqs and is edited from Cosora-Admin's FAQs page with
// no deploy (2026-09-23): "buyer_help" for buyers, "seller_help" for sellers (P5,
// 2026-10-01). Each category keeps its icon, and a category an admin adds later gets
// HelpCircle.
const FAQ_CATEGORY_ICONS: Record<string, typeof HelpCircle> = {
  "Getting Started": HelpCircle,
  "Orders & Quotes": ShoppingBag,
  "Payments & Billing": CreditCard,
  "Account Management": User,
  "KYC and verification": ShieldCheck,
  "Leads and quotes": Users,
  "Listings and videos": Package,
  "Advertising": Megaphone,
  "Plans and billing": CreditCard,
  "Account and suspension": User,
};


// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

const Help = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const isSeller = role === "seller";
  const { user } = useAuth();
  const lang = useLang();
  // support_status() answers signed out too. `available` says whether chat,
  // callbacks, the in-app fraud report and feedback are open to this person
  // (rollout). When it's false, or the call fails, Help is the P1 page: phone and email.
  const status = useSupportStatus(user?.id);
  const available = Boolean(user) && Boolean(status.data?.available);
  const audience = isSeller ? "vendor" : "buyer";
  const { data: allGuides } = useHelpGuides();
  const guides = (allGuides ?? []).filter((g) => g.audience === "both" || g.audience === audience);
  const [faqOpen, setFaqOpen]         = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Sellers get the seller questions (P5). The rows come back in the reader's
  // language when a translation is stored (faqText), so search matches what's shown.
  const { data: faqRows, isPending: faqsLoading } = useFaqs(isSeller ? "seller_help" : "buyer_help");
  const faqCategories = useMemo(
    () => groupFaqs(faqRows ?? []).map((g) => ({
      id: g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: g.label,
      icon: FAQ_CATEGORY_ICONS[g.label] ?? HelpCircle,
      faqs: g.faqs.map((f) => faqText(f, lang)),
    })),
    [faqRows, lang],
  );
  // Until seller questions exist (the content migration not applied yet), sellers see
  // the buyer note below rather than an empty list passed off as help.
  const noSellerFaqs = isSeller && !faqsLoading && (faqRows?.length ?? 0) === 0;

  const filteredCategories = faqCategories.map(cat => ({
    ...cat,
    faqs: cat.faqs.filter(
      f => f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
           f.answer.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.faqs.length > 0);

  const frame = (children: ReactNode) =>
    isSeller ? (
      <DashboardLayout>{children}</DashboardLayout>
    ) : (
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
        {children}
        <MobileBottomNav />
      </div>
    );

  const tile = "bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors";
  const accentBg = isSeller ? "bg-brand-vendor" : "bg-brand-buyer";

  return frame(
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className={`${isSeller ? "max-w-6xl" : "max-w-2xl lg:max-w-6xl px-4 py-6 pb-28"} mx-auto space-y-6`}>

          {/* ── Welcome ── */}
          <motion.div variants={section}>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Welcome to Cosora's Customer Service
            </h2>
            <p className="text-sm text-gray-500">What can we help you with?</p>
          </motion.div>

          <motion.div variants={section}>
            <HoursBanner status={status.data} />
          </motion.div>

          {/* Sellers get their own questions (P5). If there are none yet, say so and
              point them at the people who can help (MPF-15). */}
          {noSellerFaqs && (
            <motion.div variants={section}>
              <Card className="border-brand-vendor/20 bg-brand-vendor/5">
                <CardContent className="p-4 flex gap-3">
                  <Store className="w-5 h-5 text-brand-vendor shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    {available
                      ? "For help with your store, KYC, leads, ads or billing, chat with us, or call or email us."
                      : "For help with your store, KYC, leads, ads or billing, call or email us using the details below."}
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

          {/* ── Contact Us ── chat and callbacks when they're open to this person
              (rollout), and always the phone line in hours and email. */}
          <motion.div variants={section}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Contact Us</h3>
            <p className="text-xs text-gray-500 mb-4">{hoursLabel(status.data)}</p>
            <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
              {available && (
                <motion.div variants={listItem} whileTap={TAP} transition={TAP_T}>
                  <Link to="/help/chat" className={tile}>
                    <div className={`w-12 h-12 ${accentBg} rounded-full flex items-center justify-center mb-2`}>
                      <MessageCircle className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900">Chat with us</span>
                    <span className="text-xs text-gray-500">Cosora Support</span>
                  </Link>
                </motion.div>
              )}
              {available && (
                <motion.div variants={listItem} whileTap={TAP} transition={TAP_T}>
                  <Link to="/help/callback" className={tile}>
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 border border-gray-300">
                      <PhoneCall className="w-6 h-6 text-gray-900" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900">Request a callback</span>
                    <span className="text-xs text-gray-500">We call you</span>
                  </Link>
                </motion.div>
              )}
              <motion.a variants={listItem} whileTap={TAP} transition={TAP_T} href={`tel:${SUPPORT_PHONE}`} className={tile}>
                <div className={`w-12 h-12 ${available ? "bg-white border border-gray-300" : accentBg} rounded-full flex items-center justify-center mb-2`}>
                  <Phone className={`w-6 h-6 ${available ? "text-gray-900" : "text-white"}`} />
                </div>
                <span className="text-sm font-semibold text-gray-900">Call us</span>
                <span className="text-xs text-gray-500">{SUPPORT_PHONE_LABEL}</span>
              </motion.a>
              <motion.a variants={listItem} whileTap={TAP} transition={TAP_T} href={supportMailto("Help request")} className={tile}>
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 border border-gray-300">
                  <Mail className="w-6 h-6 text-gray-900" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Email us</span>
                <span className="text-xs text-gray-500">{SUPPORT_EMAIL}</span>
              </motion.a>
            </motion.div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <Link to="/report-fraud" className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline">
                <Flag className="w-3.5 h-3.5" /> Report fraud
              </Link>
              {available && (
                <Link to="/feedback" state={{ from: "/help" }} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:underline">
                  <Lightbulb className="w-3.5 h-3.5" /> App feedback
                </Link>
              )}
              {user && (
                <Link to="/help/requests" className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:underline">
                  <ListChecks className="w-3.5 h-3.5" /> My requests
                </Link>
              )}
            </div>
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
                              data-no-translate={faq.stored || undefined}
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

          {guides.length > 0 && (
            <motion.div variants={section}>
              <h2 className="text-xl font-semibold text-foreground mb-4">Quick Guides</h2>
              <motion.div variants={listContainer} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {guides.map((g) => (
                  <motion.div key={g.slug} variants={listItem}>
                    <Link to={`/help/guides/${g.slug}`}>
                      <Card className="border-border hover:shadow-sm transition-all group">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gray-100">
                            <BookOpen className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="text-sm font-medium text-foreground flex-1" data-no-translate>{labelIn(g.title, lang)}</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}
            </motion.div>{/* /Right main */}
          </motion.div>{/* /two-column grid */}

          {/* ── Still Need Help ── */}
          <motion.div variants={section}>
            <Card className="bg-gradient-to-r from-brand-vendor/5 via-brand-vendor/10 to-brand-vendor/5 border-brand-vendor/20">
              <CardContent className="py-8 text-center">
                <h3 className="text-xl font-semibold text-foreground mb-2">Still need help?</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto text-sm">
                  {available
                    ? "Chat with Cosora Support, or call us during support hours."
                    : "Call us during support hours, or email us any time and the Cosora team will get back to you."}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {available && (
                    <Button asChild className={`${accentBg} hover:opacity-90`}>
                      <Link to="/help/chat">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Chat with us
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant={available ? "outline" : "default"} className={available ? "border-border" : `${accentBg} hover:opacity-90`}>
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

      </motion.div>,
  );
};

export default Help;