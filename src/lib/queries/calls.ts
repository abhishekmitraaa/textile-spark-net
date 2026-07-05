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

export function useCallVendor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useCallback(
    async (vendorId: string, productContext?: string) => {
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
