import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChevronLeft, ChevronRight, Megaphone, Users, User, ClipboardList, Wrench, CreditCard, ShieldCheck, Info, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorDashboard, profileScoreSignals } from "@/lib/queries/vendorDashboard";
import { useMyVendorProfile } from "@/lib/queries/vendorStore";
import { useMyCatalogues } from "@/lib/queries/catalogues";
import { useMyVendorDocuments, kycStatusOf } from "@/lib/queries/vendorDocuments";
import { useVendorReviews } from "@/lib/queries/reviews";

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
// Every badge on this page is derived from the vendor's own rows.
//
// They used to be string literals in a module-scope array — "Info Missing",
// "Missing", "18 Pending", "Missing" — which rendered identically for a vendor
// with a finished profile, an uploaded catalogue and verified KYC as for one
// who had just signed up. "18 Pending" in particular counted nothing at all.
//
// The rule the tiles follow now: a badge with no data behind it does not
// render. `null` is a perfectly good badge.
// ─────────────────────────────────────────────────────────────

type BadgeTone = "warn" | "info" | "good";
interface MenuItem {
  icon: LucideIcon;
  title: string;
  subtitle: string | null;
  route: string;
  badge: string | null;
  badgeTone: BadgeTone;
  iconBg: string;
  iconColor: string;
}

const badgeStyle = (tone: BadgeTone) =>
  tone === "good"
    ? "text-green-600 bg-green-50"
    : tone === "info"
      ? "text-[#256fef] bg-[#256fef]/10"
      : "text-orange-600 bg-orange-50";

const MyBusiness = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: dashboard } = useVendorDashboard(user?.id);
  const { data: store } = useMyVendorProfile(user?.id);
  const { data: catalogues } = useMyCatalogues(user?.id);
  const { data: documents } = useMyVendorDocuments(user?.id);
  const { data: reviewData } = useVendorReviews(user?.id);

  const menuItems = useMemo<MenuItem[]>(() => {
    // Profile completeness: the same thirteen signals the profile score is
    // built from, so this badge and /business-profile-score can never disagree.
    const unmet = dashboard ? profileScoreSignals(dashboard.scoreInput).filter((s) => !s.met).length : 0;
    const catalogueCount = catalogues?.length ?? 0;
    const kyc = kycStatusOf(documents);
    // Reviews the vendor has not answered yet — the one genuinely "pending"
    // number behind the Business Tools tile.
    const awaitingReply = (reviewData?.reviews ?? []).filter((r) => !r.replyBody).length;
    const openLeads = dashboard?.openLeads ?? 0;

    return [
      {
        icon: Megaphone, title: "Advertise", subtitle: "Boost visibility with targeted ads",
        route: "/advertisements", badge: null, badgeTone: "info",
        iconBg: "bg-blue-50", iconColor: "text-blue-600",
      },
      {
        icon: Users, title: "Leads", subtitle: "Buyer requirements you can quote on",
        route: "/leads",
        badge: openLeads > 0 ? `${openLeads} open` : null, badgeTone: "info",
        iconBg: "bg-green-50", iconColor: "text-green-600",
      },
      {
        icon: User, title: "Business Profile", subtitle: "Complete your profile to attract buyers",
        route: "/business-profile",
        badge: unmet > 0 ? `${unmet} to add` : null, badgeTone: "warn",
        iconBg: "bg-purple-50", iconColor: "text-purple-600",
      },
      {
        // Was /products — the product LIST, not the catalogue uploader. A
        // vendor tapping "Catalogue → Upload your product catalogue" landed on
        // their listings with no way to upload a catalogue from there.
        icon: ClipboardList, title: "Catalogue", subtitle: "Upload your product catalogue",
        route: "/upload-catalogue",
        badge: catalogueCount > 0 ? `${catalogueCount}` : "None yet",
        badgeTone: catalogueCount > 0 ? "good" : "warn",
        iconBg: "bg-indigo-50", iconColor: "text-indigo-600",
      },
      {
        icon: Wrench, title: "Business Tools", subtitle: "Reviews and review-link sharing",
        route: "/my-store/business/tools",
        badge: awaitingReply > 0 ? `${awaitingReply} to reply` : null, badgeTone: "warn",
        iconBg: "bg-yellow-50", iconColor: "text-yellow-600",
      },
      {
        // Split out of the old "KYC & Payments" row. One row cannot go to two
        // places, and /subscription — where it went — does no KYC at all.
        icon: ShieldCheck, title: "KYC", subtitle: "Verify your business documents",
        route: "/kyc",
        badge: kyc === "verified" ? "Verified" : kyc === "in_review" ? "In review" : "Missing",
        badgeTone: kyc === "verified" ? "good" : kyc === "in_review" ? "info" : "warn",
        iconBg: "bg-pink-50", iconColor: "text-pink-600",
      },
      {
        icon: CreditCard, title: "Payments", subtitle: "Manage your plan and billing",
        route: "/subscription", badge: null, badgeTone: "info",
        iconBg: "bg-rose-50", iconColor: "text-rose-600",
      },
      {
        icon: Info, title: "Additional Info", subtitle: "Add extra details to your listing",
        route: "/business-profile?focus=detailed-information", badge: null, badgeTone: "info",
        iconBg: "bg-teal-50", iconColor: "text-teal-600",
      },
      {
        icon: Headphones, title: "Support", subtitle: "Get help from the Cosora team",
        route: "/help", badge: null, badgeTone: "info",
        iconBg: "bg-cyan-50", iconColor: "text-cyan-600",
      },
    ];
  }, [dashboard, catalogues, documents, reviewData]);

  // `store` drives nothing on its own here, but the profile query being warm is
  // what lets /business-profile open instantly from these tiles.
  void store;

  return (
    <DashboardLayout>
      <motion.div
        className="max-w-2xl mx-auto pb-8"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={section} className="flex items-center gap-3 mb-4">
          <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">My Business</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage your business operations</p>
          </div>
        </motion.div>

        {/* Mobile list */}
        <motion.div variants={listContainer} className="lg:hidden bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {menuItems.map((item) => (
            <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={item.title} onClick={() => navigate(item.route)}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.iconBg)}>
                  <item.icon className={cn("w-5 h-5", item.iconColor)} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    {item.badge && (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", badgeStyle(item.badgeTone))}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.subtitle}</p>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
            </motion.button>
          ))}
        </motion.div>

        {/* Desktop grid */}
        <motion.div variants={listContainer} className="hidden lg:grid grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={item.title} onClick={() => navigate(item.route)}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform", item.iconBg)}>
                  <item.icon className={cn("w-6 h-6", item.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900">{item.title}</span>
                    {item.badge && (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", badgeStyle(item.badgeTone))}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.subtitle}</p>}
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-gray-600 mt-2 transition-colors">
                    <span>Manage</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default MyBusiness;
