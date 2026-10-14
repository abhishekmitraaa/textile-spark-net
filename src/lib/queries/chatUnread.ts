import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// UNREAD CHAT MESSAGES (2026-10-14; migration 20261014170000_chat_unread.sql).
//
// The bottom bar's Chats badge was a hardcoded 3, and the chat list showed every thread as read.
// chat_unread_counts() returns, for the signed-in person, each chat with messages from the other
// person newer than what they've read; mark_conversation_read() moves that line when a chat is open.
//
// LIVE: every new message updates its conversation row (bump_conversation), and `conversations` is in
// the realtime publication. Each user listens to their own rows only (user_a = me, user_b = me), so a
// message reaches two subscribers, not everyone; on any change the counts are read again (one indexed
// call), rather than guessing from the payload.
// ─────────────────────────────────────────────────────────────

export interface ChatUnread {
  /** Unread messages across every chat. */
  total: number;
  /** Unread messages per chat, keyed by the OTHER person's id (the chat list's row id). */
  byOther: Record<string, number>;
}

const EMPTY: ChatUnread = { total: 0, byOther: {} };

export const chatUnreadKey = (userId: string | undefined) => ["chat-unread", userId] as const;

export function useChatUnread(): ChatUnread {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chatUnreadKey(userId),
    queryFn: async (): Promise<ChatUnread> => {
      const { data, error } = await supabase.rpc("chat_unread_counts");
      if (error) throw error;
      const byOther: Record<string, number> = {};
      let total = 0;
      for (const row of data ?? []) {
        byOther[row.other_id] = (byOther[row.other_id] ?? 0) + row.unread;
        total += row.unread;
      }
      return { total, byOther };
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  // A unique topic per mount: supabase.channel(name) hands back an already-subscribed channel for a name
  // in use, and adding listeners to it throws (see useNotifications).
  const topic = useRef(`chat-unread:${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: chatUnreadKey(userId) });
    const channel = supabase
      .channel(topic.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_a=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_b=eq.${userId}` }, refresh)
      // Once listening, read again: a message that came in between the first read and the subscription
      // joining would otherwise wait for the next change to show.
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return useMemo(() => (userId ? query.data ?? EMPTY : EMPTY), [userId, query.data]);
}

/** The badge's text: nothing for 0, "99+" past 99. */
export function badgeLabel(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

/**
 * Marks a chat read up to the newest message from the other person, then refreshes the counts.
 * Best effort: a badge that's briefly wrong isn't worth an error message.
 */
export async function markConversationRead(conversationId: string, userId: string | undefined, qc: ReturnType<typeof useQueryClient>) {
  const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (!error) void qc.invalidateQueries({ queryKey: chatUnreadKey(userId) });
}
