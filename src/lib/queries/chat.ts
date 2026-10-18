import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { markConversationRead, chatUnreadKey } from "@/lib/queries/chatUnread";
import { shrinkImage } from "@/lib/shrinkImage";
import { errorMessage } from "@/lib/errorMessage";

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
  // A photo, PDF or voice note (kind image / file / audio): the file sits in the private
  // chat-attachments bucket; the thread asks for a short-lived link to show it (useAttachmentUrls).
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentBytes?: number | null;
  attachmentSeconds?: number | null;
  status?: "sent" | "delivered" | "read";
  // Set on structured quote messages (kind "quote_request" / "quote_reply") so
  // the thread can render them as tappable cards linking to the real record.
  rfqId?: string | null;
  quoteId?: string | null;
  /** When it was sent (ISO). Orders the thread and is the cursor for loading older messages. */
  createdAt?: string;
}

/**
 * Messages loaded at a time (2026-10-19). A thread opens on its newest page and loads older ones as the person
 * scrolls up; it used to download the whole history every time it opened.
 */
export const CHAT_PAGE_SIZE = 40;

/** Oldest first; a message already there is not added twice. */
function mergeMessages(prev: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

interface RawMessage {
  id: string; sender_id: string; body: string | null; kind: string; created_at: string;
  rfq_id?: string | null; quote_id?: string | null;
  attachment_path?: string | null; attachment_name?: string | null;
  attachment_bytes?: number | null; attachment_seconds?: number | null;
}

const THREAD_COLUMNS =
  "id, sender_id, body, kind, created_at, rfq_id, quote_id, attachment_path, attachment_name, attachment_bytes, attachment_seconds";

// ─────────────────────────────────────────────────────────────
// Chat files (2026-10-18; migration 20261018160000_chat_real_actions.sql). They used to be a text
// placeholder ("📷 Photo") and the other side saw an empty bubble. Now a photo, a PDF or a voice note is
// uploaded to the private chat-attachments bucket at {conversation}/{me}/{uuid}.{ext}, and the message
// points at it. Only the two people in the chat (and support, for reviews) can read it; the database
// checks the file exists in this chat's folder and that its type matches the message.
// ─────────────────────────────────────────────────────────────

export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";
/** The bucket's limit (10 MB). */
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Links to a chat file last this long; the thread asks again before they run out. */
const SIGNED_URL_SECONDS = 6 * 60 * 60;

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav",
};
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type AttachmentKind = "image" | "file" | "audio";

