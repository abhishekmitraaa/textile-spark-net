import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { openCallNumber } from "@/lib/callStore";
import type { CallRecord } from "@/lib/chatData";

// ─────────────────────────────────────────────────────────────
// Click-to-call.
//
// `useCallVendor()` returns a handler that opens the phone's native dialer
// pre-filled with the vendor's number (via a `tel:` URL — a web app cannot
// auto-place a call), logs the outgoing call to `calls` for signed-in buyers,
// and falls back to opening the chat thread when the vendor has no number.
//
// `useCalls()` reads the signed-in buyer's real call history, grouped
// Today / Yesterday / <date> for the Messages hub Calls tab.
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
// Unlike messaging, there is no database-level enforcement possible: placing a
// call is a `tel:` URL, not a write. This is a client-side gate over data the
// DB owns, which is why it re-reads that data on every attempt rather than
// trusting anything cached.
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
  // Both account statuses in one round trip. profiles_select is `true`, so the
  // other party's row is readable.
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

      // Log the outgoing call (RLS requires buyer_id = auth.uid(), so signed-in only).
      if (user) {
        void supabase
          .from("calls")
          .insert({ buyer_id: user.id, vendor_id: vendorId, direction: "outgoing", product_context: productContext ?? null })
          .then(() => qc.invalidateQueries({ queryKey: ["calls", user.id] }));
      }

      // Mobile → dial; desktop → show the number on screen.
      placeCall(v?.brand_name ?? "vendor", phone);
    },
    [user, navigate, qc],
  );
}

// The mirror image of useCallVendor, for a vendor ringing the buyer behind an
// RFQ. Buyers have no vendor_profiles row, so the number comes from `profiles`.
//
// Deliberately does NOT log to `calls`: that table's insert policy is
// `buyer_id = auth.uid()`, and here auth.uid() is the *vendor*, so the write
// would be rejected by RLS. Logging vendor-initiated calls needs a policy
// change, which is out of scope for this hook.
export function useCallBuyer() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    async (buyerId: string) => {
      if (!buyerId) {
        toast("Buyer unavailable", { description: "This quote has no buyer on file." });
        return;
      }

      // Same gate as useCallVendor — a locked thread has to be locked in both
      // directions, and a suspended vendor must not be able to ring the buyer.
      const blocked = await callGate(user?.id, buyerId);
      if (blocked) {
        const copy = CALL_BLOCK_COPY[blocked];
        toast.error(copy.title, copy.description ? { description: copy.description } : undefined);
        return;
      }

      // Only fires on click, not per render.
      const { data: p } = await supabase
        .from("profiles")
        .select("phone, full_name")
        .eq("id", buyerId)
        .maybeSingle();
      const phone = p?.phone ?? null;

      if (!phone) {
        // Same fallback as useCallVendor: keep the button useful.
        toast("No phone number on file", { description: "Opening chat instead." });
        navigate(`/chats/${buyerId}`);
        return;
      }

      placeCall(p?.full_name ?? "buyer", phone);
    },
    [user, navigate],
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
