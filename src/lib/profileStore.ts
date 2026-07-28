import { useSyncExternalStore } from "react";
import { img } from "@/lib/listingProducts";
import { LANGUAGE_NAMES } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────
// Buyer profile + account settings.
//
// Single source of truth for the My Profile page, the Edit Profile modal,
// and the settings sub-pages (Social Links, Notifications, Regional + Data).
// Backed by localStorage via useSyncExternalStore so every surface stays in
// sync and survives reloads.
// ─────────────────────────────────────────────────────────────

export interface ProfileData {
  // Personal
  fullName: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  city: string;
  jobTitle: string;
  department: string;
  avatar: string;
  // Business
  businessName: string;
  businessType: string;
  website: string;
  interest: string;
  industry: string;
  street: string;
  businessCity: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string;
  pan: string;
  // Display
  location: string;
  memberSince: string;
}

export interface SocialLinks {
  facebook: string;
  x: string;
  linkedin: string;
  youtube: string;
  instagram: string;
  other: string;
}

export interface NotificationSettings {
  emailNewQuote: boolean;
  emailNewMessages: boolean;
  emailRfqUpdates: boolean;
  emailNewsletter: boolean;
  pushQuote: boolean;
  pushMessages: boolean;
}

export interface RegionalSettings {
  currency: string;
  timezone: string;
  language: string;
}

export interface ProfileState {
  profile: ProfileData;
  social: SocialLinks;
  notifications: NotificationSettings;
  regional: RegionalSettings;
}

// Dropdown option sets (per reference annotations).
export const BUSINESS_TYPES = [
  "Fashion Brand",
  "E-commerce",
  "Corporate",
  "Shop Owner",
  "Retailer",
  "Wholesaler",
  "Manufacturer",
  "Distributor",
  "Exporter",
  "Importer",
];

export const INDUSTRIES = [
  "Fashion & Apparel",
  "Footwear",
  "Accessories",
  "Cosmetics",
  "Packaging",
  "Clothing Machinery",
  "Home Textile",
  "Raw Material",
  "Printing Services",
  "Logistics",
  "Freelancer & Job workers",
  "Corporate gifting & Events",
  "GYM Equipments",
  "Electronics",
  "Sports & Outdoors",
];

export const CURRENCIES = ["₹ INR", "$ USD", "€ EUR", "£ GBP"];
export const TIMEZONES = [
  "IST (India Standard Time)",
  "Eastern Time (ET)",
  "Pacific Time (PT)",
  "GMT (Greenwich Mean)",
  "CET (Central European)",
];
// Only languages that actually translate. "Tamil" used to be offered here and
// silently fell back to English (no dictionary). Re-exported from i18n so the
// picker can never drift from what's really supported.
export const LANGUAGES = LANGUAGE_NAMES;

const DEFAULT_STATE: ProfileState = {
  profile: {
    fullName: "Rajesh Kumar",
    email: "rajesh.kumar@fabricworld.in",
    emailVerified: true,
    phone: "+91 98765 43210",
    city: "Mumbai",
    jobTitle: "Procurement Manager",
    department: "Sourcing",
    avatar: img("buyer-rajesh-kumar", 240, 240),
    businessName: "Fabric World Pvt. Ltd.",
    businessType: "Retailer",
    website: "www.fabricworld.in",
    interest: "Fashion & Apparel",
    industry: "Fashion & Apparel",
    street: "123 Fashion Avenue",
    businessCity: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    country: "India",
    gstin: "27AABCU9603R1ZM",
    pan: "ABCPK1234L",
    location: "Mumbai, Maharashtra",
    memberSince: "2023",
  },
  social: { facebook: "", x: "", linkedin: "", youtube: "", instagram: "", other: "" },
  notifications: {
    emailNewQuote: true,
    emailNewMessages: true,
    emailRfqUpdates: true,
    emailNewsletter: false,
    pushQuote: true,
    pushMessages: true,
  },
  regional: { currency: "₹ INR", timezone: "IST (India Standard Time)", language: "English" },
};

const STORAGE_KEY = "cosora.buyerProfile.v1";

function load(): ProfileState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProfileState>;
      // Merge so new fields added later still get defaults.
      return {
        profile: { ...DEFAULT_STATE.profile, ...parsed.profile },
        social: { ...DEFAULT_STATE.social, ...parsed.social },
        notifications: { ...DEFAULT_STATE.notifications, ...parsed.notifications },
        regional: { ...DEFAULT_STATE.regional, ...parsed.regional },
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_STATE;
}

let state: ProfileState = load();
const listeners = new Set<() => void>();

function commit(next: ProfileState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable; keep in memory */
  }
  listeners.forEach((l) => l());
}

export const updateProfile = (patch: Partial<ProfileData>) =>
  commit({ ...state, profile: { ...state.profile, ...patch } });
export const updateSocial = (patch: Partial<SocialLinks>) =>
  commit({ ...state, social: { ...state.social, ...patch } });
export const updateNotifications = (patch: Partial<NotificationSettings>) =>
  commit({ ...state, notifications: { ...state.notifications, ...patch } });
export const updateRegional = (patch: Partial<RegionalSettings>) =>
  commit({ ...state, regional: { ...state.regional, ...patch } });

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function useProfileState(): ProfileState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
