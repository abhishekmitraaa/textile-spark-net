import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronRight, Star, QrCode, Building2, Megaphone, List,
  HelpCircle, MessageSquare, FileText, Bell, Share2, LogOut,
  Info, Link2, Download, CheckCircle2, AlertTriangle,
  Bookmark, Settings, Pencil, Camera, Plus, X, Copy,
  Check, Shield, Lightbulb, UserCircle, StarIcon,
  Facebook, Twitter, Linkedin, Send, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// SHARE APP MODAL
// ─────────────────────────────────────────────────────────────

function ShareAppModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const appUrl = "https://cosora.in/app";
  const shareMsg = `Check out Cosora! Download now and grow your business. ${appUrl}`;

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
          <h1 className="text-lg font-bold text-gray-900">Share App</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {/* App banner */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-6 text-white text-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow">
              <Share2 className="w-8 h-8 text-blue-600" />
            </div>
            <p className="font-bold text-lg">Share Cosora</p>
            <p className="text-blue-100 text-sm mt-1">
              Help your friends and family grow their business by sharing the app!
            </p>
          </div>

          {/* Quick share */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">Quick Share</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "WhatsApp", bg: "bg-green-50",  color: "text-green-600",  onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg)}`, "_blank") },
                { label: "SMS",      bg: "bg-blue-50",   color: "text-blue-600",   onClick: () => { window.location.href = `sms:?body=${encodeURIComponent(shareMsg)}`; } },
                { label: "Email",    bg: "bg-red-50",    color: "text-red-600",    onClick: () => { window.location.href = `mailto:?subject=Check out Cosora&body=${encodeURIComponent(shareMsg)}`; } },
                { label: "More",     bg: "bg-purple-50", color: "text-purple-600", onClick: async () => { try { if (navigator.share) await navigator.share({ title: "Cosora", text: shareMsg, url: appUrl }); } catch {} } },
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
            <p className="text-xs font-semibold text-gray-500 mb-3">Share on Social Media</p>
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
            <p className="text-xs font-semibold text-gray-500 mb-3">App Link</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <span className="flex-1 text-sm text-gray-600 truncate">{appUrl}</span>
              <button onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shrink-0">
                {copied ? <><Check className="w-3.5 h-3.5" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy Link</>}
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
  icon: Icon, label, badge, badgeVariant = "red", onClick,
}: {
  icon: React.ElementType;
  label: string;
  badge?: string;
  badgeVariant?: "red" | "new";
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-gray-600" />
        <span className="text-sm text-gray-900">{label}</span>
        {badge && (
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded",
            badgeVariant === "new" ? "bg-red-500 text-white" : "bg-red-500 text-white"
          )}>
            {badge}
          </span>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const MyStore = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState("en");
  const [shareOpen, setShareOpen]           = useState(false);
  const [logoutOpen, setLogoutOpen]         = useState(false);
  const [qrOpen, setQrOpen]                 = useState(false);
  const reduced = useReducedMotion();

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
              <h1 className="text-lg font-bold text-gray-900 px-3 py-1">MY STORE</h1>
              <div className="w-6" />
            </div>

            {/* Profile row */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-14 h-14 bg-gray-300 rounded-full overflow-hidden shrink-0">
                <img
                  src="https://picsum.photos/seed/business/200/200"
                  alt="Business"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-semibold text-gray-900 px-2">business name</span>
                  <button className="text-gray-600 hover:text-gray-900">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-2">9010608951</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 bg-[#ebe6ff] px-2 py-1 rounded-full">
                      <span>0.0</span>
                      <Star className="w-3 h-3 text-[#3925b3] fill-[#3925b3]" />
                    </div>
                    <span>Ratings</span>
                  </div>
                  <p><span className="font-semibold text-gray-900">0</span>&nbsp;Followers</p>
                </div>
              </div>
            </div>

            {/* 2×2 top action buttons */}
            <motion.div variants={listContainer} className="grid grid-cols-2 gap-3 mb-4">
              {[
                { icon: Building2,  label: "My Business",  onClick: () => navigate("/my-store/business") },
                { icon: UserCircle, label: "MY PROFILE",   onClick: () => navigate("/business-profile") },
                { icon: List,       label: "My Listings",  onClick: () => navigate("/products") },
                { icon: HelpCircle, label: "Help",         onClick: () => navigate("/help") },
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
                <span className="text-sm font-medium text-gray-900">Advertise & Grow your Business</span>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* Add New Business */}
              <motion.button whileTap={TAP} transition={TAP_T} className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Plus className="w-5 h-5 text-gray-700" />
                  <span className="text-sm font-medium text-gray-900">Add New Business</span>
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">Free</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* App and User Setting card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">App and User Setting</h3>

                {/* Language buttons */}
                <div className="overflow-x-auto mb-4 -mx-2 px-2">
                  <div className="flex gap-2 min-w-max">
                    {[{ code: "en", label: "English" }, { code: "hi", label: "हिंदी" }].map(l => (
                      <button key={l.code} onClick={() => setLang(l.code)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                          lang === l.code
                            ? "border-2 border-blue-500 text-blue-600 bg-blue-50"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                        )}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Menu items */}
                <div className="space-y-1">
                  <MenuRow icon={Bookmark}      label="Shortlisted leads"    onClick={() => navigate("/leads")} />
                  <MenuRow icon={MessageSquare} label="Reviews"               onClick={() => navigate("/reviews")} />
                  <MenuRow icon={Settings}      label="Settings"              onClick={() => {}} />
                  <MenuRow icon={Bell}          label="Lead Notification"     badge="New" badgeVariant="new" onClick={() => {}} />
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
                  <span className="text-sm font-medium text-gray-900">Rate Us</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* App Feedback */}
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/app-feedback")}
                className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">App Feedback</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* Share App */}
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setShareOpen(true)}
                className="w-full bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Share2 className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">Share App</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.button>

              {/* Notification banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-700">Are you not receiving notifications?</span>
                <motion.button whileTap={TAP} transition={TAP_T}
                  onClick={() => toast.info("Test notification sent! 🔔")}
                  className="text-blue-600 text-sm font-semibold hover:text-blue-700 shrink-0 ml-2">
                  Test Now
                </motion.button>
              </div>

              {/* More Information card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">More information</h3>
                <div className="space-y-1">
                  <MenuRow icon={Shield}       label="Privacy Policy"  onClick={() => {}} />
                  <MenuRow icon={FileText}     label="Terms of Use"    onClick={() => {}} />
                  <MenuRow icon={Lightbulb}    label="What's New"      onClick={() => {}} />
                  <MenuRow icon={Info}         label="About Us"        onClick={() => navigate("/about")} />
                  <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setLogoutOpen(true)}
                    className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <LogOut className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-900">Logout</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </motion.div>

      {/* ── Share App Modal ── */}
      <ShareAppModal isOpen={shareOpen} onClose={() => setShareOpen(false)} />

      {/* ── Logout Confirm ── */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Log Out</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 text-center py-2">
            Are you sure you want to log out of your Cosora account?
          </p>
          <div className="flex gap-2 mt-1">
            <button onClick={() => setLogoutOpen(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={() => { setLogoutOpen(false); navigate("/"); }}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors">
              Log Out
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default MyStore;