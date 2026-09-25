import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useProfileState, updateNotifications, type NotificationSettings } from "@/lib/profileStore";
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

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#ef4d62] mt-0.5 shrink-0" />
    </div>
  );
}

// These switches are SAVED PREFERENCES ONLY (checked repo-wide, 2026-09-23).
// Nothing sends email or push from them: there is no push pipeline, and the one
// sender (account-deletion: email, or WhatsApp for an account with no email) is
// transactional and ignores them. Nor do they
// feed the in-app bell, which notify() fills only from moderation, account, ad and
// certificate events, never from quotes, messages or RFQ updates. So the copy says
// "saved for when it launches" and names events, not "get notified" or "instant
// alerts". Set DELIVERY_LIVE to true only once a sender actually reads these keys.
const DELIVERY_LIVE = false;

const EMAIL_ROWS: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: "emailNewQuote", label: "New Quote Received", description: "When vendors submit quotes on your requests" },
  { key: "emailNewMessages", label: "New Messages", description: "When vendors message you" },
  { key: "emailRfqUpdates", label: "RFQ Updates", description: "When the status of your requests changes" },
  { key: "emailNewsletter", label: "Newsletter & Tips", description: "Sourcing tips and platform updates" },
];

const PUSH_ROWS: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: "pushQuote", label: "Quote Notifications", description: "New quotes on your requests" },
  { key: "pushMessages", label: "Message Alerts", description: "New messages from vendors" },
];

const ProfileNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings(user?.id);
  const { notifications } = useProfileState();
  const [draft, setDraft] = useState<NotificationSettings>(notifications);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user && settings) setDraft(settings.notifications); }, [user, settings]);

  const set = (key: keyof NotificationSettings, v: boolean) => setDraft((d) => ({ ...d, [key]: v }));

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (user) {
        await saveSetting(user.id, "notifications", draft);
        queryClient.invalidateQueries({ queryKey: ["profile_settings", user.id] });
      } else {
        updateNotifications(draft);
      }
      toast.success("Notification settings saved", DELIVERY_LIVE ? undefined : {
        description: "They'll apply when email and push notifications launch.",
      });
    } catch (e) {
      toast.error("Couldn't save", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <SettingsHeader title="Notifications" />
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">
        {!DELIVERY_LIVE && (
          <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
            Email and push notifications aren&rsquo;t live yet. Your choices here are saved and will apply when they launch. Nothing is sent today.
          </p>
        )}

        {/* Email */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Email Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-1">
            {DELIVERY_LIVE ? "Manage your email notification preferences" : "Saved for when Cosora starts sending email"}
          </p>
          <div className="divide-y divide-gray-100">
            {EMAIL_ROWS.map((r) => (
              <ToggleRow key={r.key} label={r.label} description={r.description} checked={draft[r.key]} onChange={(v) => set(r.key, v)} />
            ))}
          </div>
        </section>

        {/* Push */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Push Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-1">
            {DELIVERY_LIVE ? "Browser and app notifications" : "Saved for when browser and app notifications launch"}
          </p>
          <div className="divide-y divide-gray-100">
            {PUSH_ROWS.map((r) => (
              <ToggleRow key={r.key} label={r.label} description={r.description} checked={draft[r.key]} onChange={(v) => set(r.key, v)} />
            ))}
          </div>
        </section>

        <button
          onClick={onSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Notification Settings"}
        </button>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default ProfileNotifications;
