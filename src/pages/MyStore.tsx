import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronRight, Star, Building2, List,
  HelpCircle, MessageSquare, FileText, Bell, Share2, LogOut,
  Info, Bookmark, Settings, Pencil, UserCircle,
  Shield, Lightbulb, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, setLang as setAppLang, useT, type Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useMyVendorProfile, saveVendorProfile, uploadVendorImage } from "@/lib/queries/vendorStore";
import { useProfileScoreState } from "@/lib/queries/vendorDashboard";

// ─────────────────────────────────────────────────────────────
// SHARE APP MODAL
// ─────────────────────────────────────────────────────────────

function ShareAppModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  // The app IS the site: whatever origin this page is being served from is the
  // real, current URL. The previous hardcoded https://cosora.in/app pointed at a
  // path this SPA has no route for, so every share sent a 404 to a friend.
  const appUrl = window.location.origin;
  const shareMsg = `Check out Cosora! Grow your textile business. ${appUrl}`;

  const copyLink = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{t("Share App")}</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {/* App banner */}
          <div className="bg-gradient-to-br from-[#256fef] to-[#1d5ed6] rounded-2xl p-6 text-white text-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow">
              <Share2 className="w-8 h-8 text-[#256fef]" />
            </div>
            <p className="font-bold text-lg">{t("Share Cosora")}</p>
            <p className="text-white/85 text-sm mt-1">
              {t("Help your friends and family grow their business by sharing the app!")}
            </p>
          </div>

          {/* Quick share */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">{t("Quick Share")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "WhatsApp", bg: "bg-green-50",  color: "text-green-600",  onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg)}`, "_blank") },
                { label: "SMS",      bg: "bg-blue-50",   color: "text-blue-600",   onClick: () => { window.location.href = `sms:?body=${encodeURIComponent(shareMsg)}`; } },
                { label: "Email",    bg: "bg-red-50",    color: "text-red-600",    onClick: () => { window.location.href = `mailto:?subject=Check out Cosora&body=${encodeURIComponent(shareMsg)}`; } },
                {
                  label: "More", bg: "bg-purple-50", color: "text-purple-600",
                  onClick: async () => {
                    try {
                      if (navigator.share) await navigator.share({ title: "Cosora", text: shareMsg, url: appUrl });
                      else copyLink();
                    } catch {
                      // The user dismissing the OS share sheet rejects the
                      // promise. That is a cancel, not a failure — nothing to
                      // report and nothing to fall back to.
                    }
                  },
                },
              ].map(opt => (
                <button key={opt.label} onClick={opt.onClick}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", opt.bg)}>
                    <Share2 className={cn("w-5 h-5", opt.color)} />
                  </div>
                  <span className="text-xs font-medium text-gray-700">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Social media */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">{t("Share on Social Media")}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Facebook", color: "text-blue-600",  onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}`, "_blank") },
                { label: "Twitter",  color: "text-sky-500",   onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMsg)}`, "_blank") },
                { label: "LinkedIn", color: "text-blue-700",  onClick: () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(appUrl)}`, "_blank") },
                { label: "Telegram", color: "text-blue-500",  onClick: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(appUrl)}`, "_blank") },
              ].map(opt => (
                <button key={opt.label} onClick={opt.onClick}
                  className="flex items-center gap-2.5 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Share2 className={cn("w-5 h-5", opt.color)} />
                  <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* App link */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">{t("App Link")}</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <span className="flex-1 text-sm text-gray-600 truncate">{appUrl}</span>
              <button onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#256fef] text-white rounded-lg text-xs font-medium hover:bg-[#1d5ed6] transition-colors shrink-0">
                {copied ? <><Check className="w-3.5 h-3.5" />{t("Copied!")}</> : <><Copy className="w-3.5 h-3.5" />{t("Copy Link")}</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MENU ROW — reusable row matching source repo style
// ─────────────────────────────────────────────────────────────

function MenuRow({
  icon: Icon, label, badge, onClick,
}: {
  icon: React.ElementType;
  label: string;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-gray-600" />
        <span className="text-sm text-gray-900">{label}</span>
        {badge && (
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500 text-white">{badge}</span>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// STORE HEADER — identity, straight off the vendor_profiles row
//
// This block used to be six literals: a picsum.photos stock portrait, the words
// "business name", somebody's phone number, 0.0 ratings and 0 followers. The
// page imported no query hooks at all, so every vendor saw the same header.
// ─────────────────────────────────────────────────────────────

/** Up to two initials from the brand name, for the logo-less state. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

const MyStore = () => {
  const navigate = useNavigate();
  const lang = useLang();
  const t = useT();
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const { data: store, isLoading } = useMyVendorProfile(user?.id);
  const { score, isLoading: scoreLoading } = useProfileScoreState();
  const [shareOpen, setShareOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const reduced = useReducedMotion();

  // ── Logo ──────────────────────────────────────────────────────
  // uploadVendorImage() has existed in vendorStore.ts since the store queries
  // were written and had ZERO callers anywhere in the repo — which is exactly
  // why logo_url is null for every vendor in the database. This is its first.
  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a failure
    if (!file) return;
    if (!user) { toast.error(t("Sign in to update your logo")); return; }
    setUploadingLogo(true);
    try {
      const url = await uploadVendorImage(user.id, file, "logo");
      await saveVendorProfile(user.id, { logoUrl: url });
      // Both keys, always: "vendor_profile" backs this header, "vendor_dashboard"
      // backs the profile score shown right below it.
      qc.invalidateQueries({ queryKey: ["vendor_profile", "mine", user.id] });
      qc.invalidateQueries({ queryKey: ["vendor_dashboard", user.id] });
      toast.success(t("Logo updated"));
    } catch (err) {
      toast.error(t("Couldn't update your logo"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogout = async () => {
    setLogoutOpen(false);
    try {
      // navigate("/") alone left the session alive: the "logged out" vendor
      // could press Back and still be signed in.
      await signOut();
    } catch (err) {
      toast.error(t("Couldn't sign you out"), {
        description: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    navigate("/");
  };

  const brandName = store?.brandName?.trim() ?? "";
  const scoreTone = score < 40 ? "text-red-500" : score < 70 ? "text-amber-500" : "text-green-600";

  return (
    <DashboardLayout>
      <motion.div
        className="min-h-screen bg-gray-50"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >

        {/* ── Header Section ── */}
        <motion.div variants={section} className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-4xl mx-auto">
            {/* Title row */}
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-lg font-bold text-gray-900 px-3 py-1">{t("MY STORE")}</h1>
              <div className="w-6" />
            </div>

            {isLoading ? (
              /* Skeletons, not placeholder content: an invented name and rating
                 are indistinguishable from a real one once they have rendered. */
              <div className="flex items-start gap-3 mb-3">
                <div className="w-14 h-14 rounded-full bg-gray-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-28 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-48 rounded bg-gray-200 animate-pulse" />
                </div>
              </div>
            ) : !store ? (
              /* No vendor_profiles row yet — a buyer-only or half-registered
                 account. Nothing to show, so say that and point at the form
                 that creates it. */
              <div className="mb-3 rounded-xl border border-[#256fef]/30 bg-[#256fef]/5 p-4">
                <p className="text-sm font-semibold text-gray-900">{t("Your store isn't set up yet")}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {t("Complete seller registration to get your storefront, listings and buyer leads.")}
                </p>
                <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/onboarding")}
                  className="mt-3 rounded-full bg-[#256fef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d5ed6] transition-colors">
                  {t("Start registration")}
                </motion.button>
              </div>
            ) : (
              <>
                {/* Profile row */}
                <div className="flex items-start gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    aria-label={t("Change logo")}
                    className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 disabled:opacity-60"
                  >
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={brandName || "Store logo"} className="w-full h-full object-cover" />
                    ) : (
                      /* Initials on the vendor blue tint. Never a stock photo:
                         a picsum portrait reads as "this is your logo". */
                      <span className="flex h-full w-full items-center justify-center bg-[#256fef]/10 text-base font-bold text-[#256fef]">
                        {initialsOf(brandName)}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-[9px] font-medium text-white">
                      {uploadingLogo ? "…" : t("Edit")}
                    </span>
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-semibold text-gray-900 px-2">
                        {brandName || t("Add your business name")}
                      </span>
                      <button
                        onClick={() => navigate("/business-profile?focus=contact-details")}
                        aria-label={t("Edit business details")}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                    {store.phone?.trim() ? (
                      <p className="text-sm text-gray-600 mb-2">{store.phone}</p>
                    ) : (
                      <button
                        onClick={() => navigate("/business-profile?focus=contact-details")}
                        className="mb-2 block text-sm text-gray-400 hover:text-gray-600"
                      >
                        {t("Add a phone number")}
                      </button>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-1 bg-[#ebe6ff] px-2 py-1 rounded-full">
                          <span>{store.reviewsCount > 0 ? store.ratingAvg.toFixed(1) : "–"}</span>
                          <Star className="w-3 h-3 text-[#3925b3] fill-[#3925b3]" />
                        </div>
                        <span>{t("Ratings")}</span>
                      </div>
                      <p>
                        <span className="font-semibold text-gray-900">{store.followers.toLocaleString("en-IN")}</span>
                        &nbsp;{t("Followers")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Profile completion — the vendor documentation specifies this
                    band and the build never had it. Same number as the ring on
                    the dashboard and the /business-profile-score page: all three
                    read calculateProfileScore(). */}
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  onClick={() => navigate("/business-profile-score")}
                  className="mb-4 w-full rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-900">{t("Profile Completion")}</span>
                    {scoreLoading
                      ? <span className="h-4 w-9 animate-pulse rounded bg-gray-200" />
                      : <span className={cn("text-sm font-bold", scoreTone)}>{score}%</span>}
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <motion.div
                      className="h-full rounded-full bg-[#256fef]"
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={reduced ? { duration: 0 } : { duration: 0.8, delay: 0.1 }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {t("Complete your profile to get verified and attract more buyers")}
                    </p>
                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                  </div>
                </motion.button>
              </>
            )}

            {/* 2×2 top action buttons */}
            <motion.div variants={listContainer} className="grid grid-cols-2 gap-3 mb-4">
              {[
                { icon: Building2,  label: t("My Business"),  onClick: () => navigate("/my-store/business") },
                { icon: UserCircle, label: t("My Profile"),   onClick: () => navigate("/business-profile") },
                { icon: List,       label: t("My Listings"),  onClick: () => navigate("/products") },
                { icon: HelpCircle, label: t("Help"),         onClick: () => navigate("/help") },
              ].map(item => (
                <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={item.label} onClick={item.onClick}
                  className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <item.icon className="w-5 h-5 text-gray-700" />
                  <span className="text-sm font-medium text-gray-900">{item.label}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* ── Main Content — Two Columns ── */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ═══════════════════════════
                LEFT COLUMN
            ═══════════════════════════ */}
            <motion.div variants={section} className="space-y-4">

              {/* Advertise & Grow */}
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/advertisements")}
                className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <span className="text-sm font-medium text-gray-900">{t("Advertise & Grow your Business")}</span>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* "Add New Business" was here. It had no handler, and there is no
                  multi-business model to give it one: vendor_profiles.id IS the
                  auth user id, so an account has exactly one business. */}

              {/* App and User Setting card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">{t("App and User Setting")}</h3>

                {/* Language buttons */}
                <div className="overflow-x-auto mb-4 -mx-2 px-2">
                  <div className="flex gap-2 min-w-max">
                    {[{ code: "en", label: "English" }, { code: "hi", label: "हिंदी" }, { code: "gu", label: "ગુજરાતી" }].map(l => (
                      <button key={l.code} onClick={() => setAppLang(l.code as Lang)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                          lang === l.code
                            ? "border-2 border-[#256fef] text-[#256fef] bg-[#256fef]/5"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                        )}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Menu items */}
                <div className="space-y-1">
                  <MenuRow icon={Bookmark}      label={t("Shortlisted leads")} onClick={() => navigate("/leads")} />
                  <MenuRow icon={MessageSquare} label={t("Reviews")}           onClick={() => navigate("/reviews")} />
                  <MenuRow icon={Settings}      label={t("Settings")}          onClick={() => navigate("/settings")} />
                  {/* Was onClick={() => {}} with a permanent red "New" badge.
                      The badge counted nothing, so it is gone with the dead
                      handler; the row now opens the notification preferences
                      it was always naming. */}
                  <MenuRow icon={Bell}          label={t("Lead Notification")} onClick={() => navigate("/settings")} />
                </div>
              </div>
            </motion.div>

            {/* ═══════════════════════════
                RIGHT COLUMN
            ═══════════════════════════ */}
            <motion.div variants={section} className="space-y-4">

              {/* Rate Us */}
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/reviews")}
                className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 fill-gray-600 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">{t("Rate Us")}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* Was "App Feedback" → /app-feedback, a page whose Submit only
                  toasted. Relabelled rather than built: an unread feedback queue
                  is worse than an honest redirect to a channel that is staffed.
                  The page and its route are deleted. */}
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/help")}
                className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">{t("Contact support")}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* Share App */}
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setShareOpen(true)}
                className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Share2 className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">{t("Share App")}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* The "Are you not receiving notifications? / Test Now" banner was
                  here. It toasted "Test notification sent!" and sent nothing —
                  there is no push pipeline in this repo, which vendorStore.ts
                  already documents honestly for the settings toggles. */}

              {/* More Information card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">{t("More information")}</h3>
                <div className="space-y-1">
                  <MenuRow icon={Shield}    label={t("Privacy Policy")} onClick={() => navigate("/terms")} />
                  <MenuRow icon={FileText}  label={t("Terms of Use")}   onClick={() => navigate("/terms")} />
                  <MenuRow icon={Lightbulb} label={t("What's New")}     onClick={() => navigate("/seller/blogs")} />
                  <MenuRow icon={Info}      label={t("About Us")}       onClick={() => navigate("/about")} />
                  <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setLogoutOpen(true)}
                    className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <LogOut className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-900">{t("Logout")}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </motion.div>

      {/* One hidden picker for the logo. */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />

      {/* ── Share App Modal ── */}
      <ShareAppModal isOpen={shareOpen} onClose={() => setShareOpen(false)} />

      {/* ── Logout Confirm ── */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{t("Log Out")}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 text-center py-2">
            {t("Are you sure you want to log out of your Cosora account?")}
          </p>
          <div className="flex gap-2 mt-1">
            <button onClick={() => setLogoutOpen(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              {t("Cancel")}
            </button>
            <button onClick={handleLogout}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors">
              {t("Log Out")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default MyStore;
