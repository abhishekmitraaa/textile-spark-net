import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, ShieldAlert, MessageSquare } from "lucide-react";
import { useChatThread } from "@/lib/queries/chat";
import { useAuth } from "@/contexts/AuthContext";
import type { VendorQuote } from "@/lib/quotesData";

// ─────────────────────────────────────────────────────────────
// Quote chat, opened from My Quotes.
//
// REMOVED 2026-09-16 (Master Prompt 9): SEED — two hardcoded messages
// ("Hello! Thank you for your interest in our quote…" from the vendor, and
// "Hi! I wanted to discuss the MOQ and see if we can negotiate." attributed to
// the BUYER), reset into state by a useEffect on every open. A buyer opening
// any quote's chat saw a conversation that had never happened, with a line
// they had never written put in their own voice, and anything they typed was
// component state that vanished when the modal closed.
//
// This does NOT invent a second messaging system. It uses the same
// `conversations` / `messages` tables, the same useChatThread() hook and the
// same find-or-create-by-user-pair behaviour that ChatThread.tsx (/chats/:id)
// already runs on, so a message sent here appears there and vice versa — they
// are one thread, because they are one pair of users. The quote's `vendorId` is
// `quotes.vendor_id`, a real profile id, which is exactly what the hook keys on.
//
// The "Online now" indicator was removed with the seed: nothing in this project
// tracks presence (`ChatSummary.online` is hardcoded false), so it was a green
// dot asserting something no data supports.
// ─────────────────────────────────────────────────────────────

export default function VendorChatModal({ quote, onClose }: { quote: VendorQuote | null; onClose: () => void }) {
  const { user } = useAuth();
  // Hooks run unconditionally; the hook itself no-ops on an undefined id, which
  // is the case while the modal is closed.
  const { messages, ready, sendText, canChat, underReview } = useChatThread(quote?.vendorId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Switching to a different quote's chat starts a fresh draft. The MESSAGES
  // are not reset here — they belong to the thread and the hook reloads them.
  useEffect(() => { setDraft(""); }, [quote?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canSend = canChat && !underReview && !sending && Boolean(draft.trim());

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await sendText(text);
    setSending(false);
    // Keep the draft when the write was refused (blocklist, moderation lock,
    // suspended account) so the buyer does not lose what they typed. sendText
    // has already explained why.
    if (ok) setDraft("");
  };

  return (
    <AnimatePresence>
      {quote && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl bg-white overflow-hidden shadow-2xl"
            initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-[#256fef] text-white flex items-center justify-center text-xs font-bold">
                {quote.vendorInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{quote.vendorName}</p>
                <p className="text-[11px] text-gray-400 truncate">Quote chat</p>
              </div>
              <button onClick={onClose} aria-label="Close chat" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages — loading, empty and populated are three distinct
                states. An unread thread is not a scripted one. */}
            <div className="h-64 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50/50">
              {!canChat ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageSquare className="mb-2 h-7 w-7 text-gray-300" />
                  <p className="text-xs font-semibold text-gray-700">Sign in to message this vendor</p>
                  <p className="mt-1 text-[11px] text-gray-400">Your conversation is tied to your account.</p>
                </div>
              ) : !ready ? (
                <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Loading conversation">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageSquare className="mb-2 h-7 w-7 text-gray-300" />
                  <p className="text-xs font-semibold text-gray-700">No messages yet</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Send the first message about this quote — {quote.vendorName} will see it in their inbox.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={m.sender === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className="max-w-[80%]">
                      <div className={
                        m.sender === "user"
                          ? "rounded-2xl rounded-br-sm bg-[#ef4d62] text-white px-3 py-2 text-xs leading-relaxed"
                          : "rounded-2xl rounded-bl-sm bg-white border border-gray-200 text-gray-700 px-3 py-2 text-xs leading-relaxed"
                      }>
                        {m.text}
                      </div>
                      <p className={"mt-1 text-[10px] text-gray-400 " + (m.sender === "user" ? "text-right" : "")}>{m.time}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 p-3">
              {underReview ? (
                // The DB is what actually refuses the insert (messages_insert
                // requires an active conversation); this is the honest UI for it.
                <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] font-medium text-amber-700">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  This chat is under review. You can't send messages until it is resumed.
                </p>
              ) : (
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={canChat ? "Type your message..." : "Sign in to send a message"}
                  disabled={!canChat}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] disabled:bg-gray-50 disabled:text-gray-400"
                />
              )}
              <div className="flex items-center gap-2 mt-2">
                <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => void send()}
                  disabled={!canSend}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 disabled:bg-gray-200 disabled:text-gray-400 text-white py-2.5 text-sm font-bold transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? "Sending…" : "Send Message"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
