import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// Realtime 1:1 chat thread.
//
// A conversation is the canonical (user_a < user_b) pair of the signed-in
// user and the other party. This hook find-or-creates it, loads history,
// then subscribes to Supabase Realtime so new messages (from either side)
// stream in live. Sending just inserts a row — the realtime feed echoes it
// back to everyone, including the sender, so there's a single source of truth.
// ─────────────────────────────────────────────────────────────

export interface ThreadMessage {
  id: string;
  sender: "user" | "vendor"; // "user" = me, "vendor" = the other party
  text: string;
  time: string;
  kind: string;
  // Present on the existing thread UI; unused by realtime text messages.
  imageUrl?: string;
  fileName?: string;
  status?: "sent" | "delivered" | "read";
  // Set on structured quote messages (kind "quote_request" / "quote_reply") so
  // the thread can render them as tappable cards linking to the real record.
  rfqId?: string | null;
  quoteId?: string | null;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

interface RawMessage { id: string; sender_id: string; body: string | null; kind: string; created_at: string; rfq_id?: string | null; quote_id?: string | null }

/**
 * Moderation state of a thread. 'under_review' means the regex flag trigger
 * fired or somebody reported the chat; the DB refuses new messages until an
 * admin resumes it (see migration 20260801095820).
 */
export type ConversationStatus = "active" | "under_review";

interface ConversationRow { id: string; status: ConversationStatus }

async function upsertConversation(me: string, otherId: string): Promise<ConversationRow | null> {
  const [a, b] = [me, otherId].sort();
  const { data, error } = await supabase
    .from("conversations")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" })
    .select("id, status")
    .single();
  if (error || !data) return null;
  return { id: data.id, status: (data.status as ConversationStatus) ?? "active" };
}

/**
 * Find-or-create the single conversation row for a pair of users.
 * Canonical (sorted) ordering guarantees one row per pair regardless of which
 * side opens the chat. Returns null if the upsert fails so callers can decide.
 */
export async function ensureConversation(me: string, otherId: string): Promise<string | null> {
  return (await upsertConversation(me, otherId))?.id ?? null;
}

/**
 * Participant-initiated report. Files a pending `conversation_reviews` row and
 * locks the thread. SECURITY DEFINER on the DB side, gated on membership.
 * Resolves true only when the row actually landed.
 */
export async function submitReport(conversationId: string, messageId: string | null): Promise<boolean> {
  const { error } = await supabase.rpc("submit_report", {
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
  return !error;
}

export function useChatThread(otherId: string | undefined) {
  const { user } = useAuth();
  const me = user?.id;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ConversationStatus>("active");
  // State as well as a ref: the ref is what the stable callbacks read, the
  // state is what the UI needs (ReportModal takes the id as a prop).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  // Mirrors `status` for the realtime callback, whose closure is created once.
  const statusRef = useRef<ConversationStatus>("active");

  const applyStatus = useCallback((next: ConversationStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /**
   * Re-read this thread's moderation status. `conversations` is NOT in the
   * realtime publication (only `messages` is), so the lock cannot be pushed to
   * us — we pull it on the events that can cause it: a new message arriving
   * (either side's message may trip the regex flag trigger) and a successful
   * report. Callers skip this once already locked; only an admin can unlock,
   * and that is not observable from here either way.
   */
  const refreshStatus = useCallback(async () => {
    const id = convIdRef.current;
    if (!id) return;
    const { data } = await supabase.from("conversations").select("status").eq("id", id).maybeSingle();
    applyStatus((data?.status as ConversationStatus) ?? "active");
  }, [applyStatus]);

  const mapMsg = useCallback((m: RawMessage): ThreadMessage => ({
    id: m.id,
    sender: m.sender_id === me ? "user" : "vendor",
    text: m.body ?? "",
    time: fmtTime(m.created_at),
    kind: m.kind,
    rfqId: m.rfq_id ?? null,
    quoteId: m.quote_id ?? null,
  }), [me]);

  useEffect(() => {
    if (!me || !otherId || me === otherId) { setReady(false); return; }
    // Switching threads must not carry the previous one's lock over: default to
    // active and let the load below report the truth.
    convIdRef.current = null;
    setConversationId(null);
    applyStatus("active");
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const row = await upsertConversation(me, otherId);
      if (!row || cancelled) { if (!cancelled) setReady(true); return; }
      convIdRef.current = row.id;
      setConversationId(row.id);
      applyStatus(row.status);
      const conv = { id: row.id };

      // Display name for the other party (vendor brand → profile name → fallback).
      const [{ data: vp }, { data: pr }] = await Promise.all([
        supabase.from("vendor_profiles").select("brand_name").eq("id", otherId).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", otherId).maybeSingle(),
      ]);
      if (!cancelled) setOtherName(vp?.brand_name ?? pr?.full_name ?? null);

      const { data: history } = await supabase
        .from("messages")
        .select("id, sender_id, body, kind, created_at, rfq_id, quote_id")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setMessages(((history ?? []) as RawMessage[]).map(mapMsg));
      setReady(true);

      channel = supabase
        .channel(`messages:${conv.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` },
          (payload) => {
            const m = payload.new as RawMessage;
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, mapMsg(m)]));
            // Any message — mine or theirs — can trip the regex flag trigger and
            // lock the thread. This echo is the only push signal we get.
            if (statusRef.current === "active") void refreshStatus();
          }
        )
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [me, otherId, mapMsg, applyStatus, refreshStatus]);

  /**
   * Insert a message. Resolves true only when the row was actually written, so
   * the caller can keep the draft on failure. Nothing is added to local state
   * here either way — the realtime echo is the single source of truth, which is
   * what makes a rejected message impossible to show as sent.
   */
  const sendText = useCallback(async (text: string, kind = "text"): Promise<boolean> => {
    const body = text.trim();
    if (!body || !me || !convIdRef.current) return false;

    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: convIdRef.current, sender_id: me, body, kind });
    if (!error) return true;

    // check_message_blocklist() RAISEs; PostgREST passes the text through verbatim.
    if (error.message?.toLowerCase().includes("message blocked")) {
      toast.error("Message not sent", {
        description: "It contains a term that isn't allowed on Cosora.",
      });
    } else if (error.code === "42501") {
      // messages_insert additionally requires the conversation to be 'active'
      // and the sender's account_status to be 'active'. Both read as an RLS
      // violation, so the copy has to cover either cause.
      toast.error("You can't send messages in this chat", {
        description: "This chat is under review, or your account has been suspended.",
      });
      void refreshStatus();
    } else {
      toast.error("Message not sent", { description: error.message });
    }
    return false;
  }, [me, refreshStatus]);

