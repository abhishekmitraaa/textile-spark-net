import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { fetchMyContactInfo } from "@/lib/queries/myContact";

type BuyerProfileInsert = Database["public"]["Tables"]["buyer_profiles"]["Insert"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
import type { ProfileData, SocialLinks, NotificationSettings, RegionalSettings } from "@/lib/profileStore";

// ─────────────────────────────────────────────────────────────
// Buyer profile — the real, DB-backed identity + business details shown on
// the My Profile page. Identity fields (name/email/phone/avatar) live on
// `profiles`; everything else on `buyer_profiles`. Google only provides
// name/email/avatar at sign-up, so the rest is filled via /profile/edit and
// /profile/business-details (hooks/useEditableProfile.ts).
// ─────────────────────────────────────────────────────────────

// A blank profile used while the real one loads / before anything is filled.
// `country` is blank too. "India" is only the Country field's placeholder on
// /profile/business-details: a default here was saved as data (MPF-9).
export const EMPTY_PROFILE: ProfileData = {
  fullName: "", email: "", emailVerified: false, phone: "", city: "", jobTitle: "", department: "", avatar: "",
  businessName: "", businessType: "", website: "", interest: "", industry: "", street: "", businessCity: "",
  state: "", postalCode: "", country: "", gstin: "", pan: "", location: "", memberSince: "",
};

// The signed-in user's own profile: every caller passes their own id, and the
// email and phone come from my_contact_info(), which only reads auth.uid()'s row
// (profiles.email and .phone are not client-selectable, MPF-3).
//
// Read errors throw rather than falling through to blanks. useEditableProfile
// seeds its form, and the baseline a save diffs against, from the first result,
// so a refused read that came back as "" would show blanks for real values.
async function fetchProfileFull(userId: string): Promise<ProfileData> {
  const [{ data: p, error: pErr }, contact, { data: bp, error: bErr }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, created_at").eq("id", userId).maybeSingle(),
    fetchMyContactInfo(),
    supabase.from("buyer_profiles").select("*").eq("id", userId).maybeSingle(),
  ]);
  if (pErr) throw pErr;
  if (bErr) throw bErr;
  const city = bp?.city ?? "";
  const state = bp?.state ?? "";
  return {
    fullName: p?.full_name ?? "",
    email: contact.email ?? "",
    emailVerified: Boolean(contact.email),
    phone: contact.phone ?? "",
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
    country: bp?.country ?? "",
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

// The form fields a save can write. The rest of ProfileData is derived or
// display-only (emailVerified, interest, location, memberSince).
const SAVED_FIELDS = [
  "fullName", "email", "phone", "avatar",
  "businessName", "city", "jobTitle", "department", "businessType", "website", "industry",
  "street", "businessCity", "state", "postalCode", "country", "gstin", "pan",
] as const;
export type ProfileChanges = Partial<Pick<ProfileData, (typeof SAVED_FIELDS)[number]>>;

/** The saved fields whose value differs between two versions of the form. */
export function profileChanges(before: ProfileData, after: ProfileData): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const k of SAVED_FIELDS) if (before[k] !== after[k]) changes[k] = after[k];
  return changes;
}

