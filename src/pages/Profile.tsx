import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BUSINESS_TYPES,
  INDUSTRIES,
  type ProfileData,
} from "@/lib/profileStore";
import { usePreferences } from "@/lib/preferencesStore";
import { useSaved } from "@/lib/savedStore";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useProfileFull, useProfileStats, useSettings, saveProfileFull, uploadAvatar, EMPTY_PROFILE } from "@/lib/queries/profile";
import noUserPicture from "@/assets/Buyer/profile section/No user Picture.jpg";
import {
  Pencil,
  Camera,
  BadgeCheck,
  Store,
  MapPin,
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
  Upload,
  Sparkles,
  Globe,
  Database,
  Check,
  Loader2,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors";

// ─────────────────────────────────────────────────────────────
// Edit Profile modal (Personal / Business / Photo)
// ─────────────────────────────────────────────────────────────

function EditProfileModal({
  open, onOpenChange, initialTab, profile, avatarFallback, onSave, onUploadAvatar,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; initialTab: string; profile: ProfileData;
  avatarFallback: string;
  onSave: (data: ProfileData) => Promise<void>;
  onUploadAvatar: (file: File) => Promise<string>;
}) {
  const [tab, setTab] = useState(initialTab);
  const [form, setForm] = useState<ProfileData>(profile);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await onUploadAvatar(file);
      setForm((f) => ({ ...f, avatar: url }));
      toast.success("Photo uploaded — press Save Changes to apply");
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Email verification flow
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) { setForm(profile); setTab(initialTab); setVerifying(false); setCode(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  useEffect(() => {
    if (seconds <= 0) return;
    timerRef.current = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [seconds]);

  const set = (patch: Partial<ProfileData>) => setForm((f) => ({ ...f, ...patch }));
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const startVerify = () => { setVerifying(true); setSeconds(600); toast.success("Verification code sent"); };
  const confirmVerify = () => {
    if (code.trim().length < 4) { toast.error("Enter the 6-digit code"); return; }
    set({ emailVerified: true }); setVerifying(false); toast.success("Email verified");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error("Couldn't save profile", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-center">Edit Profile</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="px-5">
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-gray-100">
              <TabsTrigger value="personal" className="rounded-full text-xs">Personal</TabsTrigger>
              <TabsTrigger value="business" className="rounded-full text-xs">Business</TabsTrigger>
              <TabsTrigger value="photo" className="rounded-full text-xs">Photo</TabsTrigger>
            </TabsList>
          </div>

          {/* PERSONAL */}
          <TabsContent value="personal" className="px-5 py-4 space-y-4 mt-0">
            <Field label="Full Name">
              <input className={inputCls} value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
            </Field>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-700">Email Address</label>
                {form.emailVerified ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600"><Check className="w-3 h-3" /> Verified</span>
                ) : (
                  <span className="text-[10px] font-bold text-[#ef4d62] bg-[#ef4d62]/10 px-1.5 py-0.5 rounded">Unverified</span>
                )}
              </div>
              <div className="flex gap-2">
                <input className={inputCls} value={form.email} onChange={(e) => set({ email: e.target.value, emailVerified: false })} />
                {!form.emailVerified && (
                  <button onClick={startVerify} className="shrink-0 px-3 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors">
                    {verifying ? "Re-send" : "Verify"}
                  </button>
                )}
              </div>
              {verifying && !form.emailVerified && (
                <div className="flex gap-2 mt-2">
                  <div className="relative flex-1">
                    <input
                      className={inputCls}
                      placeholder="Enter Verification Code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    {seconds > 0 && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#ef4d62]">{mmss}</span>}
                  </div>
                  <button onClick={confirmVerify} className="shrink-0 px-3 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors">Verify</button>
                </div>
              )}
            </div>

            <Field label="Phone Number">
              <input className={inputCls} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="City">
              <input className={inputCls} value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job Title">
                <input className={inputCls} value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
              </Field>
              <Field label="Department">
                <input className={inputCls} value={form.department} onChange={(e) => set({ department: e.target.value })} />
              </Field>
            </div>
          </TabsContent>

          {/* BUSINESS */}
          <TabsContent value="business" className="px-5 py-4 space-y-4 mt-0">
            <Field label="Business Name">
              <input className={inputCls} value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
            </Field>
            <Field label="Business Type">
              <select className={inputCls} value={form.businessType} onChange={(e) => set({ businessType: e.target.value })}>
                {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Website">
              <input className={inputCls} value={form.website} onChange={(e) => set({ website: e.target.value })} />
            </Field>
            <Field label="Industry">
              <select className={inputCls} value={form.industry} onChange={(e) => set({ industry: e.target.value })}>
                {INDUSTRIES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <p className="text-xs font-bold text-gray-900 pt-1">Business Address</p>
            <Field label="Street Address">
              <input className={inputCls} value={form.street} onChange={(e) => set({ street: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><input className={inputCls} value={form.businessCity} onChange={(e) => set({ businessCity: e.target.value })} /></Field>
              <Field label="State/Province"><input className={inputCls} value={form.state} onChange={(e) => set({ state: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Postal Code"><input className={inputCls} value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></Field>
              <Field label="Country"><input className={inputCls} value={form.country} onChange={(e) => set({ country: e.target.value })} /></Field>
            </div>
            <Field label="GSTIN">
              <input className={inputCls} value={form.gstin} onChange={(e) => set({ gstin: e.target.value })} />
            </Field>
            <Field label="PAN Number">
              <input className={inputCls} value={form.pan} onChange={(e) => set({ pan: e.target.value })} />
            </Field>
          </TabsContent>

          {/* PHOTO */}
          <TabsContent value="photo" className="px-5 py-4 mt-0">
            <div className="flex flex-col items-center text-center">
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
              <button type="button" onClick={() => photoRef.current?.click()} disabled={uploadingPhoto} className="relative">
                <img src={form.avatar || avatarFallback} alt="Profile" className="w-28 h-28 rounded-full object-cover bg-gray-100" />
                <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#ef4d62] flex items-center justify-center">
                  {uploadingPhoto ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
                </span>
              </button>
              <p className="text-xs text-gray-500 mt-3">Tap the photo to change it</p>
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-60"
              >
                <Upload className="w-4 h-4" /> {uploadingPhoto ? "Uploading…" : "Upload New Photo"}
              </button>
              <p className="text-[11px] text-gray-400 mt-2">Recommended: Square image, at least 200x200px</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={() => onOpenChange(false)} disabled={saving} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-60">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors disabled:opacity-60">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
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
  const { profile: authProfile, session, loading, signOut, refreshProfile } = useAuth();
  const { data: dbProfile } = useProfileFull(authProfile?.id);
  const { data: stats } = useProfileStats(authProfile?.id);
  const { data: settings } = useSettings(authProfile?.id);

  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState("personal");
  const openEdit = (tab: string) => { setEditTab(tab); setEditOpen(true); };

  // Real signed-in user's profile from the DB (no demo fallback — a signed-out
  // visitor is prompted to sign in rather than shown a fake identity).
  const meta = (session?.user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  const view: ProfileData = dbProfile ?? {
    ...EMPTY_PROFILE,
    fullName: authProfile?.full_name ?? "",
    email: authProfile?.email ?? session?.user?.email ?? "",
    emailVerified: true,
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

  const handleUploadAvatar = async (file: File): Promise<string> => {
    if (!authProfile?.id) throw new Error("Sign in to change your photo");
    return uploadAvatar(authProfile.id, file);
  };

  const handleSaveProfile = async (data: ProfileData) => {
    if (!authProfile?.id) return;
    await saveProfileFull(authProfile.id, data);
    await queryClient.invalidateQueries({ queryKey: ["profile_full", authProfile.id] });
    await refreshProfile();
  };

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
                onClick={() => openEdit("photo")}
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
                  onClick={() => openEdit("personal")}
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
          <StatCell icon={PhoneCall} value="0" label="Calls" onClick={() => navigate("/chats?tab=calls")} />
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
          <Row icon={Building2} label="Business Details" onClick={() => openEdit("business")} />
          <Row icon={Share2} label="Social media links" onClick={() => navigate("/profile/social-links")} />
          <Row icon={Bell} label="Notifications" value={notifOn ? "On" : "Off"} onClick={() => navigate("/profile/notifications")} />
          <Row icon={Globe} label="Regional Settings" onClick={() => navigate("/profile/regional-settings")} />
          <Row icon={Database} label="Data & Export" onClick={() => navigate("/profile/data-export")} />
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

      <EditProfileModal
        open={editOpen}
        onOpenChange={setEditOpen}
        initialTab={editTab}
        profile={{ ...view, avatar: view.avatar || googlePicture }}
        avatarFallback={noUserPicture}
        onSave={handleSaveProfile}
        onUploadAvatar={handleUploadAvatar}
      />
    </BuyerShell>
  );
};

export default Profile;
