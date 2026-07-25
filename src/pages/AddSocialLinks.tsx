import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2, CheckCircle2, Check, Info } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyVendorProfile, saveVendorProfile } from "@/lib/queries/vendorStore";

// ── Types ──────────────────────────────────────────────────────────────────
interface SocialField {
  id: string;
  value: string;
}

interface SocialPlatform {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  icon: React.ReactNode;
  accentColor: string;
}

// ── Brand Icons (inline SVG — no brand-icon library in project) ────────────
const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="url(#igGrad)">
    <defs>
      <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#F58529" />
        <stop offset="50%" stopColor="#DD2A7B" />
        <stop offset="100%" stopColor="#8134AF" />
      </linearGradient>
    </defs>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

const WebIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
  </svg>
);

// ── Platform Config ────────────────────────────────────────────────────────
const PLATFORMS: SocialPlatform[] = [
  {
    key: "facebook",
    label: "Facebook",
    description: "Share updates and reach buyers",
    placeholder: "https://facebook.com/yourbusiness",
    icon: <FacebookIcon />,
    accentColor: "#1877F2",
  },
  {
    key: "x",
    label: "X (Twitter)",
    description: "Industry news and trends",
    placeholder: "@yourusername or https://x.com/handle",
    icon: <XIcon />,
    accentColor: "#000000",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Professional credibility and B2B reach",
    placeholder: "linkedin.com/company/yourcompany",
    icon: <LinkedInIcon />,
    accentColor: "#0A66C2",
  },
  {
    key: "youtube",
    label: "YouTube",
    description: "Showcase product videos and demos",
    placeholder: "https://youtube.com/@yourchannel",
    icon: <YouTubeIcon />,
    accentColor: "#FF0000",
  },
  {
    key: "instagram",
    label: "Instagram",
    description: "Collections, style and lifestyle content",
    placeholder: "https://instagram.com/yourbusiness",
    icon: <InstagramIcon />,
    accentColor: "#DD2A7B",
  },
  {
    key: "other",
    label: "Website / Other",
    description: "Your main website or portfolio",
    placeholder: "https://yourwebsite.com",
    icon: <WebIcon />,
    accentColor: "#6B7280",
  },
];

// ── Animation constants ─────────────────────────────────────────────────────
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const cardIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.36 } },
};

