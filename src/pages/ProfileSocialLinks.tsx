import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Facebook, Twitter, Linkedin, Youtube, Instagram, Link2,
  Check, ExternalLink, Share2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useProfileState, updateSocial, type SocialLinks } from "@/lib/profileStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, saveSetting } from "@/lib/queries/profile";

function SettingsHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/profile")} aria-label="Back" className="-ml-1 p-1 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
      </div>
    </div>
  );
}

// Each channel gets a brand-tinted icon tile, a label + short hint, a live
// "Added" state, and a quick "open in new tab" affordance once a value exists.
const CHANNELS: {
  key: keyof SocialLinks;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  tint: string;
  placeholder: string;
}[] = [
  { key: "facebook",  label: "Facebook",     hint: "Business Page",     icon: Facebook,  color: "text-[#1877F2]", tint: "bg-[#1877F2]/10",   placeholder: "facebook.com/yourpage" },
  { key: "x",         label: "X (Twitter)",  hint: "Business profile",  icon: Twitter,   color: "text-gray-900",  tint: "bg-gray-900/[0.06]", placeholder: "@username" },
  { key: "linkedin",  label: "LinkedIn",     hint: "Company Page",      icon: Linkedin,  color: "text-[#0A66C2]", tint: "bg-[#0A66C2]/10",   placeholder: "linkedin.com/company/name" },
  { key: "youtube",   label: "YouTube",      hint: "Channel",           icon: Youtube,   color: "text-[#FF0000]", tint: "bg-[#FF0000]/10",   placeholder: "youtube.com/@channel" },
  { key: "instagram", label: "Instagram",    hint: "Profile",           icon: Instagram, color: "text-[#E4405F]", tint: "bg-[#E4405F]/10",   placeholder: "instagram.com/handle" },
  { key: "other",     label: "Other",        hint: "Any other link",    icon: Link2,     color: "text-gray-500",  tint: "bg-gray-100",       placeholder: "https://..." },
];

const inputCls = "w-full rounded-xl border border-gray-300 bg-white pl-3.5 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] focus:ring-2 focus:ring-[#ef4d62]/15 transition-all";

function normalizeUrl(v: string) {
  const t = v.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^@/, "")}`;
}

const ProfileSocialLinks = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings(user?.id);
  const { social } = useProfileState();
  const [draft, setDraft] = useState<SocialLinks>(social);
  const [saving, setSaving] = useState(false);

  // Load the signed-in user's saved links from the DB once they arrive.
  useEffect(() => { if (user && settings) setDraft(settings.social); }, [user, settings]);

  const set = (key: keyof SocialLinks, v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const connectedCount = CHANNELS.filter((c) => (draft[c.key] || "").trim().length > 0).length;

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (user) {
        await saveSetting(user.id, "social", draft);
        queryClient.invalidateQueries({ queryKey: ["profile_settings", user.id] });
      } else {
        updateSocial(draft);
      }
      toast.success("Social links updated");
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SettingsHeader title="Social media links" />
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pt-4 pb-28">
        {/* Intro */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#ef4d62]/10 grid place-items-center shrink-0">
            <Share2 className="w-5 h-5 text-[#ef4d62]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">Connect your social profiles</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Add your channels so buyers and vendors can find and trust your brand.{" "}
              {connectedCount > 0
                ? `${connectedCount} of ${CHANNELS.length} added.`
                : "All fields are optional."}
            </p>
          </div>
        </div>

        {/* Channels */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CHANNELS.map(({ key, label, hint, icon: Icon, color, tint, placeholder }) => {
            const value = (draft[key] || "").trim();
            const filled = value.length > 0;
            return (
              <div
                key={key}
                className="rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 focus-within:border-[#ef4d62]/60"
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${tint}`}>
                    <Icon className={`w-[18px] h-[18px] ${color}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{label}</p>
                    <p className="text-[11px] text-gray-400 truncate">{hint}</p>
                  </div>
                  {filled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-600 text-[10px] font-bold px-2 py-0.5 shrink-0">
                      <Check className="w-3 h-3" /> Added
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    className={inputCls}
                    value={draft[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder}
                    aria-label={label}
                  />
                  {filled && (
                    <a
                      href={normalizeUrl(value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${label} in a new tab`}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-[#ef4d62] transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action bar */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-gray-500">
            {connectedCount === 0
              ? "No links added yet."
              : `${connectedCount} link${connectedCount > 1 ? "s" : ""} ready to save.`}
          </p>
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full sm:w-auto sm:min-w-[220px] py-3 px-6 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Update Social Links"}
          </button>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default ProfileSocialLinks;
