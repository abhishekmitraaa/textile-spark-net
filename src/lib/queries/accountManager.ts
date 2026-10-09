import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// The vendor's account manager (subscriptions P9, 2026-10-09).
//
// Silver: the Cosora account team. Gold: a named manager once one is assigned (their first
// name and photo). VIP: the same, plus the sales concierge (requirements the manager picks for
// them) and a monthly success review. All where the `account_managers` switch lists the vendor.
//
// The vendor reads their own thread, call requests and notes from the tables (RLS: their own
// rows); every write is a function (am_send, am_mark_read, am_request_callback,
// am_cancel_callback). Staff write from Cosora-Admin's My vendors.
// ─────────────────────────────────────────────────────────────

export type AmLevel = "none" | "shared" | "named" | "vip";
export type CallWindow = "morning" | "afternoon" | "evening";

export const WINDOW_LABEL: Record<CallWindow, string> = {
  morning: "Morning, 10 am to 1 pm",
  afternoon: "Afternoon, 1 pm to 4 pm",
  evening: "Evening, 4 pm to 7 pm",
};

export interface MyAccountManager {
  available: boolean;
  level: AmLevel;
  manager: { name: string; photo: string | null } | null;
  unread: number;
  callback: { id: string; date: string; window: CallWindow; note: string | null } | null;
  concierge: boolean;
}

export function useMyAccountManager(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["account-manager", "me", vendorId],
    enabled: Boolean(vendorId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<MyAccountManager | null> => {
      const { data, error } = await supabase.rpc("my_account_manager");
      if (error) {
        if (error.code === "PGRST202") return null;   // before the P9 migration
        throw error;
      }
      return data as unknown as MyAccountManager;
    },
  });
}

export interface AmMessage { id: string; authorKind: "vendor" | "staff"; authorLabel: string; body: string; createdAt: string }

export function useAmMessages(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["account-manager", "messages", vendorId],
    enabled: Boolean(vendorId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<AmMessage[]> => {
      const { data, error } = await supabase.from("account_manager_messages")
        .select("id, author_kind, author_label, body, created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []).reverse().map((m) => ({
        id: m.id, authorKind: m.author_kind as AmMessage["authorKind"], authorLabel: m.author_label, body: m.body, createdAt: m.created_at,
      }));
    },
  });
}

export interface AmNote { id: string; kind: "concierge" | "success_review"; body: string; authorLabel: string; rfqId: string | null; period: string | null; createdAt: string }

export function useAmNotes(vendorId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["account-manager", "notes", vendorId],
    enabled: Boolean(vendorId) && enabled,
    queryFn: async (): Promise<AmNote[]> => {
      const { data, error } = await supabase.from("account_manager_notes")
        .select("id, kind, body, author_label, rfq_id, period, created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []).map((n) => ({
        id: n.id, kind: n.kind as AmNote["kind"], body: n.body, authorLabel: n.author_label, rfqId: n.rfq_id, period: n.period, createdAt: n.created_at,
      }));
    },
  });
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}
export const sendToAccountManager = (body: string) => call<string>("am_send", { p_body: body });
export const markAccountManagerRead = () => call<void>("am_mark_read");
export const requestCallback = (date: string, window: CallWindow, note?: string) =>
  call<string>("am_request_callback", { p_date: date, p_window: window, p_note: note || null });
export const cancelCallback = (id: string) => call<void>("am_cancel_callback", { p_id: id });

export function useAccountManagerRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["account-manager"] });
}
