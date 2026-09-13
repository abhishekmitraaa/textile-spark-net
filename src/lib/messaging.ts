// ─────────────────────────────────────────────────────────────
// Outbound messaging — one seam, two providers.
//
// WHAT IS ACTUALLY BUILT HERE, STATED PLAINLY: the live provider is a real
// per-vendor WhatsApp click-to-chat link built from `vendor_profiles.whatsapp`.
// That is NOT the WhatsApp Business Cloud API. It opens WhatsApp on the
// buyer's own device with the conversation pre-addressed and pre-filled; it
// cannot deliver a message server-side, cannot use approved templates, and
// cannot notify anyone who is not currently looking at their phone.
//
// It replaces something worse: before this, the only WhatsApp in the buyer app
// was `wa.me/918821826465` hardcoded in three places in Onboarding.tsx — one
// support number for the whole platform, unrelated to the vendor being viewed.
//
// WHY NOT THE CLOUD API. It needs a Meta Business account with a verified WABA
// and a BSP relationship, plus templates approved by Meta per notification
// type. None of that exists for this project (confirmed with the user, not
// inferred from code). Cosora is instead building its own messaging service in
// a separate repo, to be consumed here as an API — see documentation/ToDo.md.
//
// So this file is a SEAM, not a stub. `MessagingProvider` is the contract that
// service will implement; every call site goes through `messaging()` and none
// of them knows which provider answered. Swapping providers is one function.
// ─────────────────────────────────────────────────────────────

export interface VendorContact {
  vendorId: string;
  brandName: string | null;
  /** vendor_profiles.whatsapp, as the vendor typed it at onboarding. */
  whatsapp: string | null;
}

export interface MessageContext {
  /** What the buyer was looking at, so the opening line is not "hi". */
  productName?: string | null;
  /** Set when this conversation was started from a paid placement. */
  adId?: string | null;
}

export type MessagingKind = "click_to_chat" | "api";

export interface MessagingProvider {
  readonly kind: MessagingKind;
  /** Human-readable, shown in UI where the limitation matters. */
  readonly label: string;
  /** False when this vendor cannot be reached by this provider at all. */
  canReach(v: VendorContact): boolean;
  /**
   * Start a conversation. Returns false when nothing could be opened, so the
   * caller can say so instead of appearing to have worked.
   */
  open(v: VendorContact, ctx?: MessageContext): boolean;
}

/**
 * Digits only, with India's country code applied when the vendor typed a bare
 * 10-digit mobile.
 *
 * wa.me requires a full international number with no punctuation. Vendors type
 * "+91 90110 60851", "09011060851" and "9011060851" interchangeably — the
 * onboarding field stores whatever they entered (`${countryCode} ${mobile}`),
 * so normalising has to happen at the point of use.
 *
 * Returns null rather than guessing when the result is not a plausible number.
 * A wrong number here opens a stranger's chat, which is worse than no button.
 */
export function whatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  // A single leading 0 is a domestic trunk prefix, not part of the number.
  d = d.replace(/^0+/, "");
  // Bare Indian mobile: 10 digits starting 6-9.
  if (/^[6-9]\d{9}$/.test(d)) d = `91${d}`;
  // Shortest plausible international number is ~8 digits; longest is 15 (E.164).
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

export function whatsappLink(raw: string | null | undefined, text?: string | null): string | null {
  const d = whatsappDigits(raw);
  if (!d) return null;
  const q = text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : "";
  return `https://wa.me/${d}${q}`;
}

function openingMessage(v: VendorContact, ctx?: MessageContext): string {
  const brand = v.brandName?.trim();
  const product = ctx?.productName?.trim();
  if (product) return `Hi${brand ? ` ${brand}` : ""}, I'm interested in "${product}" on Cosora.`;
  return `Hi${brand ? ` ${brand}` : ""}, I found you on Cosora and would like to know more.`;
}

/** The interim provider. Real, per-vendor, and honest about what it is. */
export const clickToChatProvider: MessagingProvider = {
  kind: "click_to_chat",
  label: "WhatsApp",
  canReach: (v) => whatsappDigits(v.whatsapp) !== null,
  open(v, ctx) {
    const href = whatsappLink(v.whatsapp, openingMessage(v, ctx));
    if (!href || typeof window === "undefined") return false;
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  },
};

/**
 * Selects the provider. Today there is exactly one; when Cosora's messaging
 * service ships, implement MessagingProvider against it and return it here
 * behind whatever capability check it exposes. No call site changes.
 */
export function messaging(): MessagingProvider {
  return clickToChatProvider;
}
