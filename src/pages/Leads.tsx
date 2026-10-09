import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Inbox, Package, Megaphone, ArrowRight, Globe2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenRfqs, useDirectQuoteRequests } from "@/lib/queries/rfqs";
import OpenRfqLeads from "@/components/vendor/OpenRfqLeads";
import DirectQuoteRequests from "@/components/vendor/DirectQuoteRequests";
import SignInForLeads from "@/components/vendor/SignInForLeads";
import { useVendorEntitlements } from "@/lib/queries/entitlements";
import { useOverseasLeadCount } from "@/lib/queries/overseas";

// Vendor Leads = the live buyer-RFQ pool. All lead browsing + quoting is the
// real OpenRfqLeads panel (RFQ→quote loop). Previously this page also carried a
// large fixture of fake buyers; that mock feed + its filters were removed so the
// page only ever shows real requirements. A signed-out visitor reads no RFQ at all
// (RFQ/leads R1), so they're asked to sign in rather than told there are none.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };

const Leads = () => {
  const reduced = useReducedMotion();
  const { user, loading } = useAuth();
  const { data: rfqs = [], isLoading } = useOpenRfqs(user?.id);
  const { data: direct = [] } = useDirectQuoteRequests(user?.id);
  // Direct requests count as leads: without this the page would claim there is
  // nothing to quote on while the Direct panel above it is showing requests.
  const hasLeads = rfqs.length > 0 || direct.length > 0;
  // Lead alerts are a plan's (subscriptions P6): the link shows only where the page would.
  const { data: entitlements } = useVendorEntitlements(user?.id);
  // Overseas requirements are Gold's and VIP's (subscriptions P7). They see a link to their
  // page; everyone else, once the switch lists them, sees how many there were this month.
  const { data: overseas } = useOverseasLeadCount(user?.id);
  const overseasTeaser = Boolean(overseas?.available && overseas.tier === "none" && overseas.thisMonth > 0);

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section}>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live buyer requirements you can quote on. Your quote reaches the buyer's My Quotes instantly.
          </p>
          {(entitlements?.features.lead_alerts || entitlements?.features.overseas_leads) && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {entitlements?.features.lead_alerts && (
                <Link to="/lead-alerts" className="inline-flex items-center gap-1 text-sm font-medium text-brand-vendor hover:underline" data-testid="lead-alerts-link">
                  How you're told about new requirements <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {entitlements?.features.overseas_leads && (
                <Link to="/overseas-leads" className="inline-flex items-center gap-1 text-sm font-medium text-brand-vendor hover:underline" data-testid="overseas-leads-link">
                  Overseas requirements <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </motion.div>

        <motion.div variants={section}>
          {!loading && !user ? (
            <SignInForLeads />
          ) : (
            <>
              {overseasTeaser && overseas && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4" data-testid="overseas-teaser">
                  <div className="flex items-start gap-3">
                    <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {overseas.thisMonth === 1
                          ? "1 requirement from a buyer outside India this month"
                          : `${overseas.thisMonth} requirements from buyers outside India this month`}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600">Overseas requirements are part of the Gold and VIP plans.</p>
                    </div>
                  </div>
                  <Link to="/subscription#plans" className="inline-flex items-center gap-1 rounded-full bg-brand-vendor px-4 py-2 text-xs font-bold text-white hover:bg-brand-vendor/90">
                    See plans <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
              <DirectQuoteRequests />
              <OpenRfqLeads />

              {!isLoading && !hasLeads && (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-vendor/10">
                    <Inbox className="h-6 w-6 text-brand-vendor" />
                  </div>
                  <p className="text-base font-bold text-gray-900">No open buyer requirements right now</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                    When buyers post requirements that match your catalogue, they'll appear here for you to quote on. Keep your
                    products live and visible to get matched faster.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Link to="/products">
                      <motion.span whileTap={TAP} transition={TAP_T}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                        <Package className="h-4 w-4" /> Manage products
                      </motion.span>
                    </Link>
                    <Link to="/advertisements">
                      <motion.span whileTap={TAP} transition={TAP_T}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-vendor px-4 py-2 text-xs font-bold text-white hover:bg-brand-vendor/90 transition-colors">
                        <Megaphone className="h-4 w-4" /> Boost visibility <ArrowRight className="h-3.5 w-3.5" />
                      </motion.span>
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Leads;
