import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Inbox, Package, Megaphone, ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenRfqs } from "@/lib/queries/rfqs";
import OpenRfqLeads from "@/components/vendor/OpenRfqLeads";

// Vendor Leads = the live buyer-RFQ pool. All lead browsing + quoting is the
// real OpenRfqLeads panel (RFQ→quote loop). Previously this page also carried a
// large fixture of fake buyers; that mock feed + its filters were removed so the
// page only ever shows real requirements.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };

const Leads = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: rfqs = [], isLoading } = useOpenRfqs(user?.id);
  const hasLeads = rfqs.length > 0;

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section}>
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live buyer requirements you can quote on. Your quote reaches the buyer's My Quotes instantly.
          </p>
        </motion.div>

        <motion.div variants={section}>
          <OpenRfqLeads />

          {!isLoading && !hasLeads && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#256fef]/10">
                <Inbox className="h-6 w-6 text-[#256fef]" />
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
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#256fef] px-4 py-2 text-xs font-bold text-white hover:bg-[#256fef]/90 transition-colors">
                    <Megaphone className="h-4 w-4" /> Boost visibility <ArrowRight className="h-3.5 w-3.5" />
                  </motion.span>
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Leads;
