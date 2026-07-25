import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMyVendorProfile,
  useVendorSettings,
  saveVendorSetting,
  DEFAULT_VENDOR_NOTIFICATIONS,
  type VendorNotificationSettings,
} from "@/lib/queries/vendorStore";
import { useLang, setLang, LANG_OPTIONS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Building2, Mail, Smartphone,
  ShieldCheck, Phone, LogOut, Headphones, FileText,
} from "lucide-react";

// Vendor accent (blue), matching the rest of the vendor app — never the buyer red.
const ACCENT = "#256fef";

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

// ─────────────────────────────────────────────────────────────
// Notification rows — plain-language description of what each toggle controls.
// Honest by design: these persist a preference; nothing yet *sends* on them
// (no delivery pipeline). So copy describes the event, never promises an email.
// ─────────────────────────────────────────────────────────────
const EMAIL_ROWS: { key: keyof VendorNotificationSettings; label: string; description: string }[] = [
  { key: "emailNewRfq",        label: "New requirements (RFQs)", description: "When a buyer posts a requirement in your categories" },
  { key: "emailNewMessage",    label: "New messages",            description: "When a buyer messages you about a product or quote" },
  { key: "emailAdStatus",      label: "Ad status changes",       description: "When an ad is approved, rejected, or taken down" },
  { key: "emailPlanExpiry",    label: "Plan expiry reminders",   description: "Ahead of your subscription's renewal date" },
  { key: "emailProductStatus", label: "Product moderation",      description: "When a product goes live or needs changes" },
  { key: "emailNewsletter",    label: "Selling tips & updates",  description: "Occasional Cosora news and ways to win more orders" },
];

const PUSH_ROWS: { key: keyof VendorNotificationSettings; label: string; description: string }[] = [
  { key: "pushNewRfq",     label: "New requirements (RFQs)", description: "When a matching requirement is posted" },
  { key: "pushNewMessage", label: "New messages",            description: "When a buyer messages you" },
  { key: "pushNewLead",    label: "New leads",               description: "When a new buyer enquiry reaches your dashboard" },
];

// ── Small building blocks (Row-with-divide-y card pattern) ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {children}
    </div>
  );
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
        <p className="text-sm font-semibold text-gray-900 truncate">{value || "Not added yet"}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#256fef] mt-0.5 shrink-0" />
    </div>
  );
}

function SubgroupHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-1">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

const VendorSettings = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: profile } = useMyVendorProfile(user?.id);
  const { data: settings } = useVendorSettings(user?.id);
  const lang = useLang();

  // Notification prefs held in local state, seeded from the DB. Toggling saves
  // optimistically (flip now, revert + toast if the write fails).
  const [notif, setNotif] = useState<VendorNotificationSettings>(DEFAULT_VENDOR_NOTIFICATIONS);
  useEffect(() => { if (settings) setNotif(settings.notifications); }, [settings]);

  // A vendor's saved language should follow them across devices: on first load,
  // if the DB preference differs from this device's local language, apply it once
  // (guarded so it never fights a manual change on a later refetch).
  const appliedDbLang = useRef(false);
  useEffect(() => {
    const dbLang = settings?.regional.language;
    if (!dbLang || appliedDbLang.current) return;
    appliedDbLang.current = true;
    if (dbLang !== lang) setLang(dbLang);
  }, [settings, lang]);

  const toggleNotif = async (key: keyof VendorNotificationSettings, v: boolean) => {
    if (!user) { toast.error("Sign in to change notification settings"); return; }
    const prev = notif;
    const next = { ...notif, [key]: v };
    setNotif(next); // optimistic
    try {
      await saveVendorSetting(user.id, "notifications", next);
      qc.invalidateQueries({ queryKey: ["vendor_settings", user.id] });
    } catch (e) {
      setNotif(prev); // revert on failure
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const changeLang = async (code: Lang) => {
    setLang(code); // update the UI immediately, like everywhere else
    if (!user) return;
    try {
      await saveVendorSetting(user.id, "regional", { language: code });
      qc.invalidateQueries({ queryKey: ["vendor_settings", user.id] });
    } catch (e) {
      toast.error("Couldn't save language", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out");
      navigate("/");
    } catch (e) {
      toast.error("Couldn't log out", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        className="max-w-3xl mx-auto pb-10"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={section} className="flex items-center gap-3 mb-5">
          <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">Settings</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage your account and preferences</p>
          </div>
        </motion.div>

        <div className="space-y-6">
          {/* ── 1. Business ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Business</SectionLabel>
            <Card>
              <NavRow
                icon={Building2}
                label="Business Profile"
                description="Edit your brand, address, and verification details"
                onClick={() => navigate("/business-profile")}
              />
            </Card>
          </motion.section>

          {/* ── 2. Notifications ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Notifications</SectionLabel>
            <Card>
              <p className="px-4 pt-4 text-xs text-gray-500">
                Choose what you'd like to be notified about.
              </p>

              <SubgroupHeader icon={Mail} label="Email" />
              <div className="divide-y divide-gray-100">
                {EMAIL_ROWS.map((r) => (
                  <ToggleRow key={r.key} label={r.label} description={r.description}
                    checked={notif[r.key]} onChange={(v) => toggleNotif(r.key, v)} />
                ))}
              </div>

              <div className="border-t border-gray-100" />

              <SubgroupHeader icon={Smartphone} label="Push" />
              <div className="divide-y divide-gray-100">
                {PUSH_ROWS.map((r) => (
                  <ToggleRow key={r.key} label={r.label} description={r.description}
                    checked={notif[r.key]} onChange={(v) => toggleNotif(r.key, v)} />
                ))}
              </div>
              <div className="h-2" />
            </Card>
          </motion.section>

          {/* ── 3. Language ── */}
          <motion.section variants={section} className="space-y-2">
            <SectionLabel>Language</SectionLabel>
            <Card>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-3">
                  Sets the app language on this device and saves it to your account.
                </p>
                <div className="overflow-x-auto -mx-2 px-2">
                  <div className="flex gap-2 min-w-max">
                    {LANG_OPTIONS.map((l) => (
                      <motion.button key={l.code} whileTap={TAP} transition={TAP_T} onClick={() => changeLang(l.code)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                          lang === l.code
                            ? "border-2 border-[#256fef] text-[#256fef] bg-[#256fef]/10"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                        )}>
                        {l.native}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.section>

          {/* ── 4 + 5. Security · Help & Legal (side-by-side on desktop) ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Security */}
            <motion.section variants={section} className="space-y-2">
              <SectionLabel>Security</SectionLabel>
              <Card>
                <div className="divide-y divide-gray-100">
                  <InfoRow icon={Mail} label="Registered email" value={profile?.ownerEmail ?? ""} />
                  <InfoRow icon={Phone} label="Registered phone" value={profile?.phone ?? ""} />
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
                <ShieldCheck className="w-3 h-3" /> Cosora uses OTP sign-in, so there's no password to manage.
              </p>
            </motion.section>

            {/* Help & Legal */}
            <motion.section variants={section} className="space-y-2">
              <SectionLabel>Help &amp; Legal</SectionLabel>
              <Card>
                <div className="divide-y divide-gray-100">
                  <NavRow icon={Headphones} label="Help Center"
                    description="Guides, FAQs, and support" onClick={() => navigate("/help")} />
                  <NavRow icon={FileText} label="Terms & Privacy"
                    description="How Cosora works and handles your data" onClick={() => navigate("/terms")} />
                </div>
              </Card>
            </motion.section>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default VendorSettings;
