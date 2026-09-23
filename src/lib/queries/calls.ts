import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { openCallNumber } from "@/lib/callStore";
import { errorMessage } from "@/lib/errorMessage";
import type { CallRecord } from "@/lib/chatData";

// ─────────────────────────────────────────────────────────────
// Click-to-call.
//
// `useCallVendor()` returns a handler that opens the phone's native dialer
// pre-filled with the vendor's number (via a `tel:` URL — a web app cannot
// auto-place a call), logs the outgoing call through log_call() for signed-in
// buyers, and falls back to opening the chat thread when the vendor has no number.
//
// `useCalls()` reads the signed-in buyer's real call history, grouped
// Today / Yesterday / <date> for the Messages hub Calls tab. `useCallCount()`
// counts the same rows for the Profile page's Calls stat.
// ─────────────────────────────────────────────────────────────

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// Place a call: on mobile open the native dialer; on desktop (where tel: is a
// no-op) surface the number on screen. Shared by every call site.
export function placeCall(name: string, phone: string) {
  if (isMobile()) {
    window.location.href = telHref(phone);
  } else {
    openCallNumber({ name, phone });
  }
}

// Deterministic demo number for entities that aren't real DB vendors
// (freelancers / service vendors are static seed data with no stored phone).
export function demoPhone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const first = 9 - (h % 3); // 7, 8 or 9
  const rest = String(h).padStart(9, "0").slice(0, 9);
  const d = `${first}${rest}`;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

// ─────────────────────────────────────────────────────────────
// Moderation gate for click-to-call.
//
// Locking a chat is pointless if either party can just phone the other — the
// number is one tap away on the vendor profile. So the same three facts that
// stop a message stop a call, checked HERE rather than at each call site:
// VendorProfile alone has two "Call Now" buttons, and the next surface to add
// one would silently miss the check.
//
// Unlike messaging, placing a call is a `tel:` URL, not a write, so no policy can
// stop the dial itself. This is a client-side gate over data the DB owns, which
// is why it re-reads that data on every attempt rather than trusting anything
// cached. What the database CAN guard is the number: a buyer's phone is only
// released by call_buyer_contact(), which applies these same rules server-side
// (useCallBuyer below). A vendor's business phone is public by design (R-18 in
// scripts/contact-gate-check.mjs), so for useCallVendor this gate stays advisory.
// ─────────────────────────────────────────────────────────────

// Why the gate said no. The gate reports the REASON and each surface writes its
// own sentence: "calling is paused" is the right thing to tell someone who
// tapped Call, and the wrong thing to tell someone reading a contact card.
export type CallBlockReason = "caller_suspended" | "target_suspended" | "under_review";

// Null means "go ahead". A nullable value rather than an { ok } discriminated
// union on purpose: this project compiles with `strict: false`, so
// strictNullChecks is off and TS will not narrow a boolean-literal discriminant
// — `if (!gate.ok)` leaves the union unnarrowed and every field access errors.
export type CallBlock = CallBlockReason | null;

export interface BlockCopy { title: string; description?: string }

// Someone tried to place a call. Wording unchanged from before the reason-code
// refactor — this is what the Call Now button has always said.
const CALL_BLOCK_COPY: Record<CallBlockReason, BlockCopy> = {
  caller_suspended: { title: "Calling is unavailable", description: "Your account is suspended. Contact support to resolve this." },
  target_suspended: { title: "Calling is unavailable", description: "This account is currently suspended." },
  under_review: { title: "This chat is under review — calling is paused", description: "Our team will follow up." },
};

// Someone is looking at a contact card. Same three reasons, phrased as "why
// can't I see this" rather than "why can't I call".
const CONTACT_BLOCK_COPY: Record<CallBlockReason, BlockCopy> = {
  caller_suspended: { title: "Contact details aren't available", description: "Your account is suspended. Contact support to resolve this." },
  target_suspended: { title: "Contact details aren't available", description: "This account is currently suspended." },
  under_review: { title: "This chat is under review", description: "Contact details aren't available right now. Our team will follow up." },
};

