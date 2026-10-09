import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Globe2, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import OpenRfqLeads from "@/components/vendor/OpenRfqLeads";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenRfqs } from "@/lib/queries/rfqs";
import { useOverseasLeadCount } from "@/lib/queries/overseas";

// Overseas requirements (subscriptions P7): requirements from buyers outside India, which
// only Gold and VIP vendors see. The route sits behind <TierGate feature="overseas_leads">;
// the rows come from the same read as Leads, which the database filters by plan, so this
// page only picks out the overseas ones, says how the head start works for this vendor's
// plan, and (for Gold) how many are still with VIP sellers.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };

export default function OverseasLeads() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: rfqs = [], isLoading } = useOpenRfqs(user?.id);
  const { data: count } = useOverseasLeadCount(user?.id);
  const mine = rfqs.filter((r) => r.overseas);
  const vip = count?.tier === "vip";
  // Gold sees every open overseas requirement except those in VIP's head start. Approximate
  // (the count and the list are two reads), so never below zero.
  const withVip = count && count.tier === "gold" ? Math.max(0, count.open - mine.length) : 0;

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section}>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Overseas requirements</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {vip
              ? "Requirements from buyers outside India. As a VIP seller you see them first: for 24 hours after one is posted in a category you list in, Gold sellers don't."
              : "Requirements from buyers outside India, for Gold and VIP sellers. When a VIP seller lists in the category, they see it first, and it opens to you 24 hours after it was posted."}
          </p>
          {count && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600" data-testid="overseas-summary">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold">{`${count.open} open`}</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold">{`${count.thisMonth} this month`}</span>
              {withVip > 0 && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800" data-testid="overseas-with-vip">
                  {`${withVip} with VIP sellers first`}
                </span>
              )}
            </div>
          )}
        </motion.div>

        <motion.div variants={section}>
          {isLoading ? (
            <div className="flex justify-center py-16" role="status" aria-label="Loading">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mine.length > 0 ? (
            <OpenRfqLeads overseasOnly />
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center" data-testid="overseas-empty">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
                <Globe2 className="h-6 w-6 text-sky-700" aria-hidden />
              </div>
              <p className="text-base font-bold text-gray-900">No overseas requirements open for you right now</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                When a buyer outside India posts one, it shows here and on your Leads page.
              </p>
              <Link to="/leads" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-vendor hover:underline">
                Open my leads <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
