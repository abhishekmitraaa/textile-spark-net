import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send } from "lucide-react";
import type { VendorQuote } from "@/lib/quotesData";

interface Msg { id: number; from: "vendor" | "buyer"; text: string; time: string }

const SEED: Msg[] = [
  { id: 1, from: "vendor", text: "Hello! Thank you for your interest in our quote. How can I help you today?", time: "10:30 AM" },
  { id: 2, from: "buyer", text: "Hi! I wanted to discuss the MOQ and see if we can negotiate.", time: "10:32 AM" },
];

export default function VendorChatModal({ quote, onClose }: { quote: VendorQuote | null; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (quote) { setMessages(SEED); setDraft(""); }
  }, [quote]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((m) => [...m, { id: Date.now(), from: "buyer", text, time: now }]);
    setDraft("");
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
                <p className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Online now
                </p>
              </div>
              <button onClick={onClose} aria-label="Close chat" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50/50">
              {messages.map((m) => (
                <div key={m.id} className={m.from === "buyer" ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[80%]">
                    <div className={
                      m.from === "buyer"
                        ? "rounded-2xl rounded-br-sm bg-[#ef4d62] text-white px-3 py-2 text-xs leading-relaxed"
                        : "rounded-2xl rounded-bl-sm bg-white border border-gray-200 text-gray-700 px-3 py-2 text-xs leading-relaxed"
                    }>
                      {m.text}
                    </div>
                    <p className={"mt-1 text-[10px] text-gray-400 " + (m.from === "buyer" ? "text-right" : "")}>{m.time}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 p-3">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type your message..."
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
              />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                  Cancel
                </button>
                <button onClick={send} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white py-2.5 text-sm font-bold transition-colors">
                  <Send className="w-4 h-4" /> Send Message
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
