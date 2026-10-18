import { useSyncExternalStore } from "react";
import { LANGUAGE_NAMES } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────
// Buyer profile + account settings.
//
// The settings sub-pages' local state (Social Links, Notifications, Regional),
// backed by localStorage via useSyncExternalStore so every surface stays in
// sync and survives reloads. ProfileData is the profile's SHAPE only: the
// profile itself lives in the database (lib/queries/profile.ts).
//
// 2026-10-18: the store no longer holds a profile. Its default was an invented
// person ("Rajesh Kumar", an email, phone, Mumbai address, company, GSTIN, PAN
// and a picsum photo), and Search greeted signed-out visitors with that name.
// Nothing read or wrote it after that greeting went, so it is gone, and a copy a
// browser saved earlier is dropped from storage when the store loads.
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

export type SocialLinks = {
  facebook: string;
  x: string;
  linkedin: string;
  youtube: string;
  instagram: string;
  other: string;
};

export type NotificationSettings = {
  emailNewQuote: boolean;
  emailNewMessages: boolean;
  emailRfqUpdates: boolean;
  emailNewsletter: boolean;
  pushQuote: boolean;
  pushMessages: boolean;
};

export type RegionalSettings = {
  currency: string;
  timezone: string;
  language: string;
};

export interface ProfileState {
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
      const parsed = JSON.parse(raw) as Partial<ProfileState> & { profile?: unknown };
      // Merge so new fields added later still get defaults.
      const loaded: ProfileState = {
        social: { ...DEFAULT_STATE.social, ...parsed.social },
        notifications: { ...DEFAULT_STATE.notifications, ...parsed.notifications },
        regional: { ...DEFAULT_STATE.regional, ...parsed.regional },
      };
      // Saved before 2026-10-18: the invented demo profile. Write the settings back without it.
      if (parsed.profile !== undefined) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
        } catch {
          /* storage unavailable; it is ignored anyway */
        }
      }
      return loaded;
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