export async function callGate(meId: string | undefined, otherId: string): Promise<CallBlock> {
  // Both account statuses in one round trip. profiles_select is `true` and
  // account_status is client-selectable, so the other party's status is
  // readable; their email and phone are not (MPF-3).
  const ids = meId && meId !== otherId ? [meId, otherId] : [otherId];
  const { data: rows } = await supabase.from("profiles").select("id, account_status").in("id", ids);
  const statusOf = (id: string) => rows?.find((r) => r.id === id)?.account_status ?? "active";

  if (meId && statusOf(meId) === "suspended") {
    return "caller_suspended";
  }
  if (statusOf(otherId) === "suspended") {
    return "target_suspended";
  }

  // A plain SELECT on the canonical (sorted) pair — deliberately NOT
  // ensureConversation(), which would CREATE a row as a side effect of merely
  // checking whether calling is allowed.
  if (meId) {
    const [a, b] = [meId, otherId].sort();
    const { data: conv } = await supabase
      .from("conversations")
      .select("status")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (conv?.status === "under_review") {
      return "under_review";
    }
  }

  return null;
}

/**
 * The same gate, as reactive state, for surfaces that must decide what to
 * RENDER rather than what to do on click — a phone number printed on the page
 * is exactly as much of a leak as a dial button, so both consult one rule.
 *
 * `loading` starts true and matters: a caller that renders real contact details
 * while this resolves would flash the number before hiding it, which defeats
 * the point entirely. Callers must render nothing (or a skeleton) until false.
 *
 * React Query, matching useCalls() below rather than a bespoke useEffect.
 *
 * Returns copy already resolved for the contact-card context, not the raw
 * reason: consumers stay dumb renderers and never have to know the reason codes
 * exist, which keeps the wording for a given reason in one place instead of
 * drifting across every page that grows a contact card.
 */
export function useContactGate(otherId: string | undefined): { loading: boolean; blocked: BlockCopy | null } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["contact-gate", user?.id ?? null, otherId ?? null],
    queryFn: () => callGate(user?.id, otherId as string),
    enabled: Boolean(otherId),
    // Moderation state is the kind of thing that must not be served stale from
    // a previous mount — a lock applied a minute ago has to be respected now.
    staleTime: 0,
  });

  return {
    loading: Boolean(otherId) && query.isPending,
    blocked: query.data ? CONTACT_BLOCK_COPY[query.data] : null,
  };
}

export function useCallVendor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useCallback(
    async (vendorId: string, productContext?: string) => {
      // Runs before the phone lookup on purpose: a blocked attempt should not
      // reveal a number, log a `calls` row, or fall back to opening the chat.
      const blocked = await callGate(user?.id, vendorId);
      if (blocked) {
        const copy = CALL_BLOCK_COPY[blocked];
        toast.error(copy.title, copy.description ? { description: copy.description } : undefined);
        return;
      }

      // Look up the vendor's number + brand (only fires on click, not per render).
      const { data: v } = await supabase
        .from("vendor_profiles")
        .select("phone, brand_name")
        .eq("id", vendorId)
        .maybeSingle();
      const phone = v?.phone ?? null;

      if (!phone) {
        // Keep Call Now useful: open the chat thread instead.
        toast("No phone number on file", { description: "Opening chat instead." });
        navigate(`/chats/${vendorId}`);
        return;
      }

      // Log the outgoing call through log_call() (MPF-2), the only write path to
      // `calls`: clients hold no INSERT/UPDATE/DELETE on it. The server sets
      // buyer_id, direction and created_at, checks the caller is active and the
      // target is a vendor, and rate-limits. Logging is best-effort on purpose:
      // the dial below goes ahead either way, and a refused or rate-limited log
      // only means this tap isn't counted. Signed-in only.
      if (user) {
        void supabase
          .rpc("log_call", { p_vendor_id: vendorId, p_product_context: productContext ?? null })
          .then(({ data, error }) => {
            if (!error && (data as { status?: string } | null)?.status === "logged") {
              void qc.invalidateQueries({ queryKey: ["calls", user.id] });
            }
          });
      }

      // Mobile → dial; desktop → show the number on screen.
      placeCall(v?.brand_name ?? "vendor", phone);
    },
    [user, navigate, qc],
  );
}

// The mirror image of useCallVendor, for a vendor ringing the buyer behind an
// RFQ. Buyers have no vendor_profiles row, so the number is profiles.phone.
//
// That column is not client-selectable (MPF-3): the number comes from
// call_buyer_contact(), which applies callGate's three rules ON THE SERVER, plus
// the relationship this button implies (the caller has quoted on one of this
// buyer's RFQs). Unlike a vendor's public business number, a buyer's phone is
// private, so the gate here is enforced rather than advisory. A refusal is a
// 42501 whose message is the reason code; the copy is the same as callGate's.
//
// Deliberately does NOT log to `calls`: the only write path, log_call(), records
// a call BY the signed-in user TO a vendor (buyer_id = auth.uid()), and here
// auth.uid() is the *vendor*. Logging vendor-initiated calls needs its own
// server function, which is out of scope for this hook.
const NO_RFQ_RELATIONSHIP_COPY: BlockCopy = {
  title: "Calling is unavailable",
  description: "You can call a buyer after you've quoted on one of their requests.",
};

