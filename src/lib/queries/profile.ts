import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { fetchMyContactInfo } from "@/lib/queries/myContact";
import { countryCodeFor } from "@/data/countries";
import { isBuyerRoleId, type BuyerRoleId } from "@/data/buyerRoles";

type BuyerProfileInsert = Database["public"]["Tables"]["buyer_profiles"]["Insert"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
import type { ProfileData, SocialLinks, NotificationSettings, RegionalSettings } from "@/lib/profileStore";
import { normalizeContactPhone } from "@/lib/contactPhone";

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
  fullName: "", email: "", emailVerified: false, phone: "", city: "", jobTitle: "", department: "", buyerRole: "", avatar: "",
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
    buyerRole: bp?.buyer_role ?? "",
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
  "businessName", "city", "jobTitle", "department", "buyerRole", "businessType", "website", "industry",
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
  // A changed phone is stored as E.164, and one this can't read is refused before anything is written (review M-47):
  // it is the number a seller dials. An unchanged one isn't sent, so an old free-text value doesn't block a save.
  if (p.phone !== undefined) {
    const phone = p.phone ? normalizeContactPhone(p.phone) : "";
    if (phone === null) throw new Error("Enter a 10-digit Indian mobile number, or a number with its +country code.");
    profile.phone = phone || null;
  }
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
  if (p.buyerRole !== undefined) buyer.buyer_role = p.buyerRole || null;
  if (p.businessType !== undefined) buyer.business_type = p.businessType || null;
  if (p.website !== undefined) buyer.website = p.website || null;
  if (p.industry !== undefined) buyer.industry = p.industry || null;
  if (p.street !== undefined) buyer.street = p.street || null;
  if (p.businessCity !== undefined) buyer.business_city = p.businessCity || null;
  if (p.state !== undefined) buyer.state = p.state || null;
  if (p.postalCode !== undefined) buyer.postal_code = p.postalCode || null;
  if (p.country !== undefined) {
    buyer.country = p.country || null;
    // Its code too (subscriptions P7): it decides whether the buyer's requirements are
    // overseas ones. The database would derive it from the name; sending it keeps the two
    // together whatever the name's spelling.
    buyer.country_code = countryCodeFor(p.country);
  }
  if (p.gstin !== undefined) buyer.gstin = p.gstin || null;
  if (p.pan !== undefined) buyer.pan = p.pan || null;
  if (Object.keys(buyer).length > 1) {
    const { error } = await supabase.from("buyer_profiles").upsert(buyer, { onConflict: "id" });
    if (error) throw error;
  }
}

// The Sub-role answer (sign-up's "What best describes you?"), read to show the saved pick again after a reload.
export async function fetchBuyerRole(userId: string): Promise<BuyerRoleId | null> {
  const { data, error } = await supabase.from("buyer_profiles").select("buyer_role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return isBuyerRoleId(data?.buyer_role) ? data.buyer_role : null;
}

/** Saves the Sub-role answer (buyer sign-up audit item 1: it used to be thrown away). */
export async function saveBuyerRole(userId: string, role: BuyerRoleId): Promise<void> {
  const { error } = await supabase.from("buyer_profiles").upsert({ id: userId, buyer_role: role }, { onConflict: "id" });
  if (error) throw error;
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
      const { data, error } = await supabase
        .from("buyer_profiles")
        .select("social, notifications, regional")
        .eq("id", userId as string)
        .maybeSingle();
      // A failed read is an error, never the defaults (review M-49: the pages then saved the defaults as values).
      if (error) throw error;
      return {
        social: { ...DEFAULT_SETTINGS.social, ...((data?.social as Partial<SocialLinks>) ?? {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...((data?.notifications as Partial<NotificationSettings>) ?? {}) },
        regional: { ...DEFAULT_SETTINGS.regional, ...((data?.regional as Partial<RegionalSettings>) ?? {}) },
      };
    },
    enabled: Boolean(userId),
  });
}

function withoutLanguage(r: RegionalSettings): RegionalSettings {
  const { language: _retired, ...rest } = r;
  return rest as RegionalSettings;
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
        // The interface language is ui_language in auth metadata (claude.md); the retired regional.language isn't
        // written any more (review M-52).
        : { id: userId, regional: withoutLanguage(value as RegionalSettings) };
  const { error } = await supabase.from("buyer_profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

// Sign-up's Account Information step: the six values it shows, as the form holds them ("" for none).
export interface AccountInfoValues {
  name: string;
  email: string;
  businessName: string;
  postalCode: string;
  /** Only ever set by "Use current location": a bare typed pincode is not a city (no gazetteer, no guessing). */
  city: string;
  state: string;
}

/** What Account Information shows on arrival: the saved values, so a reload or Back shows every answer again. */
export function accountInfoFrom(p: ProfileData): AccountInfoValues {
  return {
    name: p.fullName,
    // A phone sign-in's address is a placeholder nobody can receive mail at (p<digits>@phone.cosora.invalid).
    email: p.email.toLowerCase().endsWith(".invalid") ? "" : p.email,
    businessName: p.businessName,
    postalCode: p.postalCode,
    city: p.city,
    state: p.state,
  };
}

/**
 * Only what changed (MPF-9; buyer sign-up audit item 10: it wrote the name and business on every Next). An emptied
 * field is a change, saved as NULL. The location travels together: a new pincode with no located place clears the
 * old city and state, which described the pincode before it.
 */
export function accountInfoChanges(before: AccountInfoValues, after: AccountInfoValues): { profile: ProfileUpdate; buyer: Omit<BuyerProfileInsert, "id"> } {
  const profile: ProfileUpdate = {};
  const buyer: Omit<BuyerProfileInsert, "id"> = {};
  if (after.name !== before.name) {
    profile.full_name = after.name || null;
    buyer.display_name = after.name || null;
  }
  if (after.email !== before.email) profile.email = after.email || null;
  if (after.businessName !== before.businessName) buyer.company = after.businessName || null;
  if (after.postalCode !== before.postalCode || after.city !== before.city || after.state !== before.state) {
    buyer.postal_code = after.postalCode || null;
    buyer.city = after.city || null;
    buyer.state = after.state || null;
  }
  return { profile, buyer };
}

// Location is written here because it was once collected and dropped (2026-09-09): `city` is where the person is,
// never `business_city` (the company's address, which the full profile form owns).
export async function saveAccountInfo(userId: string, before: AccountInfoValues, after: AccountInfoValues): Promise<void> {
  const { profile, buyer } = accountInfoChanges(before, after);
  if (Object.keys(profile).length) {
    const { error } = await supabase.from("profiles").update(profile).eq("id", userId);
    if (error) throw error;
  }
  if (Object.keys(buyer).length) {
    const { error } = await supabase.from("buyer_profiles").upsert({ id: userId, ...buyer }, { onConflict: "id" });
    if (error) throw error;
  }
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
