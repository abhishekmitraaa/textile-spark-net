import { errorMessage } from "@/lib/errorMessage";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BuyerShell from "@/components/buyer/BuyerShell";
import type { ProfileData } from "@/lib/profileStore";
import { usePreferences } from "@/lib/preferencesStore";
import { useSaved } from "@/lib/savedStore";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useProfileFull, useProfileStats, useSettings, EMPTY_PROFILE } from "@/lib/queries/profile";
import { useCallCount } from "@/lib/queries/calls";
import { useOpenDeletionRequest, cancelDeletion, deletionCopy, formatDeletionDate } from "@/lib/queries/accountDeletion";
import noUserPicture from "@/assets/Buyer/profile section/No user Picture.jpg";
import {
  Pencil,
  Camera,
  BadgeCheck,
  Store,
  MapPin,
  X,
  CalendarDays,
  Mail,
  Phone,
  PhoneCall,
  FileText,
  Heart,
  MessageCircle,
  ChevronRight,
  ClipboardList,
  Bookmark,
  Star,
  Building2,
  Share2,
  Bell,
  HelpCircle,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
  LogOut,
  Sparkles,
  Globe,
  Database,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  tshirts: "T-Shirts", shirts: "Shirts", coords: "Co-ords", dresses: "Dresses",
  bottomwear: "Bottomwear", fabrics: "Fabrics", accessories: "Fashion Accessories",
  kidswear: "Kidswear", activewear: "Activewear",
};
const LOCATION_LABEL: Record<string, string> = {
  tiruppur: "Tiruppur", surat: "Surat", ludhiana: "Ludhiana", delhi: "Delhi NCR",
  bangalore: "Bangalore", mumbai: "Mumbai",
};

// ─────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] lg:text-xs font-bold uppercase tracking-wider text-gray-400 px-1 mt-6 lg:mt-7 mb-2", className)}>{children}</p>;
}

function Row({
  icon: Icon, iconColor = "text-gray-500", label, badge, value, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  label: string;
  badge?: string | number;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 lg:px-5 lg:py-4 hover:bg-gray-50 transition-colors text-left">
      <span className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className={cn("w-4 h-4 lg:w-[18px] lg:h-[18px]", iconColor)} />
      </span>
      <span className="flex-1 text-sm lg:text-[15px] font-medium text-gray-800">{label}</span>
      {badge !== undefined && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#ef4d62] text-white text-[10px] lg:text-[11px] font-bold flex items-center justify-center">{badge}</span>
      )}
      {value && <span className="text-xs lg:text-sm text-gray-400">{value}</span>}
      <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-gray-300 shrink-0" />
    </button>
  );
}

