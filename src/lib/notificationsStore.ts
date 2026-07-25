import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────
// Vendor notifications store.
//
// Drives the vendor Notifications page (`/notifications`) and the unread
// badge on the dashboard header bell. The headline event is a NEW BUYER
// REQUIREMENT (RFQ) posted in one of the vendor's domains/categories — the
// vendor's cue to jump in and quote. Alongside that it carries the full
// spread of vendor-side updates: quote status changes, direct leads, buyer
// messages, ad performance, payments, reviews and platform/account updates.
//
// Same module-level `useSyncExternalStore` + localStorage pattern the buyer
// stores use (savedStore, followingStore, …) — no React context/provider.
// ─────────────────────────────────────────────────────────────

/** Which filter tab a notification belongs to. */
export type NotifGroup = "requirements" | "quotes" | "payments" | "updates";

export type NotifType =
  | "requirement" // new buyer RFQ in the vendor's domain
  | "quote" // status change on a quote the vendor sent
  | "lead" // a direct buyer inquiry landed in the vendor dashboard
  | "message" // new chat message from a buyer
  | "ad" // advertisement performance / budget
  | "review" // a buyer left a review
  | "payment" // order won / payment received / invoice
  | "system"; // profile score, verification, subscription, policy

// A restrained, meaning-first colour system (not one hue per type). Brand blue
// is the primary accent and dominates; the others fire only when they carry
// real state, so the eye is drawn to money and to things needing attention.
export type NotifTone =
  | "brand" // a new business opportunity (requirement / lead)
  | "positive" // something was won / money arrived (quote accepted, payment)
  | "warning" // needs the vendor's attention (ad budget running low)
  | "neutral"; // informational (message, review, ad stats, account updates)

/** Structured detail shown as chips on a "requirement" notification. */
export interface RequirementMeta {
  category: string;
  location: string;
  quantity: string;
  budget: string;
  deadline: string;
}

export interface VendorNotification {
  id: string;
  type: NotifType;
  tone: NotifTone;
  group: NotifGroup;
  title: string;
  body: string;
  /** ISO timestamp — seeded relative to first load, then persisted. */
  createdAt: string;
  read: boolean;
  /** Where the card / CTA navigates. */
  href: string;
  actionLabel: string;
  requirement?: RequirementMeta;
}

const STORAGE_KEY = "cosora.vendor.notifications.v1";

