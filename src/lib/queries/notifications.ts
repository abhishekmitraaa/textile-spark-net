import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useHubEvent, useHubLive } from "@/lib/realtimeHub";

// ─────────────────────────────────────────────────────────────
// Real notifications, from the `notifications` table (migration 20260802130000).
//
// Until this existed, `/notifications` and the header bell were driven entirely
// by a localStorage seed in `notificationsStore.ts` — no Supabase call was
// involved. Meanwhile moderation was doing things TO people (locking their
// chat, suspending their account) and telling them nothing outside whichever
// thread they happened to have open.
//
// Same shape as useConversations() / useCalls(): a module-private fetch, a
// React Query hook keyed by the user id and `enabled` on it, plus a realtime
// subscription in its own effect — the split useChatThread() already uses.
//
// Rows are written ONLY by SECURITY DEFINER functions. The table has no insert
// policy for any client role, so nothing here can create one; a client that
// could would be able to forge "Your account has been reinstated".
// ─────────────────────────────────────────────────────────────

/**
 * `kind` is deliberately un-CHECKed in SQL so a new kind is not a migration.
 * That means the client must treat it as an open set: KIND_META below is a
 * lookup with a fallback, never an exhaustive Record. A kind this build has
 * never heard of renders as a neutral system notice rather than crashing.
 */
export type NotificationKind =
  | "account_suspended"
  | "account_reinstated"
  | "chat_locked"
  | "chat_resumed"
  // Written by set_vendor_document_verified(), the only thing that may flip
  // vendor_documents.verified. Both are real and observed in production data —
  // this is not UI groundwork for something unwired.
  | "kyc_approved"
  | "kyc_rejected"
  // Written by admin_review_report_decide() when Cosora removes a review (2026-10-13).
  | "review_removed"
  // Product moderation (2026-10-07, released 2026-11-18): admin_product_remove / _flag / _reinstate.
  | "product_removed"
  | "product_flagged"
  | "product_reinstated";

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  read: boolean;
  created_at: string;
}

/** Newest first, a page at a time: the page shows this many and "Show older" adds as many again (SH-037). */
export const NOTIFICATION_PAGE = 100;

async function fetchNotifications(userId: string, limit: number): Promise<NotificationRow[]> {
  // No `.eq("profile_id", userId)` needed — notifications_select is
  // `profile_id = auth.uid()`, so RLS is the filter. Kept implicit rather than
  // duplicated: a filter that disagrees with the policy is a bug waiting to
  // happen, and the policy is the one that is enforced.
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, conversation_id, read, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export const notificationUnreadKey = (userId: string | undefined) => ["notification_unread", userId] as const;

export function useNotifications({ enabled = true, limit = NOTIFICATION_PAGE }: { enabled?: boolean; limit?: number } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const live = useHubLive();

  const query = useQuery({
    queryKey: ["notifications", userId, limit],
    queryFn: () => fetchNotifications(userId!, limit),
    enabled: Boolean(userId) && enabled,
    // A suspension notice arriving a minute ago has to be visible now. Same
    // reasoning as useContactGate's staleTime: moderation state must not be
    // served from a previous mount's cache. With the live-update hub on, every change is pushed, so a minute's
    // cache is safe (SH-031).
    staleTime: live ? 60_000 : 0,
  });

  // Live-update hub (switch live_updates_hub): one event per change of this account's notifications, however many
  // rows it touched, so "Read all" is one re-read (SH-036).
  useHubEvent("notifications", () => {
    if (!userId || !enabled) return;
    void qc.invalidateQueries({ queryKey: ["notifications", userId] });
  });

  // Realtime. `notifications` joined supabase_realtime in 20260802130000, so a
  // suspension applied from the admin panel reaches the bell without a reload —
  // which matters most for exactly the events that arrive while the user is
  // sitting on the page wondering why their composer went dead.
  //
  // The filter is belt AND braces: RLS already restricts what Realtime will
  // deliver, but filtering server-side means the socket does not carry other
  // people's rows to be discarded here.
  //
  // The topic carries a per-instance suffix, and that is NOT cosmetic.
  // `supabase.channel(name)` RETURNS AN EXISTING CHANNEL when one with that
  // topic is already open. Two components use this hook at once on
  // /notifications — DashboardHeader via useUnreadCount(), and the page itself —
  // so with a shared topic the second mount got the first mount's
  // already-subscribed channel and called .on() on it, which throws:
  //
  //   "cannot add `postgres_changes` callbacks for realtime:notifications:<uid>
  //    after `subscribe()`"
  //
  // That escaped the effect, killed the React tree, and rendered /notifications
  // as a blank page. The DB layer was fine the whole time, which is precisely
  // why it was invisible until the page was driven in a real browser.
  // React 18 StrictMode's double-invoked effects reach the same failure alone.
  const topic = useRef(`notifications:${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    // With the hub carrying this account's updates, no table subscription of its own (SH-030).
    if (!userId || !enabled || live) return;
    const channel = supabase
      .channel(topic.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${userId}`,
        },
        () => {
          // Invalidate rather than splice the payload in: an INSERT, a
          // mark-read UPDATE and a dismiss DELETE all land here, and re-reading
          // one indexed query is cheaper than three correct merge paths.
          void qc.invalidateQueries({ queryKey: ["notifications", userId] });
          void qc.invalidateQueries({ queryKey: notificationUnreadKey(userId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc, enabled, live]);

  return query;
}

/**
 * Unread count for the header bell.
 *
 * Rides on the SAME query as the page (identical key), so the bell and the list
 * can never disagree and opening /notifications costs no extra request. The
 * realtime subscription in useNotifications() is what makes the badge move on
 * its own.
 *
 * Dev-only sample rows are deliberately NOT counted: they are a design fixture
 * for the page, and a permanent phantom badge on every screen is worse than an
 * un-populated one.
 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const live = useHubLive();
  // Always a count of its own: every unread one, not the newest 100 (notifications_unread_idx; SH-037). With the hub
  // off, useNotifications() below only keeps the table subscription that refreshes it; with the hub on, hub events do.
  useNotifications({ enabled: !live, limit: 1 });
  const count = useQuery({
    queryKey: notificationUnreadKey(userId),
    queryFn: async () => {
      const { count: n, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId!)
        .eq("read", false);
      if (error) throw error;
      return n ?? 0;
    },
    enabled: Boolean(userId),
    staleTime: live ? 60_000 : 0,
  });
  useHubEvent("notifications", () => {
    if (!userId) return;
    void qc.invalidateQueries({ queryKey: notificationUnreadKey(userId) });
    // A notice is often a review decision (a listing, a document, a registration): Seller Home shows those states
    // (review M-66: it stayed stale until a reload). One summary read, and only when Seller Home's query is in use.
    void qc.invalidateQueries({ queryKey: ["vendor_dashboard", userId] });
    void qc.invalidateQueries({ queryKey: ["seller_registration", userId] });
  });
  return count.data ?? 0;
}

/**
 * Mark one notification read.
 *
 * notifications_mark_read carries both USING and WITH CHECK on
 * `profile_id = auth.uid()`, so a row belonging to someone else matches
 * nothing. An RLS-denied UPDATE does not raise — it matches zero rows and
 * PostgREST reports success — so `.select("id")` is what turns that silence
 * into something the caller can see.
 */
export async function markNotificationRead(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Mark every unread one read. Same policy, same zero-rows caveat. */
export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

/**
 * Dismiss. A real DELETE, not a hidden flag — the page has always had an X and
 * there is no "dismissed" column to set. notifications_dismiss scopes it to the
 * owner.
 */
export async function dismissNotification(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
