import { supabase } from "@/lib/supabase";
import { ownStorageUrl } from "@/lib/storageUrl";
import type { ProfileScoreRow } from "@/lib/queries/vendorDashboard";

// ─────────────────────────────────────────────────────────────
// Seller Home in one call: public.seller_home_summary() (migration 20261116100100).
//
// It replaced about 15 requests per load (every open requirement, every own product with its pictures, every chat,
// seven counts) with one. The function is SECURITY INVOKER, so every requirement it counts passes rfqs_select, the
// same rule /leads reads through. null = signed out or no vendor_profiles row.
// ─────────────────────────────────────────────────────────────

export interface SellerHomeCounts {
  total: number;
  live: number;
  underReview: number;
  openLeads: number;
  directRequests: number;
  enquiries: number;
  quotesSent: number;
  quotesAccepted: number;
}

export interface SellerHomeReview {
  registrationStatus: string | null;
  contractSigned: boolean;
  documentsPending: number;
  documentsRejected: number;
  productsInReview: number;
  /** Listings Cosora sent back, and listings paused over the plan's limit (review L-77, migration 20261120130000). */
  productsRejected: number;
  /** Taken down by moderation: not something an edit fixes (code review). */
  productsRemoved: number;
  productsPaused: number;
  premisesInReview: number;
}

export interface SellerHomeProduct {
  id: string;
  name: string;
  priceValue: number | null;
  unit: string | null;
  image: string | null;
  views: number;
  inquiries: number;
}

export interface SellerHomeLead {
  id: string;
  title: string;
  productName: string;
  quantity: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  image: string | null;
  createdAt: string;
  direct: boolean;
  quoted: boolean;
  /** The seller's newest quote on it, for "View quote" (review L-76). */
  quoteId: string | null;
}

export interface SellerHomeChat {
  otherId: string;
  name: string;
  avatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
}

export interface SellerHome {
  counts: SellerHomeCounts;
  profile: ProfileScoreRow;
  review: SellerHomeReview;
  topProducts: SellerHomeProduct[];
  recentLeads: SellerHomeLead[];
  recentChats: SellerHomeChat[];
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Maps the jsonb answer (snake_case) to the app's shape. Pure, so a spec or a REPL can call it. */
export function sellerHomeFrom(raw: Raw | null): SellerHome | null {
  if (!raw) return null;
  const c = (raw.counts ?? {}) as Raw;
  const r = (raw.review ?? {}) as Raw;
  const p = (raw.profile ?? {}) as Raw;
  return {
    counts: {
      total: num(c.total),
      live: num(c.live),
      underReview: num(c.under_review),
      openLeads: num(c.open_leads),
      directRequests: num(c.direct_requests),
      enquiries: num(c.enquiries),
      quotesSent: num(c.quotes_sent),
      quotesAccepted: num(c.quotes_accepted),
    },
    profile: {
      about: str(p.about),
      phone: str(p.phone),
      owner_email: str(p.owner_email),
      website: str(p.website),
      category: (p.category as string[] | null) ?? null,
      office_photos: (p.office_photos as string[] | null) ?? null,
      year_established: numOrNull(p.year_established),
      employee_count: str(p.employee_count),
      annual_turnover: str(p.annual_turnover),
      capacity: (p.capacity as string[] | null) ?? null,
      social: p.social ?? null,
      reviews_count: numOrNull(p.reviews_count),
    },
    review: {
      registrationStatus: str(r.registration_status),
      contractSigned: r.contract_signed === true,
      documentsPending: num(r.documents_pending),
      documentsRejected: num(r.documents_rejected),
      productsInReview: num(r.products_in_review),
      productsRejected: num(r.products_rejected),
      productsRemoved: num(r.products_removed),
      productsPaused: num(r.products_paused),
      premisesInReview: num(r.premises_in_review),
    },
    topProducts: ((raw.top_products ?? []) as Raw[]).map((x) => ({
      id: String(x.id),
      name: String(x.name ?? ""),
      priceValue: numOrNull(x.price_value),
      unit: str(x.unit),
      image: str(x.image),
      views: num(x.views),
      inquiries: num(x.inquiries),
    })),
    recentLeads: ((raw.recent_leads ?? []) as Raw[]).map((x) => ({
      id: String(x.id),
      title: String(x.title ?? ""),
      productName: String(x.product_name ?? x.title ?? ""),
      quantity: numOrNull(x.quantity),
      budgetMin: numOrNull(x.budget_min),
      budgetMax: numOrNull(x.budget_max),
      // A picture the buyer's browser wrote is shown only when it is this project's Storage (claude.md).
      image: ownStorageUrl(str(x.image)) ?? null,
      createdAt: String(x.created_at),
      direct: x.direct === true,
      quoted: x.quoted === true,
      quoteId: str(x.quote_id),
    })),
    recentChats: chatsFrom(raw.recent_chats),
  };
}

function chatsFrom(raw: unknown): SellerHomeChat[] {
  return ((raw ?? []) as Raw[]).map((x) => ({
    otherId: String(x.other_id),
    name: String(x.name ?? "User"),
    avatar: str(x.avatar),
    lastMessage: str(x.last_message),
    lastMessageAt: String(x.last_message_at),
    unread: num(x.unread),
  }));
}

/** Seller Home's three recent chats alone (seller_home_chats). */
export const sellerHomeChatsKey = (userId: string) => ["seller_home_chats", userId] as const;

export async function fetchSellerHomeChats(): Promise<SellerHomeChat[]> {
  const { data, error } = await supabase.rpc("seller_home_chats");
  if (error) throw error;
  return chatsFrom(data);
}

/** One call for the whole page. Throws on error (an error is never shown as zeros). */
export async function fetchSellerHome(): Promise<SellerHome | null> {
  const { data, error } = await supabase.rpc("seller_home_summary");
  if (error) throw error;
  return sellerHomeFrom((data as Raw | null) ?? null);
}