// ── Platform Card ──────────────────────────────────────────────────────────
interface PlatformCardProps {
  platform: SocialPlatform;
  fields: SocialField[];
  onChange: (id: string, value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

function PlatformCard({ platform, fields, onChange, onAdd, onRemove }: PlatformCardProps) {
  const reduced = useReducedMotion();
  const isAnyFilled = fields.some((f) => f.value.trim().length > 0);

  return (
    <motion.div
      variants={cardIn}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${platform.accentColor}14` }}
          >
            {platform.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{platform.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{platform.description}</p>
          </div>
        </div>

        {/* Completion indicator — springs in when a link is filled */}
        <AnimatePresence>
          {isAnyFilled && (
            <motion.div
              initial={reduced ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
            >
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input fields — animate in/out when added or removed */}
      <AnimatePresence initial={false}>
        {fields.map((field, idx) => (
          <motion.div
            key={field.id}
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ ease: E, duration: 0.22 }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
              <input
                type="text"
                value={field.value}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={platform.placeholder}
                className="flex-1 text-sm text-gray-900 placeholder:text-gray-300 bg-transparent border-none outline-none"
              />
              {idx > 0 && (
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  transition={TAP_T}
                  onClick={() => onRemove(field.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Add another link */}
      <motion.button
        whileTap={TAP}
        transition={TAP_T}
        onClick={onAdd}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#256fef] hover:bg-blue-50/40 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another link
      </motion.button>
    </motion.div>
  );
}

// Every platform gets at least one (empty) input so the card is never blank.
function buildFieldMap(social: Record<string, string[]> | undefined): Record<string, SocialField[]> {
  const map: Record<string, SocialField[]> = {};
  PLATFORMS.forEach((p) => {
    const stored = (social?.[p.key] ?? []).filter((url) => typeof url === "string" && url.trim());
    map[p.key] = stored.length
      ? stored.map((value, i) => ({ id: `${p.key}-${i}`, value }))
      : [{ id: `${p.key}-0`, value: "" }];
  });
  return map;
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AddSocialLinks() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: store } = useMyVendorProfile(user?.id);
  const qc = useQueryClient();

  const [fieldMap, setFieldMap] = useState<Record<string, SocialField[]>>(() => buildFieldMap(undefined));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const reduced = useReducedMotion();

  // Seed once from the profile row. Re-seeding on every `store` change would
  // wipe whatever the vendor is mid-way through typing when the query refetches.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!store || hydratedRef.current) return;
    hydratedRef.current = true;
    setFieldMap(buildFieldMap(store.social));
  }, [store]);

  const handleChange = (platformKey: string, id: string, value: string) => {
    setFieldMap((prev) => ({
      ...prev,
      [platformKey]: prev[platformKey].map((f) => (f.id === id ? { ...f, value } : f)),
    }));
    setSaved(false);
  };

  const handleAdd = (platformKey: string) => {
    setFieldMap((prev) => ({
      ...prev,
      [platformKey]: [
        ...prev[platformKey],
        { id: `${platformKey}-${Date.now()}`, value: "" },
      ],
    }));
  };

  const handleRemove = (platformKey: string, id: string) => {
    setFieldMap((prev) => ({
      ...prev,
      [platformKey]: prev[platformKey].filter((f) => f.id !== id),
    }));
  };

  const handleSave = async () => {
    if (!user) { toast.error("Sign in to save your social links"); return; }
    // Collapse the editing shape (id + value per field) down to the stored
    // shape: platform -> non-empty URLs. Platforms left blank are dropped
    // entirely rather than persisted as empty arrays.
    const built: Record<string, string[]> = {};
    PLATFORMS.forEach((p) => {
      const urls = (fieldMap[p.key] ?? []).map((f) => f.value.trim()).filter(Boolean);
      if (urls.length) built[p.key] = urls;
    });

    setSaving(true);
    try {
      await saveVendorProfile(user.id, { social: built });
      qc.invalidateQueries({ queryKey: ["vendor_profile", "mine", user.id] });
      qc.invalidateQueries({ queryKey: ["vendor_dashboard", user.id] });
      setSaved(true);
      toast.success("Social links saved");
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      // Deliberately not setting `saved` here — the button must never claim a
      // save that did not happen, which was the whole problem with this page.
      toast.error("Couldn't save social links", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const filledCount = PLATFORMS.filter((p) =>
    fieldMap[p.key].some((f) => f.value.trim())
  ).length;

  return (
    <DashboardLayout>
      <motion.div
        className="max-w-xl mx-auto space-y-4 pb-8"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* Page header */}
        <motion.div variants={cardIn} className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={TAP_T}
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Social Links</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {filledCount > 0
                ? `${filledCount} of ${PLATFORMS.length} platforms connected`
                : "Connect your business profiles"}
            </p>
          </div>
        </motion.div>

        {/* Info banner */}
        <motion.div
          variants={cardIn}
          className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-[#256fef]/10 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-4 h-4 text-[#256fef]" />
          </div>
          <p className="text-sm text-blue-700 font-medium leading-relaxed">
            Social links on your vendor profile help buyers research and trust your business before reaching out.
          </p>
        </motion.div>

        {/* Platform cards — stagger in */}
        {PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform.key}
            platform={platform}
            fields={fieldMap[platform.key]}
            onChange={(id, value) => handleChange(platform.key, id, value)}
            onAdd={() => handleAdd(platform.key)}
            onRemove={(id) => handleRemove(platform.key, id)}
          />
        ))}

        {/* Save CTA */}
        <motion.div variants={cardIn}>
          <motion.button
            whileTap={TAP}
            transition={TAP_T}
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-semibold text-sm text-white bg-[#256fef] hover:bg-[#1a5ed4] transition-colors flex items-center justify-center gap-2 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <AnimatePresence mode="wait">
              {saving ? (
                <motion.span
                  key="saving"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ ease: E, duration: 0.18 }}
                >
                  Saving...
                </motion.span>
              ) : saved ? (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ ease: E, duration: 0.18 }}
                  className="flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Saved
                </motion.span>
              ) : (
                <motion.span
                  key="save"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ ease: E, duration: 0.18 }}
                >
                  Save Social Links
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