export function useCallBuyer() {
  const navigate = useNavigate();

  return useCallback(
    async (buyerId: string) => {
      if (!buyerId) {
        toast("Buyer unavailable", { description: "This quote has no buyer on file." });
        return;
      }

      // Only fires on click, not per render.
      const { data: rows, error } = await supabase.rpc("call_buyer_contact", { p_buyer_id: buyerId });
      if (error) {
        const copy =
          Object.prototype.hasOwnProperty.call(CALL_BLOCK_COPY, error.message)
            ? CALL_BLOCK_COPY[error.message as CallBlockReason]
            : error.message === "no_rfq_relationship"
              ? NO_RFQ_RELATIONSHIP_COPY
              : { title: "Couldn't get the buyer's number", description: errorMessage(error) };
        toast.error(copy.title, copy.description ? { description: copy.description } : undefined);
        return;
      }
      const p = rows?.[0];
      const phone = p?.phone ?? null;

      if (!phone) {
        // Same fallback as useCallVendor: keep the button useful.
        toast("No phone number on file", { description: "Opening chat instead." });
        navigate(`/chats/${buyerId}`);
        return;
      }

      placeCall(p?.full_name ?? "buyer", phone);
    },
    [navigate],
  );
}

// ─────────────────────────────────────────────────────────────

function dayGroup(d: Date): string {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (day === startToday) return "Today";
  if (day === startToday - 86_400_000) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface RawCall { id: string; vendor_id: string; direction: string; product_context: string | null; created_at: string }

async function fetchCalls(userId: string): Promise<{ group: string; calls: CallRecord[] }[]> {
  const { data, error } = await supabase
    .from("calls")
    .select("id, vendor_id, direction, product_context, created_at")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawCall[];

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const meta = new Map<string, { name: string; avatar: string | null }>();
  if (vendorIds.length) {
    const [{ data: vendors }, { data: profiles }] = await Promise.all([
      supabase.from("vendor_profiles").select("id, brand_name").in("id", vendorIds),
      supabase.from("profiles").select("id, avatar_url").in("id", vendorIds),
    ]);
    const vmap = new Map((vendors ?? []).map((x) => [x.id, x.brand_name]));
    const amap = new Map((profiles ?? []).map((x) => [x.id, x.avatar_url]));
    for (const id of vendorIds) meta.set(id, { name: vmap.get(id) ?? "Vendor", avatar: amap.get(id) ?? null });
  }

  // Rows are already newest-first; group while preserving that order.
  const order: string[] = [];
  const byGroup = new Map<string, CallRecord[]>();
  for (const r of rows) {
    const created = new Date(r.created_at);
    const g = dayGroup(created);
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    const m = meta.get(r.vendor_id);
    byGroup.get(g)!.push({
      id: r.id,
      vendorId: r.vendor_id,
      name: m?.name ?? "Vendor",
      avatar: m?.avatar ?? null,
      direction: (r.direction as CallRecord["direction"]) ?? "outgoing",
      time: created.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      group: g,
      rfqProduct: r.product_context ?? "Enquiry",
    });
  }
  return order.map((g) => ({ group: g, calls: byGroup.get(g)! }));
}

export function useCalls() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["calls", user?.id],
    queryFn: () => fetchCalls(user!.id),
    enabled: Boolean(user?.id),
  });
}

// The buyer's own call count, so it always matches the Calls tab list above.
// Filtered on buyer_id explicitly, NOT left to RLS (the same rule as the Quotes
// and Chats counts in useProfileStats): calls_select also admits
// `vendor_id = auth.uid()` and `is_admin()`, so a bare count would add calls
// made TO a vendor and, for an admin, every call on the platform. Keyed under
// ["calls", userId] so the invalidation in useCallVendor refreshes it the
// moment a call is logged.
export function useCallCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["calls", user?.id, "count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .eq("buyer_id", user!.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: Boolean(user?.id),
  });
}
