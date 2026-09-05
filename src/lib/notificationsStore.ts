
// ─────────────────────────────────────────────────────────────
// Notifications — view model, and the DEV-ONLY sample feed.
//
// WHAT IS REAL AND WHAT IS NOT:
//
//   Real, from the `notifications` table (migration 20260802130000), read by
//   `useNotifications()` in src/lib/queries/notifications.ts:
//     account_suspended · account_reinstated · chat_locked · chat_resumed
//   Those are written server-side by SECURITY DEFINER functions and are the
//   only notifications that exist in production today.
//
//   NOT real: requirement / quote / lead / message / ad / review / payment.
//   Nothing writes them. The `SEED` below is a design fixture so the page can
//   be worked on with a populated feed, and it is `[]` in a production build —
//   the same rule `devOnlyVideoCloseUps()` follows, and for the same reason
//   CLAUDE.md gives: an empty feed must render as genuinely empty rather than
//   quietly showing fabricated business events. A vendor being told "New
//   requirement in Cotton Fabrics — quote now" about an RFQ that does not
//   exist is worse than an empty page.
//
//   Extending the table to cover those kinds is a real piece of work (triggers
//   on rfqs / quotes / ad_orders / reviews), not a schema tweak, and it is not
//   part of the moderation work this file was changed for.
//
// This module keeps the VIEW MODEL (`VendorNotification`, tone/group/icon
// mapping) and the dev seed. It no longer owns state: read/dismiss now go to
// the database, so localStorage would only be a second, disagreeing copy.
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

/**
 * Sample notifications for local development and Playwright runs only — `[]` in
 * a production build, so the page shows the user's REAL notifications and
 * nothing else.
 *
 * `import.meta.env.DEV` is statically replaced by Vite, so SEED is tree-shaken
 * out of the production bundle entirely.
 */
export function devOnlySampleNotifications(): VendorNotification[] {
  return import.meta.env.DEV ? SEED : [];
}

// ─────────────────────────────────────────────────────────────
// Mapping the real rows onto the view model.
// ─────────────────────────────────────────────────────────────

/**
 * `kind` is un-CHECKed in SQL on purpose, so this is a lookup with a FALLBACK,
 * never an exhaustive Record. A kind shipped by a newer migration than this
 * bundle renders as a neutral system notice instead of throwing.
 */
const KIND_META: Record<string, { type: NotifType; tone: NotifTone; group: NotifGroup; actionLabel: string }> = {
  account_suspended:   { type: "system",  tone: "warning",  group: "updates", actionLabel: "Contact support" },
  account_reinstated:  { type: "system",  tone: "positive", group: "updates", actionLabel: "Go to dashboard" },
  chat_locked:         { type: "message", tone: "warning",  group: "updates", actionLabel: "Open chat" },
  chat_resumed:        { type: "message", tone: "positive", group: "updates", actionLabel: "Open chat" },
};

const FALLBACK_META = {
  type: "system" as NotifType,
  tone: "neutral" as NotifTone,
  group: "updates" as NotifGroup,
  actionLabel: "View",
};

/** Shape of one row from `notifications`. Structural, to avoid a circular import. */
export interface RawNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  read: boolean;
  created_at: string;
}

export function toVendorNotification(row: RawNotification): VendorNotification {
  const meta = KIND_META[row.kind] ?? FALLBACK_META;
  return {
    id: row.id,
    type: meta.type,
    tone: meta.tone,
    group: meta.group,
    title: row.title,
    body: row.body ?? "",
    createdAt: row.created_at,
    read: row.read,
    // conversation_id is the OTHER end of the link: /chat is the hub, and the
    // thread route keys on the other participant rather than the conversation,
    // so a row without one lands on the hub instead of a broken deep link.
    href: row.conversation_id ? "/chat" : "/notifications",
    actionLabel: meta.actionLabel,
  };
}