function StatCell({ icon: Icon, value, label, onClick }: {
  icon: React.ComponentType<{ className?: string }>; value: string; label: string; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={!onClick} className={cn("flex flex-col items-center gap-1 py-1 lg:py-1.5", onClick && "active:scale-95 transition-transform")}>
      <Icon className="w-5 h-5 lg:w-6 lg:h-6 text-gray-400" />
      <span className="text-base lg:text-xl font-bold text-gray-900">{value}</span>
      <span className="text-[10px] lg:text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Profile = () => {
  const navigate = useNavigate();
  const prefs = usePreferences();
  const saved = useSaved();
  const queryClient = useQueryClient();
  const { profile: authProfile, session, loading, signOut } = useAuth();
  const { data: dbProfile } = useProfileFull(authProfile?.id);
  const { data: stats } = useProfileStats(authProfile?.id);
  const { data: callCount } = useCallCount();
  const { data: settings } = useSettings(authProfile?.id);

  // Session-scoped, not persisted: a buyer who dismisses it and later decides
  // to add a city should see the prompt again next visit rather than never.
  const [cityNudgeDismissed, setCityNudgeDismissed] = useState(false);

  // A confirmed "Delete my account" (see DeleteAccountCard on /profile/help).
  // Shown until the sweep runs or the buyer cancels; deliberately not dismissible.
  const { data: deletion } = useOpenDeletionRequest();
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const onCancelDeletion = async () => {
    setCancellingDeletion(true);
    try {
      const r = await cancelDeletion();
      await queryClient.invalidateQueries({ queryKey: ["account_deletion", authProfile?.id] });
      if (r.status === "cancelled") toast.success("Account deletion cancelled");
      else toast.error(deletionCopy(r).title);
    } catch (e) {
      toast.error("We couldn't cancel the deletion", { description: errorMessage(e) });
    } finally {
      setCancellingDeletion(false);
    }
  };

  // Real signed-in user's profile from the DB (no demo fallback — a signed-out
  // visitor is prompted to sign in rather than shown a fake identity).
  const meta = (session?.user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  const view: ProfileData = dbProfile ?? {
    ...EMPTY_PROFILE,
    fullName: authProfile?.full_name ?? "",
    email: authProfile?.email ?? session?.user?.email ?? "",
    avatar: authProfile?.avatar_url ?? "",
  };

  // Avatar precedence: uploaded/saved avatar → Google picture → local fallback.
  const googlePicture = meta.avatar_url || meta.picture || "";
  const displayName = view.fullName || "Your name";
  const displayBusiness = view.businessName || "Add your business";
  const displayEmail = view.email || "—";
  const displayPhone = view.phone || "Add phone";
  const displayAvatar = view.avatar || googlePicture || noUserPicture;
  const savedCount = Object.keys(saved.products).length;
  const notifOn = settings ? Object.values(settings.notifications).some(Boolean) : true;

  // Signed out → prompt to sign in (no fake profile).
  if (!loading && !session) {
    return (
      <BuyerShell>
        <div className="max-w-2xl mx-auto px-4 pt-24 pb-24 text-center">
          <h1 className="text-lg font-bold text-gray-900">You're signed out</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to view and manage your profile.</p>
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
  const interestChips = [
    ...prefs.categories.map((id) => CATEGORY_LABEL[id] ?? id),
    ...prefs.locations.filter((l) => l !== "nopreference").map((id) => LOCATION_LABEL[id] ?? id),
  ];

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3 lg:pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 lg:mb-5">
          <h1 className="text-lg lg:text-3xl font-bold text-gray-900">My Profile</h1>
        </div>

        {/* ── City nudge ──
            Dismissible, additive, and it gates nothing. Only 1 of the buyer
            profiles on this project has a city set, which is why city-targeted
            ad campaigns reach almost nobody: ad_targeting_matches() FAILS
            CLOSED — a viewer whose city we do not know is not shown a
            city-targeted ad, because "target Mumbai" cannot honestly be
            honoured for someone whose city is unknown. That default is correct
            and stays; this just asks for the missing field.

            Deliberately framed as what the buyer gets (local suppliers), not as
            what Cosora gets (targetable inventory) — but it does not overclaim
            either: it says offers "from suppliers near you", which is what a
            city actually enables. */}
        {deletion?.status === "cooling_off" && (
          <div
            role="status"
            className="mb-3 lg:mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <p className="min-w-0 flex-1 text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Your account is scheduled for deletion</span>{" "}
              on {formatDeletionDate(deletion.scheduledFor)}.
            </p>
            <button
              onClick={onCancelDeletion}
              disabled={cancellingDeletion}
              className="shrink-0 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {cancellingDeletion ? "Cancelling…" : "Cancel deletion"}
            </button>
          </div>
        )}
        {!cityNudgeDismissed && !view.city?.trim() && (
          <div className="mb-3 lg:mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#ef4d62]/20 bg-[#ef4d62]/5 px-4 py-3">
            <MapPin className="h-4 w-4 shrink-0 text-[#ef4d62]" />
            <p className="min-w-0 flex-1 text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Add your city</span>{" "}
              to see offers from suppliers near you.
            </p>
            <button
              onClick={() => navigate("/profile/edit?focus=city")}
              className="shrink-0 rounded-xl bg-[#ef4d62] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#ef4d62]/90"
            >
              Add city
            </button>
            <button
              onClick={() => setCityNudgeDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Desktop: sticky identity rail (left) + scrolling lists (right).
            Mobile: the wrappers are display:contents, so the single-column
            stack collapses to exactly the original markup — unchanged. */}
        <div className="contents lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-8 lg:items-start">
          {/* Left rail */}
          <div className="contents lg:block lg:sticky lg:top-20">

        {/* Profile card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 lg:p-6">
          <div className="flex items-start gap-3 lg:gap-4">
            <div className="relative shrink-0">
              <img src={displayAvatar} alt={displayName} className="w-20 h-20 lg:w-24 lg:h-24 rounded-full object-cover" />
              <button
                onClick={() => navigate("/profile/edit")}
                aria-label="Change photo"
                className="absolute bottom-0 right-0 w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-[#ef4d62] flex items-center justify-center border-2 border-white"
              >
                <Camera className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-lg lg:text-xl font-bold text-gray-900 truncate">{displayName}</h2>
                    <BadgeCheck className="w-4 h-4 lg:w-5 lg:h-5 text-[#ef4d62] shrink-0" />
                  </div>
                  <p className="text-sm lg:text-base text-gray-500 truncate">{displayBusiness}</p>
                </div>
                <button
                  onClick={() => navigate("/profile/edit")}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 lg:px-4 lg:py-2 text-xs lg:text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
                >
                  <Pencil className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Edit
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 lg:mt-3 text-xs lg:text-sm text-gray-500">
                <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {view.businessType || "Buyer"}</span>
                {view.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {view.location}</span>}
                {view.memberSince && <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Since {view.memberSince}</span>}
              </div>
            </div>
          </div>

          <div className="mt-3 lg:mt-4 space-y-1.5 text-sm lg:text-[15px] text-gray-600">
            <p className="inline-flex items-center gap-2"><Mail className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-gray-400" /> {displayEmail}</p>
            <p className="inline-flex items-center gap-2"><Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-gray-400" /> {displayPhone}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 rounded-2xl border border-gray-200 bg-white mt-3 py-3 lg:py-4 divide-x divide-gray-100">
          <StatCell icon={PhoneCall} value={String(callCount ?? 0)} label="Calls" onClick={() => navigate("/chats?tab=calls")} />
          <StatCell icon={FileText} value={String(stats?.quotes ?? 0)} label="Quotes" onClick={() => navigate("/requirement/my-quotes")} />
          <StatCell icon={Heart} value={String(savedCount)} label="Saved" onClick={() => navigate("/saved")} />
          <StatCell icon={MessageCircle} value={String(stats?.chats ?? 0)} label="Chats" onClick={() => navigate("/chats")} />
        </div>

        {/* Interest & Preferences */}
        <div className="rounded-2xl border border-gray-200 bg-white mt-3 p-4 lg:p-5">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 lg:w-5 lg:h-5 text-[#ef4d62]" />
              <h3 className="text-sm lg:text-base font-bold text-gray-900">Interest &amp; Preferences</h3>
            </div>
            <button onClick={() => navigate("/profile/interest-preference")} className="text-xs lg:text-sm font-semibold text-[#ef4d62] hover:underline">Edit</button>
          </div>
          {interestChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {interestChips.map((c) => (
                <span key={c} className="bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 lg:px-3 lg:py-1.5 text-xs lg:text-sm font-medium">{c}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs lg:text-sm text-gray-400">Set your sourcing interests to personalize recommendations.</p>
          )}
        </div>
          </div>{/* /Left rail */}

          {/* Right main */}
          <div className="contents lg:block">

        {/* Activity */}
        <SectionLabel className="lg:mt-0">Activity</SectionLabel>
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          <Row icon={ClipboardList} iconColor="text-[#ef4d62]" label="Post Your Requirement" onClick={() => navigate("/requirement/post-requirement")} />
          <Row icon={FileText} iconColor="text-[#ef4d62]" label="Quotes Received" badge={stats?.quotes || undefined} onClick={() => navigate("/requirement/my-quotes")} />
          <Row icon={Bookmark} label="Saved Products" value={String(savedCount)} onClick={() => navigate("/saved")} />
          <Row icon={Star} label="My Reviews" onClick={() => navigate("/profile/reviews")} />
        </div>

        {/* Account settings */}
        <SectionLabel>Account Settings</SectionLabel>
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          <Row icon={Building2} label="Business Details" onClick={() => navigate("/profile/business-details")} />
          <Row icon={Share2} label="Social media links" onClick={() => navigate("/profile/social-links")} />
          <Row icon={Bell} label="Notifications" value={notifOn ? "On" : "Off"} onClick={() => navigate("/profile/notifications")} />
          <Row icon={Globe} label="Regional Settings" onClick={() => navigate("/profile/regional-settings")} />
          <Row icon={Database} label="Data & Export" onClick={() => navigate("/profile/data-export")} />
          <Row icon={ShieldCheck} label="Account & Security" onClick={() => navigate("/profile/settings")} />
        </div>

        {/* Help & support */}
        <SectionLabel>Help &amp; Support</SectionLabel>
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          <Row icon={HelpCircle} label="Help Center" onClick={() => navigate("/profile/help")} />
          <Row icon={MessagesSquare} label="Chat with Us" onClick={() => navigate("/profile/help/chat")} />
        </div>
          </div>{/* /Right main */}
        </div>{/* /two-column grid */}

        {/* Legal + logout */}
        <div className="mt-6 space-y-1 text-center">
          <button onClick={() => navigate("/profile/terms")} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">
            <ScrollText className="w-4 h-4" /> Terms &amp; Conditions
          </button>
          <div>
            <button onClick={() => navigate("/profile/terms")} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
              <ShieldCheck className="w-4 h-4" /> Privacy Policy
            </button>
          </div>
        </div>

        <button
          onClick={async () => { await signOut(); toast.success("Logged out"); navigate("/"); }}
          className="mt-4 w-full lg:max-w-xs lg:mx-auto flex items-center justify-center gap-2 rounded-xl border border-[#ef4d62]/40 py-3 text-sm font-bold text-[#ef4d62] hover:bg-[#ef4d62]/5 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Log Out
        </button>
      </div>
    </BuyerShell>
  );
};

export default Profile;