// minutes-ago → ISO, evaluated once at module init so the seeded feed reads
// as "just now / 2h ago / yesterday" the first time it's opened.
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const SEED: VendorNotification[] = [
  {
    id: "n-req-1",
    type: "requirement",
    tone: "brand",
    group: "requirements",
    title: "New requirement in Cotton Fabrics",
    body: "A buyer in Bengaluru is sourcing combed cotton poplin, 120 GSM, in solid dyed colours. It matches your catalogue.",
    createdAt: ago(8),
    read: false,
    href: "/leads",
    actionLabel: "Quote now",
    requirement: {
      category: "Cotton Fabrics",
      location: "Bengaluru, KA",
      quantity: "5,000 m",
      budget: "₹2,40,000",
      deadline: "Closes in 3 days",
    },
  },
  {
    id: "n-req-2",
    type: "requirement",
    tone: "brand",
    group: "requirements",
    title: "New requirement in Knitwear",
    body: "A retail brand needs oversized fleece hoodies, 320 GSM, in a custom Pantone. Looking for TradeSEAL vendors.",
    createdAt: ago(52),
    read: false,
    href: "/leads",
    actionLabel: "Quote now",
    requirement: {
      category: "Knitwear",
      location: "Tiruppur, TN",
      quantity: "2,500 pcs",
      budget: "₹8,75,000",
      deadline: "Closes in 5 days",
    },
  },
  {
    id: "n-quote-1",
    type: "quote",
    tone: "positive",
    group: "quotes",
    title: "Your quote was accepted",
    body: "Meridian Apparel accepted your quote of ₹1,95,000 for 3,000 m viscose crepe. Confirm the order to get started.",
    createdAt: ago(95),
    read: false,
    href: "/quotes",
    actionLabel: "View quote",
  },
  {
    id: "n-lead-1",
    type: "lead",
    tone: "brand",
    group: "quotes",
    title: "New lead from Anaya Exports",
    body: "A sourcing manager viewed your store and requested a callback about linen blends for their SS26 line.",
    createdAt: ago(140),
    read: false,
    href: "/leads",
    actionLabel: "Open lead",
  },
  {
    id: "n-req-3",
    type: "requirement",
    tone: "brand",
    group: "requirements",
    title: "New requirement in Denim",
    body: "A buyer in Delhi is sourcing 12 oz stretch denim for a private-label jeans run. Sampling is required.",
    createdAt: ago(210),
    read: true,
    href: "/leads",
    actionLabel: "Quote now",
    requirement: {
      category: "Denim",
      location: "Delhi, DL",
      quantity: "4,200 m",
      budget: "₹6,30,000",
      deadline: "Closes in 6 days",
    },
  },
  {
    id: "n-msg-1",
    type: "message",
    tone: "neutral",
    group: "quotes",
    title: "New message from Meridian Apparel",
    body: "\"Can you share the lab-dip turnaround for the accepted quote? We'd like to lock the delivery date.\"",
    createdAt: ago(320),
    read: true,
    href: "/chat",
    actionLabel: "Reply",
  },
  {
    id: "n-pay-1",
    type: "payment",
    tone: "positive",
    group: "payments",
    title: "Payment received: ₹1,95,000",
    body: "The advance for order #CS-4821 (viscose crepe, 3,000 m) has been credited. Your Total Order Value is updated.",
    createdAt: ago(1_100),
    read: true,
    href: "/quotes",
    actionLabel: "View order",
  },
  {
    id: "n-ad-1",
    type: "ad",
    tone: "neutral",
    group: "updates",
    title: "Your ad reached 5,240 buyers",
    body: "The \"Premium Cotton Poplin\" campaign got 5,240 impressions and 312 store visits this week, up 28%.",
    createdAt: ago(1_460),
    read: true,
    href: "/advertisements",
    actionLabel: "View campaign",
  },
  {
    id: "n-review-1",
    type: "review",
    tone: "neutral",
    group: "updates",
    title: "New 5-star review",
    body: "Anaya Exports rated you 5 stars: \"Consistent GSM and on-time dispatch. We will reorder.\"",
    createdAt: ago(2_050),
    read: true,
    href: "/reviews",
    actionLabel: "See review",
  },
  {
    id: "n-sys-1",
    type: "system",
    tone: "neutral",
    group: "updates",
    title: "Your Profile Score rose to 78%",
    body: "Adding your GST and 4 new product photos boosted your visibility. Reach 90% to appear in more buyer searches.",
    createdAt: ago(2_880),
    read: true,
    href: "/business-profile-score",
    actionLabel: "Improve profile",
  },
  {
    id: "n-ad-2",
    type: "ad",
    tone: "warning",
    group: "updates",
    title: "Ad budget running low",
    body: "The \"Knit Fleece Hoodies\" campaign has 12% of its budget left. Top up to keep appearing in buyer searches.",
    createdAt: ago(4_320),
    read: true,
    href: "/advertisements",
    actionLabel: "Top up budget",
  },
  {
    id: "n-sys-2",
    type: "system",
    tone: "neutral",
    group: "updates",
    title: "TradeSEAL verification approved",
    body: "Your business is now TradeSEAL verified. The badge is live on your store and boosts buyer trust.",
    createdAt: ago(7_200),
    read: true,
    href: "/my-store",
    actionLabel: "View store",
  },
];

function load(): VendorNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VendorNotification[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return SEED;
}

let state: VendorNotification[] = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode); state still lives in memory */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

export function markRead(id: string) {
  if (state.find((n) => n.id === id)?.read) return;
  state = state.map((n) => (n.id === id ? { ...n, read: true } : n));
  emit();
}

export function markUnread(id: string) {
  if (state.find((n) => n.id === id)?.read === false) return;
  state = state.map((n) => (n.id === id ? { ...n, read: false } : n));
  emit();
}

export function markAllRead() {
  if (state.every((n) => n.read)) return;
  state = state.map((n) => (n.read ? n : { ...n, read: true }));
  emit();
}

export function removeNotification(id: string) {
  state = state.filter((n) => n.id !== id);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function useNotifications(): VendorNotification[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Cached so the header badge doesn't re-render on every unrelated tick. */
let cachedUnread = state.filter((n) => !n.read).length;
let cachedForState: VendorNotification[] = state;
function getUnreadSnapshot() {
  if (cachedForState !== state) {
    cachedForState = state;
    cachedUnread = state.filter((n) => !n.read).length;
  }
  return cachedUnread;
}

export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, getUnreadSnapshot, getUnreadSnapshot);
}
