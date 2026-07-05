import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ProfileData, SocialLinks, NotificationSettings, RegionalSettings } from "@/lib/profileStore";

// ─────────────────────────────────────────────────────────────
// Buyer profile — the real, DB-backed identity + business details shown on
// the My Profile page. Identity fields (name/email/phone/avatar) live on
// `profiles`; everything else on `buyer_profiles`. Google only provides
// name/email/avatar at sign-up, so the rest is filled via the Edit modal.
// ─────────────────────────────────────────────────────────────

// A blank profile used while the real one loads / before anything is filled.
export const EMPTY_PROFILE: ProfileData = {
  fullName: "", email: "", emailVerified: false, phone: "", city: "", jobTitle: "", department: "", avatar: "",
  businessName: "", businessType: "", website: "", interest: "", industry: "", street: "", businessCity: "",
  state: "", postalCode: "", country: "India", gstin: "", pan: "", location: "", memberSince: "",
};

async function fetchProfileFull(userId: string): Promise<ProfileData> {
  const [{ data: p }, { data: bp }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone, avatar_url, created_at").eq("id", userId).maybeSingle(),
    supabase.from("buyer_profiles").select("*").eq("id", userId).maybeSingle(),
  ]);
  const city = bp?.city ?? "";
  const state = bp?.state ?? "";
  return {
    fullName: p?.full_name ?? "",
    email: p?.email ?? "",
    emailVerified: Boolean(p?.email),
    phone: p?.phone ?? "",
    city,
    jobTitle: bp?.job_title ?? "",
    department: bp?.department ?? "",
    avatar: p?.avatar_url ?? "",
    businessName: bp?.company ?? "",
    businessType: bp?.business_type ?? "",
    website: bp?.website ?? "",
    interest: bp?.industry ?? "",
    industry: bp?.industry ?? "",
    street: bp?.street ?? "",
    businessCity: bp?.business_city ?? "",
    state,
    postalCode: bp?.postal_code ?? "",
    country: bp?.country ?? "India",
    gstin: bp?.gstin ?? "",
    pan: bp?.pan ?? "",
    location: [city, state].filter(Boolean).join(", "),
    memberSince: p?.created_at ? new Date(p.created_at).getFullYear().toString() : "",
  };
}

export function useProfileFull(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile_full", userId],
    queryFn: () => fetchProfileFull(userId as string),
    enabled: Boolean(userId),
  });
}

// Persist the whole profile: identity → profiles, business/personal → buyer_profiles.
export async function saveProfileFull(userId: string, f: ProfileData): Promise<void> {
  const { error: pe } = await supabase
    .from("profiles")
    .update({ full_name: f.fullName || null, email: f.email || null, phone: f.phone || null, avatar_url: f.avatar || null })
    .eq("id", userId);
  if (pe) throw pe;

  const { error: be } = await supabase.from("buyer_profiles").upsert(
    {
      id: userId,
      display_name: f.fullName || null, company: f.businessName || null,
      city: f.city || null, job_title: f.jobTitle || null, department: f.department || null,
      business_type: f.businessType || null, website: f.website || null, industry: f.industry || null,
      street: f.street || null, business_city: f.businessCity || null, state: f.state || null,
      postal_code: f.postalCode || null, country: f.country || null, gstin: f.gstin || null, pan: f.pan || null,
    },
    { onConflict: "id" }
  );
  if (be) throw be;
}

// Upload a new avatar to the avatars bucket and return its public URL. Files
// are namespaced by uid so a user can only overwrite their own.
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

// ── Settings (social / notifications / regional) stored as JSON on buyer_profiles ──
export interface ProfileSettings {
  social: SocialLinks;
  notifications: NotificationSettings;
  regional: RegionalSettings;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  social: { facebook: "", x: "", linkedin: "", youtube: "", instagram: "", other: "" },
  notifications: {
    emailNewQuote: true, emailNewMessages: true, emailRfqUpdates: true, emailNewsletter: false,
    pushQuote: true, pushMessages: true,
  },
  regional: { currency: "₹ INR", timezone: "IST (India Standard Time)", language: "English" },
};

export function useSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile_settings", userId],
    queryFn: async (): Promise<ProfileSettings> => {
      const { data } = await supabase
        .from("buyer_profiles")
        .select("social, notifications, regional")
        .eq("id", userId as string)
        .maybeSingle();
      return {
        social: { ...DEFAULT_SETTINGS.social, ...((data?.social as Partial<SocialLinks>) ?? {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...((data?.notifications as Partial<NotificationSettings>) ?? {}) },
        regional: { ...DEFAULT_SETTINGS.regional, ...((data?.regional as Partial<RegionalSettings>) ?? {}) },
      };
    },
    enabled: Boolean(userId),
  });
}

export async function saveSetting(
  userId: string,
  key: "social" | "notifications" | "regional",
  value: SocialLinks | NotificationSettings | RegionalSettings
): Promise<void> {
  const { error } = await supabase.from("buyer_profiles").upsert({ id: userId, [key]: value }, { onConflict: "id" });
  if (error) throw error;
}

// Lighter save for the signup Account-Information step (name/email/business only).
export async function saveAccountInfo(
  userId: string,
  input: { name?: string; email?: string; businessName?: string }
): Promise<void> {
  const profilePatch: Record<string, string> = {};
  if (input.name) profilePatch.full_name = input.name;
  if (input.email) profilePatch.email = input.email;
  if (Object.keys(profilePatch).length) {
    const { error } = await supabase.from("profiles").update(profilePatch).eq("id", userId);
    if (error) throw error;
  }
  const { error } = await supabase
    .from("buyer_profiles")
    .upsert({ id: userId, display_name: input.name ?? null, company: input.businessName ?? null }, { onConflict: "id" });
  if (error) throw error;
}

// Real profile stats. Counts rely on RLS: a buyer only "sees" quotes on their
// own RFQs and conversations they're part of, so a plain count is correct.
export interface ProfileStats { quotes: number; chats: number }

export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile_stats", userId],
    queryFn: async (): Promise<ProfileStats> => {
      const [{ count: quotes }, { count: chats }] = await Promise.all([
        supabase.from("quotes").select("*", { count: "exact", head: true }),
        supabase.from("conversations").select("*", { count: "exact", head: true }),
      ]);
      return { quotes: quotes ?? 0, chats: chats ?? 0 };
    },
    enabled: Boolean(userId),
  });
}
