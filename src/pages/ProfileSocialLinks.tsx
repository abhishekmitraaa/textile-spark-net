import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Facebook, Twitter, Linkedin, Youtube, Instagram, Link2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useProfileState, updateSocial, type SocialLinks } from "@/lib/profileStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, saveSetting } from "@/lib/queries/profile";

function SettingsHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/profile")} aria-label="Back" className="-ml-1 p-1">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
      </div>
    </div>
  );
}

// All channels (per reference annotation), kept in the clean labelled-input
// layout rather than the bare "Add another link" list style.
const CHANNELS: { key: keyof SocialLinks; label: string; icon: React.ComponentType<{ className?: string }>; color: string; placeholder: string }[] = [
  { key: "facebook", label: "Facebook Business Page", icon: Facebook, color: "text-[#1877F2]", placeholder: "facebook.com/yourpage" },
  { key: "x", label: "X (Twitter) Business", icon: Twitter, color: "text-gray-900", placeholder: "@username" },
  { key: "linkedin", label: "LinkedIn Company Page", icon: Linkedin, color: "text-[#0A66C2]", placeholder: "linkedin.com/company/name" },
  { key: "youtube", label: "YouTube Channel", icon: Youtube, color: "text-[#FF0000]", placeholder: "youtube.com/@channel" },
  { key: "instagram", label: "Instagram Profile", icon: Instagram, color: "text-[#E4405F]", placeholder: "instagram.com/handle" },
  { key: "other", label: "Other Platform", icon: Link2, color: "text-gray-500", placeholder: "https://..." },
];

const inputCls = "w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors";

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
    <div className="min-h-screen bg-white">
      <SettingsHeader title="Social media links" />
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28">
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Social Links</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">Connect your social profiles</p>

          <div className="space-y-4">
            {CHANNELS.map(({ key, label, icon: Icon, color, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
                <div className="relative">
                  <Icon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${color}`} />
                  <input className={inputCls} value={draft[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onSave}
            disabled={saving}
            className="mt-5 w-full py-3 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Update Social Links"}
          </button>
        </section>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default ProfileSocialLinks;
