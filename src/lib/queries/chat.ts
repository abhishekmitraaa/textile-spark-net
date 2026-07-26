import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
 * Find-or-create the single conversation row for a pair of users.
 * Canonical (sorted) ordering guarantees one row per pair regardless of which
 * side opens the chat. Returns null if the upsert fails so callers can decide.
 */
export async function ensureConversation(me: string, otherId: string): Promise<string | null> {
  const [a, b] = [me, otherId].sort();
  const { data, error } = await supabase
    .from("conversations")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export function useChatThread(otherId: string | undefined) {
  const { user } = useAuth();
  const me = user?.id;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const convIdRef = useRef<string | null>(null);

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
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const convId = await ensureConversation(me, otherId);
      if (!convId || cancelled) { if (!cancelled) setReady(true); return; }
      convIdRef.current = convId;
      const conv = { id: convId };

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
          }
        )
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [me, otherId, mapMsg]);

  const sendText = useCallback(async (text: string, kind = "text") => {
    const body = text.trim();
    if (!body || !me || !convIdRef.current) return;
    await supabase.from("messages").insert({ conversation_id: convIdRef.current, sender_id: me, body, kind });
  }, [me]);

  return { messages, otherName, ready, sendText, canChat: Boolean(me && otherId) };
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