  return {
    messages,
    otherName,
    ready,
    sendText,
    canChat: Boolean(me && otherId),
    conversationId,
    status,
    underReview: status === "under_review",
    refreshStatus,
  };
}

// ─────────────────────────────────────────────────────────────
// Conversations hub — the signed-in user's real chat threads, newest first.
// `id` is the OTHER participant's user id so opening a row routes straight to
// /chats/:id (the thread find-or-creates on that id).
// ─────────────────────────────────────────────────────────────

export interface ChatSummary {
  id: string;
  name: string;
  avatar: string | null;
  online: boolean;
  lastMessage: string;
  timestamp: string;
  unread: number;
  rfqProduct: string;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  return `${day}d`;
}

interface RawConv { id: string; user_a: string; user_b: string; last_message: string | null; last_message_at: string | null }

async function fetchConversations(userId: string): Promise<ChatSummary[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, user_a, user_b, last_message, last_message_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawConv[];

  const others = Array.from(new Set(rows.map((c) => (c.user_a === userId ? c.user_b : c.user_a))));
  const meta = new Map<string, { name: string; avatar: string | null }>();
  if (others.length) {
    const [{ data: profiles }, { data: vendors }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").in("id", others),
      supabase.from("vendor_profiles").select("id, brand_name").in("id", others),
    ]);
    const vmap = new Map((vendors ?? []).map((v) => [v.id, v.brand_name]));
    for (const p of profiles ?? []) {
      meta.set(p.id, { name: vmap.get(p.id) ?? p.full_name ?? "User", avatar: p.avatar_url });
    }
  }

  return rows.map((c) => {
    const otherId = c.user_a === userId ? c.user_b : c.user_a;
    const m = meta.get(otherId);
    return {
      id: otherId,
      name: m?.name ?? "User",
      avatar: m?.avatar ?? null,
      online: false,
      lastMessage: c.last_message ?? "Start the conversation",
      timestamp: relTime(c.last_message_at),
      unread: 0,
      rfqProduct: "Chat",
    };
  });
}

export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => fetchConversations(user!.id),
    enabled: Boolean(user?.id),
  });
}
