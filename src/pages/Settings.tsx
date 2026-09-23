import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Mail, Phone, LogOut, ShieldCheck, Download, Headphones, FileText,
} from "lucide-react";
import BuyerShell from "@/components/buyer/BuyerShell";
import { DeleteAccountCard } from "@/components/buyer/DeleteAccountCard";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/errorMessage";

// ─────────────────────────────────────────────────────────────
// Buyer Settings (/profile/settings, 2026-09-23).
//
// The buyer sidebar's "Settings" used to point at /profile, because this page
// didn't exist. It mirrors VendorSettings.tsx's structure (section labels, cards,
// nav and info rows) but holds ACCOUNT and SECURITY content only: how the
// account signs in, logging out, downloading data, and deleting the account.
// Identity and business details stay on My Profile (/profile/edit,
// /profile/business-details), and notification or regional preferences stay on
// their own pages. They are not duplicated here.
//
// Sign-in is mobile number + OTP only, and is not changed or offered here (see
// claude.md, "Mobile number + OTP login"). This page only shows it.
// ─────────────────────────────────────────────────────────────

// Buyer accent (red). The vendor app's settings use blue.
const ACCENT = "#ef4d62";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">{children}</div>;
}

function NavRow({
  icon: Icon, label, description, onClick,
}: { icon: React.ElementType; label: string; description?: string; onClick: () => void }) {
  return (
    <motion.button whileTap={TAP} transition={TAP_T} onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}1a` }}>
        <Icon className="w-5 h-5" style={{ color: ACCENT }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
    </motion.button>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

// GoTrue stores phone numbers without the leading "+".
function formatPhone(phone: string | undefined): string {
  if (!phone) return "";
  return phone.startsWith("+") ? phone : `+${phone}`;
}

// A mobile-OTP account carries a `p<digits>@phone.cosora.invalid` placeholder,
// which is not an address anyone can receive mail at, so it is not shown.
function realEmail(email: string | undefined): string {
  return email && !email.endsWith(".invalid") ? email : "";
}

const Settings = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { session, loading, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out");
      navigate("/");
    } catch (e) {
      toast.error("Couldn't log out", { description: errorMessage(e) });
    }
  };

  if (!loading && !session) {
    return (
      <BuyerShell>
        <div className="max-w-2xl mx-auto px-4 pt-24 pb-24 text-center">
          <h1 className="text-lg font-bold text-gray-900">You're signed out</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to manage your account settings.</p>
          <button
            onClick={() => navigate("/login")}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#ef4d62] px-6 py-3 text-sm font-bold text-white hover:bg-[#ef4d62]/90 transition-colors"
          >
            Sign In
          </button>
        </div>
      </BuyerShell>
    );
  }

  return (
    <BuyerShell>
      <motion.div
        className="max-w-3xl mx-auto px-4 lg:px-6 pt-3 lg:pt-6 pb-24"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={section} className="flex items-center gap-3 mb-5">
          <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/profile")} aria-label="Back to profile"
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">Settings</h1>
            <p className="text-xs text-gray-400 mt-0.5">Your account and its security</p>
          </div>
        </motion.div>

        <div className="space-y-6">
          {/* ── Security ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Security</SectionLabel>
            <Card>
              <div className="divide-y divide-gray-100">
                <InfoRow icon={Phone} label="Sign-in number" value={formatPhone(session?.user?.phone)} />
                <InfoRow icon={Mail} label="Account email" value={realEmail(session?.user?.email)} />
                <motion.button whileTap={TAP} transition={TAP_T} onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <LogOut className="w-5 h-5 text-gray-500" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Log Out</span>
                </motion.button>
              </div>
            </Card>
            <p className="px-1 text-[11px] text-gray-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Cosora uses mobile number and OTP to sign in, so there's no password to manage.
            </p>
          </motion.section>

          {/* ── Your data ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Your data</SectionLabel>
            <Card>
              <NavRow icon={Download} label="Download your data"
                description="Your RFQs, quotes, chats and reviews, as JSON or CSV"
                onClick={() => navigate("/profile/data-export")} />
            </Card>
          </motion.section>

          {/* ── Delete account (Phase 2; the same component /profile/help uses) ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Delete account</SectionLabel>
            <DeleteAccountCard />
          </motion.section>

          {/* ── Help & Legal ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Help &amp; Legal</SectionLabel>
            <Card>
              <div className="divide-y divide-gray-100">
                <NavRow icon={Headphones} label="Help Center"
                  description="FAQs and support" onClick={() => navigate("/profile/help")} />
                <NavRow icon={FileText} label="Terms & Privacy"
                  description="How Cosora works and handles your data" onClick={() => navigate("/profile/terms")} />
              </div>
            </Card>
          </motion.section>
        </div>
      </motion.div>
    </BuyerShell>
  );
};

export default Settings;