// Persist only the fields given: identity → profiles, business/personal →
// buyer_profiles. A field that isn't in `p` is not written, and a table with
// nothing to write isn't touched. An empty string is stored as NULL, so
// clearing a field clears the column.
//
// It used to write every field on every save (MPF-9): an empty country became
// "India", the name was copied into display_name and the Google picture became
// the stored avatar, whatever the buyer had actually edited.
export async function saveProfileFull(userId: string, p: ProfileChanges): Promise<void> {
  const profile: ProfileUpdate = {};
  if (p.fullName !== undefined) profile.full_name = p.fullName || null;
  if (p.email !== undefined) profile.email = p.email || null;
  if (p.phone !== undefined) profile.phone = p.phone || null;
  if (p.avatar !== undefined) profile.avatar_url = p.avatar || null;
  if (Object.keys(profile).length) {
    const { error } = await supabase.from("profiles").update(profile).eq("id", userId);
    if (error) throw error;
  }

  // An upsert writes only the columns it is given, so one that exists keeps
  // the rest; a new row gets NULL for them.
  const buyer: BuyerProfileInsert = { id: userId };
  if (p.fullName !== undefined) buyer.display_name = p.fullName || null;
  if (p.businessName !== undefined) buyer.company = p.businessName || null;
  if (p.city !== undefined) buyer.city = p.city || null;
  if (p.jobTitle !== undefined) buyer.job_title = p.jobTitle || null;
  if (p.department !== undefined) buyer.department = p.department || null;
  if (p.businessType !== undefined) buyer.business_type = p.businessType || null;
  if (p.website !== undefined) buyer.website = p.website || null;
  if (p.industry !== undefined) buyer.industry = p.industry || null;
  if (p.street !== undefined) buyer.street = p.street || null;
  if (p.businessCity !== undefined) buyer.business_city = p.businessCity || null;
  if (p.state !== undefined) buyer.state = p.state || null;
  if (p.postalCode !== undefined) buyer.postal_code = p.postalCode || null;
  if (p.country !== undefined) buyer.country = p.country || null;
  if (p.gstin !== undefined) buyer.gstin = p.gstin || null;
  if (p.pan !== undefined) buyer.pan = p.pan || null;
  if (Object.keys(buyer).length > 1) {
    const { error } = await supabase.from("buyer_profiles").upsert(buyer, { onConflict: "id" });
    if (error) throw error;
  }
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
  // Same reason as saveVendorSetting: a computed key widens to an index
  // signature, which the builder cannot match against real columns. Building
  // the row per branch keeps it type-checked.
  const row: BuyerProfileInsert =
    key === "social"
      ? { id: userId, social: value as SocialLinks }
      : key === "notifications"
        ? { id: userId, notifications: value as NotificationSettings }
        : { id: userId, regional: value as RegionalSettings };
  const { error } = await supabase.from("buyer_profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

// Lighter save for the signup Account-Information step (name/email/business only).
export async function saveAccountInfo(
  userId: string,
  input: {
    name?: string; email?: string; businessName?: string;
    /** Six-digit pincode, typed or reverse-geocoded. */
    postalCode?: string | null;
    /** Only ever set on the geolocation path — see the note below. */
    city?: string | null;
    state?: string | null;
  }
): Promise<void> {
  const profilePatch: ProfileUpdate = {};
  if (input.name) profilePatch.full_name = input.name;
  if (input.email) profilePatch.email = input.email;
  if (Object.keys(profilePatch).length) {
    const { error } = await supabase.from("profiles").update(profilePatch).eq("id", userId);
    if (error) throw error;
  }

  // Location is written here because it was previously COLLECTED AND DROPPED.
  // AccountInfo.tsx asks for a pincode, and on the "use my location" path it
  // reverse-geocodes a city and state out of BigDataCloud too — then used them
  // for a toast message and threw them away, so `buyer_profiles.city/state/
  // postal_code` stayed null for every account created through onboarding.
  // That is what made vendor buyer-geography unbuildable.
  //
  // Column choice mirrors saveProfileFull: `city` is the person's own city,
  // `business_city` is their company's address and is NOT touched here — the
  // geolocation reading is where the human is standing, not where their firm is
  // registered, and conflating the two would corrupt a field the full profile
  // form owns.
  //
  // ASYMMETRY IS DELIBERATE. city/state are written ONLY when the geolocation
  // path resolved them. A bare typed pincode persists postal_code alone: there
  // is no pincode→city table in this project, and guessing one would put a
  // fabricated city on a vendor's map, which is the exact failure mode the rest
  // of this page's analytics work exists to remove.
  const buyerPatch: BuyerProfileInsert = {
    id: userId,
    display_name: input.name ?? null,
    company: input.businessName ?? null,
  };
  if (input.postalCode) buyerPatch.postal_code = input.postalCode;
  if (input.city) buyerPatch.city = input.city;
  if (input.state) buyerPatch.state = input.state;

  const { error } = await supabase.from("buyer_profiles").upsert(buyerPatch, { onConflict: "id" });
  if (error) throw error;
}

// Real profile stats: the user's OWN quotes and chats, each filtered on the
// owner column. RLS alone does not mean "mine" here (MPF-1): quotes_select also
// admits `vendor_id = auth.uid()` and every admin, and conversations_select
// admits support/super_admin admins, so a bare count added quotes a user SENT
// as a vendor and, for an admin, every quote or chat on the platform.
//   • Quotes = quotes RECEIVED on the user's own RFQs, the same set the stat
//     links to (/requirement/my-quotes, its "Total Quotes").
//   • Chats  = conversations the user is a party to, the same filter as the
//     /chats list (useConversations in queries/chat.ts).
export interface ProfileStats { quotes: number; chats: number }

export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile_stats", userId],
    queryFn: async (): Promise<ProfileStats> => {
      const [quotesRes, chatsRes] = await Promise.all([
        supabase
          .from("quotes")
          .select("id, rfqs!inner(buyer_id)", { count: "exact", head: true })
          .eq("rfqs.buyer_id", userId as string),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .or(`user_a.eq.${userId},user_b.eq.${userId}`),
      ]);
      if (quotesRes.error) throw quotesRes.error;
      if (chatsRes.error) throw chatsRes.error;
      return { quotes: quotesRes.count ?? 0, chats: chatsRes.count ?? 0 };
    },
    enabled: Boolean(userId),
  });
}