/** Readable size: "820 KB", "2.4 MB". */
export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "0:42" for a voice note's length. */
export function formatSeconds(n: number | null | undefined): string {
  const s = Math.max(0, Math.round(n ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Short-lived links for the chat files on screen. Asks once per path, in one request per batch, and again
 * when a link is near the end of its life (a thread left open overnight).
 */
export function useAttachmentUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, { url: string; at: number }>>({});
  const key = paths.join("|");
  useEffect(() => {
    const now = Date.now();
    const missing = paths.filter((p) => !urls[p] || now - urls[p].at > (SIGNED_URL_SECONDS - 300) * 1000);
    if (missing.length === 0) return;
    let cancelled = false;
    void supabase.storage.from(CHAT_ATTACHMENT_BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS).then(({ data }) => {
      if (cancelled || !data) return;
      setUrls((prev) => {
        const next = { ...prev };
        for (const d of data) if (d.path && d.signedUrl) next[d.path] = { url: d.signedUrl, at: Date.now() };
        return next;
      });
    });
    return () => { cancelled = true; };
    // `key` stands for `paths`; `urls` is read for freshness only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, v.url]));
}

/** The number behind a contact card, for the people in that chat. Throws with the server's reason. */
export async function fetchContactNumber(messageId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("chat_contact_number", { p_message_id: messageId });
  if (error) throw error;
  return data ?? null;
}

/** My own marks on a chat (2026-10-18): starred, archived, deleted for me up to `clearedAt`. */
export interface ChatMemberState { starred: boolean; archived: boolean; clearedAt: string | null }
/** A block either way stops messages both ways. */
export interface ChatBlockState { blockedByMe: boolean; blockedMe: boolean }

const NO_MEMBER_STATE: ChatMemberState = { starred: false, archived: false, clearedAt: null };
const NO_BLOCK: ChatBlockState = { blockedByMe: false, blockedMe: false };

function toBlockState(data: unknown): ChatBlockState {
  const b = (data ?? {}) as { blocked_by_me?: boolean; blocked_me?: boolean };
  return { blockedByMe: Boolean(b.blocked_by_me), blockedMe: Boolean(b.blocked_me) };
}

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
 *
 * `reportedReason` is the reporter's own words, stored verbatim on the review.
 * It is NOT conversation_reviews.reason_id — that is the admin's later verdict
 * from the curated chat_block_reasons table.
 */
export async function submitReport(
  conversationId: string,
  messageId: string | null,
  reportedReason?: string | null,
): Promise<boolean> {
  const { error } = await supabase.rpc("submit_report", {
    p_conversation_id: conversationId,
    p_message_id: messageId,
    p_reported_reason: reportedReason ?? null,
  });
  return !error;
}

export function useChatThread(otherId: string | undefined) {
  const { user } = useAuth();
  const me = user?.id;
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ConversationStatus>("active");
  // State as well as a ref: the ref is what the stable callbacks read, the
  // state is what the UI needs (ReportModal takes the id as a prop).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  // Mirrors `status` for the realtime callbacks, whose closures are made once.
  const statusRef = useRef<ConversationStatus>("active");
  // Star / archive / delete-for-me, and blocks (2026-10-18). Both are the signed-in person's own view.
  const [memberState, setMemberState] = useState<ChatMemberState>(NO_MEMBER_STATE);
  const [block, setBlock] = useState<ChatBlockState>(NO_BLOCK);
  // Older pages (2026-10-19): whether there is more history above, and the cursor's inputs for the callback.
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const messagesRef = useRef<ThreadMessage[]>([]);
  const clearedAtRef = useRef<string | null>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const applyStatus = useCallback((next: ConversationStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /**
   * Re-read this thread's moderation status. The realtime UPDATE subscription
   * below is now the primary signal; this stays as the belt-and-braces path —
   * called right after a successful report (so the lock shows without waiting
   * on the round trip) and after an RLS rejection on send (which means the DB
   * disagrees with what we think the status is, so we go and ask).
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
    attachmentPath: m.attachment_path ?? null,
    attachmentName: m.attachment_name ?? null,
    attachmentBytes: m.attachment_bytes ?? null,
    attachmentSeconds: m.attachment_seconds ?? null,
    createdAt: m.created_at,
  }), [me]);

  useEffect(() => {
    if (!me || !otherId || me === otherId) { setReady(false); return; }
    // Switching threads must not carry the previous one's lock over: default to
    // active and let the load below report the truth.
    convIdRef.current = null;
    setConversationId(null);
    applyStatus("active");
    setMemberState(NO_MEMBER_STATE);
    setBlock(NO_BLOCK);
    setMessages([]);
    setHasOlder(false);
    clearedAtRef.current = null;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const row = await upsertConversation(me, otherId);
      if (!row || cancelled) { if (!cancelled) setReady(true); return; }
      convIdRef.current = row.id;
      setConversationId(row.id);
      applyStatus(row.status);
      const conv = { id: row.id };

      // Display name for the other party (vendor brand → profile name → fallback), my own view of
      // the chat (star, archive, deleted-for-me) and whether either of us blocked the other.
      const [{ data: vp }, { data: pr }, { data: ms }, { data: bs }] = await Promise.all([
        supabase.from("vendor_profiles").select("brand_name").eq("id", otherId).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", otherId).maybeSingle(),
        supabase.from("conversation_member_state").select("starred_at, archived_at, cleared_at").eq("conversation_id", conv.id).maybeSingle(),
        supabase.rpc("chat_block_state", { p_other: otherId }),
      ]);
      if (cancelled) return;
      setOtherName(vp?.brand_name ?? pr?.full_name ?? null);
      const clearedAt = ms?.cleared_at ?? null;
      setMemberState({ starred: Boolean(ms?.starred_at), archived: Boolean(ms?.archived_at), clearedAt });
      setBlock(toBlockState(bs));

      clearedAtRef.current = clearedAt;

      // Join the live channel first, then read the newest page (2026-10-19). The history used to be read before
      // the channel joined, so a message sent in between was in neither. Now one sent while the page loads
      // arrives on the channel, and the merge keeps each message once.
      channel = supabase
        .channel(`thread:${conv.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` },
          (payload) => {
            const m = payload.new as RawMessage;
            setMessages((prev) => mergeMessages(prev, [mapMsg(m)]));
            // Arrived while the chat is open and on screen: it's read. In a background tab it stays
            // unread until the person comes back (the visibility listener below).
            if (m.sender_id !== me && document.visibilityState === "visible") void markConversationRead(conv.id, me, qc);
            // Backstop, kept deliberately. The conversations UPDATE below is the
            // primary signal, but the message that just arrived may be the very
            // thing that locked the thread — the case a user actually notices —
            // and measured end-to-end that push can lag the composer staying
            // live. One indexed PK read, and only while still unlocked.
            if (statusRef.current === "active") void refreshStatus();
          }
        )
        // The moderation lock, pushed. `conversations` joined the realtime
        // publication in 20260801154739; before that this had to be inferred by
        // re-reading the row whenever a message arrived, which could never see
        // an admin RESUMING a thread — no message accompanies that.
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conv.id}` },
          (payload) => {
            applyStatus((payload.new as { status?: ConversationStatus })?.status ?? "active");
          }
        )
        // The channel reports "joined" a moment before the database feed behind it is live; a message sent in
        // between would be in neither the page below nor the feed. When the feed says it's live, read the newest
        // page once more (the merge keeps each message once).
        .on("system", {}, (payload: { extension?: string; status?: string }) => {
          if (payload?.extension !== "postgres_changes" || payload?.status !== "ok") return;
          let catchUp = supabase.from("messages").select(THREAD_COLUMNS).eq("conversation_id", conv.id);
          if (clearedAt) catchUp = catchUp.gt("created_at", clearedAt);
          void catchUp
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(CHAT_PAGE_SIZE)
            .then(({ data }) => {
              if (!cancelled && data) setMessages((prev) => mergeMessages(prev, (data as RawMessage[]).map(mapMsg)));
            });
        });
      const joining = channel;
      await new Promise<void>((resolve) => {
        // Never wait more than 5 s: a thread that can't go live still shows its history.
        const timer = window.setTimeout(resolve, 5000);
        joining.subscribe((state) => {
          if (state === "SUBSCRIBED" || state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
            window.clearTimeout(timer);
            resolve();
          }
        });
      });
      if (cancelled) return;

      // The newest page. A chat deleted for me shows only what came after.
      let historyQuery = supabase
        .from("messages")
        .select(THREAD_COLUMNS)
        .eq("conversation_id", conv.id);
      if (clearedAt) historyQuery = historyQuery.gt("created_at", clearedAt);
      const { data: history } = await historyQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_PAGE_SIZE + 1);
      if (cancelled) return;
      const rows = (history ?? []) as RawMessage[];
      setHasOlder(rows.length > CHAT_PAGE_SIZE);
      setMessages((prev) => mergeMessages(prev, rows.slice(0, CHAT_PAGE_SIZE).map(mapMsg)));
      setReady(true);
      // Opened: what's on screen is read (the Chats badge and the list's count drop).
      if (document.visibilityState === "visible") void markConversationRead(conv.id, me, qc);
    })();

    // Back to a tab with the chat open: what came in meanwhile is now seen.
    const onVisible = () => {
      if (document.visibilityState === "visible" && convIdRef.current) void markConversationRead(convIdRef.current, me, qc);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [me, otherId, mapMsg, applyStatus, refreshStatus, qc]);

  /**
   * The page of messages before the oldest one shown (2026-10-19), for when the person scrolls up. Ordered by
   * (created_at, id) so two messages sent in the same instant are neither skipped nor shown twice.
   */
  const loadOlder = useCallback(async (): Promise<void> => {
    const convId = convIdRef.current;
    const oldest = messagesRef.current[0];
    if (!convId || !oldest?.createdAt || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      let q = supabase
        .from("messages")
        .select(THREAD_COLUMNS)
        .eq("conversation_id", convId)
        .or(`created_at.lt."${oldest.createdAt}",and(created_at.eq."${oldest.createdAt}",id.lt.${oldest.id})`);
      if (clearedAtRef.current) q = q.gt("created_at", clearedAtRef.current);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_PAGE_SIZE + 1);
      if (error) throw error;
      if (convIdRef.current !== convId) return;
      const rows = (data ?? []) as RawMessage[];
      setHasOlder(rows.length > CHAT_PAGE_SIZE);
      setMessages((prev) => mergeMessages(prev, rows.slice(0, CHAT_PAGE_SIZE).map(mapMsg)));
    } catch (e) {
      toast.error("Couldn't load earlier messages", { description: errorMessage(e) });
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [mapMsg]);

  /** The one place a refused message is explained. */
  const reportSendError = useCallback((error: { message?: string; code?: string }) => {
    const msg = error.message?.toLowerCase() ?? "";
    // check_message_blocklist() RAISEs; PostgREST passes the text through verbatim.
    if (msg.includes("message blocked")) {
      toast.error("Message not sent", {
        description: "It contains a term that isn't allowed on Cosora.",
      });
    } else if (msg.includes("chat blocked")) {
      // guard_message_insert(): a block either way stops messages both ways. The other side may have
      // just blocked: read the state again so the composer says so.
      toast.error("You can't send messages in this chat", { description: "One of you has blocked the other." });
      if (otherId) void supabase.rpc("chat_block_state", { p_other: otherId }).then(({ data }) => setBlock(toBlockState(data)));
    } else if (error.code === "42501") {
      // messages_insert additionally requires the conversation to be 'active'
      // and the sender's account_status to be 'active'. Both read as an RLS
      // violation, so the copy has to cover either cause.
      toast.error("You can't send messages in this chat", {
        description: "This chat is under review, or your account has been suspended.",
      });
      void refreshStatus();
    } else {
      toast.error("Message not sent", { description: errorMessage(error) });
    }
  }, [otherId, refreshStatus]);

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
    reportSendError(error);
    return false;
  }, [me, reportSendError]);

  /**
   * Upload a photo, a PDF or a voice note and send it. Photos are shrunk first (they're opened on
   * mobile data). Resolves true only when the message was written.
   */
  const sendAttachment = useCallback(async (file: File, kind: AttachmentKind, seconds?: number): Promise<boolean> => {
    const convId = convIdRef.current;
    if (!me || !convId) return false;

    let blob: Blob = file;
    let ext: string | undefined;
    let mime = file.type;
    try {
      if (kind === "image") {
        const shrunk = await shrinkImage(file, 1600);
        blob = shrunk.blob;
        mime = shrunk.blob.type || file.type;
        ext = IMAGE_EXT[mime];
        if (!ext) throw new Error("Send a JPEG, PNG or WebP picture.");
      } else if (kind === "file") {
        if (mime !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error("Documents are sent as PDF files.");
        mime = "application/pdf";
        ext = "pdf";
      } else {
        mime = mime.split(";")[0];
        ext = AUDIO_EXT[mime];
        if (!ext) throw new Error("This recording format can't be sent.");
      }
      if (blob.size > CHAT_ATTACHMENT_MAX_BYTES) throw new Error("Files can be up to 10 MB.");
    } catch (e) {
      toast.error("Couldn't send that", { description: errorMessage(e) });
      return false;
    }

    const path = `${convId}/${me}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .upload(path, blob, { contentType: mime, upsert: false });
    if (upErr) {
      // The upload policy refuses a locked or blocked chat before the message would.
      toast.error("Couldn't upload that", { description: errorMessage(upErr) });
      void refreshStatus();
      if (otherId) void supabase.rpc("chat_block_state", { p_other: otherId }).then(({ data }) => setBlock(toBlockState(data)));
      return false;
    }

    const name = kind === "audio" ? null : file.name.slice(0, 200);
    const body = kind === "image" ? "📷 Photo" : kind === "file" ? `📎 ${(name ?? "Document").slice(0, 120)}` : "🎤 Voice message";
    const { error } = await supabase.from("messages").insert({
      conversation_id: convId,
      sender_id: me,
      body,
      kind,
      attachment_path: path,
      attachment_name: name,
      attachment_seconds: kind === "audio" && seconds != null ? Math.min(600, Math.max(0, Math.round(seconds))) : null,
    });
    if (!error) return true;
    reportSendError(error);
    return false;
  }, [me, otherId, refreshStatus, reportSendError]);

  /** Send my contact card. The number stays on the server; the other person taps to reveal it. */
  const shareContact = useCallback(async (): Promise<boolean> => {
    const convId = convIdRef.current;
    if (!me || !convId) return false;
    const { error } = await supabase.rpc("share_chat_contact", { p_conversation_id: convId });
    if (!error) return true;
    if (error.code === "P0002") {
      toast.error("No number to share", { description: "Your account has no sign-in mobile number." });
    } else {
      reportSendError(error);
    }
    return false;
  }, [me, reportSendError]);

  /** Star, archive or delete-for-me. Resolves true when saved. */
  const updateState = useCallback(async (patch: { starred?: boolean; archived?: boolean; clear?: boolean }): Promise<boolean> => {
    const convId = convIdRef.current;
    if (!me || !convId) return false;
    const { data, error } = await supabase.rpc("chat_set_state", {
      p_conversation_id: convId,
      p_starred: patch.starred ?? null,
      p_archived: patch.archived ?? null,
      p_clear: patch.clear ?? false,
    });
    if (error) {
      toast.error("Couldn't update this chat", { description: errorMessage(error) });
      return false;
    }
    const d = (data ?? {}) as { starred?: boolean; archived?: boolean; cleared_at?: string | null };
    setMemberState({ starred: Boolean(d.starred), archived: Boolean(d.archived), clearedAt: d.cleared_at ?? null });
    if (patch.clear) { setMessages([]); setHasOlder(false); clearedAtRef.current = d.cleared_at ?? null; }
    void qc.invalidateQueries({ queryKey: ["conversations", me] });
    if (patch.clear) void qc.invalidateQueries({ queryKey: chatUnreadKey(me) });
    return true;
  }, [me, qc]);

  /** Block or unblock the other person. Resolves true when saved. */
  const setBlocked = useCallback(async (next: boolean): Promise<boolean> => {
    if (!me || !otherId) return false;
    const { data, error } = await supabase.rpc("chat_set_block", { p_other: otherId, p_block: next });
    if (error) {
      toast.error(next ? "Couldn't block" : "Couldn't unblock", { description: errorMessage(error) });
      return false;
    }
    setBlock(toBlockState(data));
    return true;
  }, [me, otherId]);

  /** Mark what's here read now (the menu item). Resolves true when saved. */
  const markRead = useCallback(async (): Promise<boolean> => {
    const convId = convIdRef.current;
    if (!me || !convId) return false;
    const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: convId });
    if (error) {
      toast.error("Couldn't mark this chat read", { description: errorMessage(error) });
      return false;
    }
    void qc.invalidateQueries({ queryKey: chatUnreadKey(me) });
    return true;
  }, [me, qc]);

  return {
    messages,
    hasOlder,
    loadingOlder,
    loadOlder,
    otherName,
    ready,
    sendText,
    sendAttachment,
    shareContact,
    canChat: Boolean(me && otherId),
    conversationId,
    status,
    underReview: status === "under_review",
    refreshStatus,
    memberState,
    updateState,
    block,
    blocked: block.blockedByMe || block.blockedMe,
    setBlocked,
    markRead,
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
  /** My own marks on the chat (2026-10-18). */
  starred: boolean;
  archived: boolean;
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
  const [{ data, error }, { data: states, error: stateError }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user_a, user_b, last_message, last_message_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("last_message_at", { ascending: false }),
    // My own view of each chat: starred, archived, deleted-for-me (the policy returns only mine).
    supabase.from("conversation_member_state").select("conversation_id, starred_at, archived_at, cleared_at").eq("user_id", userId),
  ]);
  if (error) throw error;
  if (stateError) throw stateError;
  const stateOf = new Map((states ?? []).map((s) => [s.conversation_id, s]));
  // A chat deleted for me stays out of the list until a newer message arrives.
  const rows = ((data ?? []) as RawConv[]).filter((c) => {
    const cleared = stateOf.get(c.id)?.cleared_at;
    return !cleared || (c.last_message_at != null && new Date(c.last_message_at) > new Date(cleared));
  });

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
    const state = stateOf.get(c.id);
    return {
      id: otherId,
      name: m?.name ?? "User",
      avatar: m?.avatar ?? null,
      online: false,
      lastMessage: c.last_message ?? "Start the conversation",
      timestamp: relTime(c.last_message_at),
      unread: 0,
      rfqProduct: "Chat",
      starred: Boolean(state?.starred_at),
      archived: Boolean(state?.archived_at),
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
