import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, Camera, Image as ImageIcon, Music,
  FileText as FilePdf, ShieldCheck, Phone,
} from "lucide-react";
import { CHAT_MONITORING_NOTICE } from "@/lib/chatData";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const CORAL = "#ef4d62";

interface Msg {
  id: number;
  sender: "support" | "user";
  text: string;
  timestamp: Date;
  fileType?: string;
  fileName?: string;
}

const AGENT = { name: "Abdul", role: "Cosora support executive" };

const CANNED = [
  "Thanks for sharing that — let me pull up the details on our side.",
  "Got it. I'm looping in the right team so we can resolve this quickly for you.",
  "Understood. Could you share your order or RFQ number so I can look further?",
];

const SupportChat = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 1,
      sender: "support",
      text: "Hi! We'll help you connect with a customer manager. Please share the details of your enquiry — it may take a moment for the manager to respond.",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const replyIdx = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const pushSupportReply = () => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((p) => [
        ...p,
        { id: p.length + 1, sender: "support", text: CANNED[replyIdx.current % CANNED.length], timestamp: new Date() },
      ]);
      replyIdx.current += 1;
    }, 1600);
  };

  const send = () => {
    if (!message.trim()) return;
    setMessages((p) => [...p, { id: p.length + 1, sender: "user", text: message.trim(), timestamp: new Date() }]);
    setMessage("");
    pushSupportReply();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessages((p) => [
      ...p,
      { id: p.length + 1, sender: "user", text: `Sent a ${type}: ${file.name}`, timestamp: new Date(), fileType: type, fileName: file.name },
    ]);
    setShowAttach(false);
    pushSupportReply();
  };

  const fmt = (d: Date) => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const attachItems = [
    { label: "Camera", ref: cameraRef, type: "photo", accept: "image/*", capture: "environment" as const, Icon: Camera },
    { label: "Gallery", ref: galleryRef, type: "image", accept: "image/*", capture: undefined, Icon: ImageIcon },
    { label: "Audio", ref: audioRef, type: "audio", accept: "audio/*", capture: undefined, Icon: Music },
    { label: "PDF", ref: pdfRef, type: "PDF", accept: "application/pdf", capture: undefined, Icon: FilePdf },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/profile/help")} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: CORAL }}>
            {AGENT.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 leading-tight">{AGENT.name}</p>
            <p className="text-[11px] text-emerald-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> {AGENT.role}
            </p>
          </div>
          <button onClick={() => { window.location.href = "tel:+919147700465"; }}
            className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center" aria-label="Call support">
            <Phone className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      </div>

      {/* Monitoring disclosure — legally required in every chat flow */}
      <div className="shrink-0 bg-amber-50/80 border-b border-amber-100">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-snug">{CHAT_MONITORING_NOTICE}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] px-3.5 py-2.5 text-sm ${
                  m.sender === "user"
                    ? "text-white rounded-l-2xl rounded-tr-2xl"
                    : "bg-white border border-gray-200 text-gray-900 rounded-r-2xl rounded-tl-2xl"
                }`}
                style={m.sender === "user" ? { backgroundColor: CORAL } : undefined}
              >
                {m.sender === "support" && (
                  <p className="text-[11px] font-bold text-gray-500 mb-0.5">{AGENT.name}</p>
                )}
                <p className="leading-relaxed">{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.sender === "user" ? "text-white/70" : "text-gray-400"}`}>{fmt(m.timestamp)}</p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-r-2xl rounded-tl-2xl px-4 py-3">
                <div className="flex gap-1">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 bg-white border-t border-gray-200 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <AnimatePresence>
            {showAttach && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: E }}
                className="overflow-hidden"
              >
                <div className="flex gap-5 pb-3 mb-3 border-b border-gray-100">
                  {attachItems.map(({ label, ref, type, accept, capture, Icon }) => (
                    <button key={label} onClick={() => ref.current?.click()} className="flex flex-col items-center gap-1">
                      <div className="w-12 h-12 rounded-full bg-[#ef4d62]/10 flex items-center justify-center hover:bg-[#ef4d62]/20 transition-colors">
                        <Icon className="w-5 h-5 text-[#ef4d62]" />
                      </div>
                      <span className="text-[11px] text-gray-600">{label}</span>
                      <input ref={ref} type="file" className="hidden" accept={accept}
                        {...(capture ? { capture } : {})} onChange={(e) => handleFile(e, type)} />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowAttach((p) => !p)}
              className={`p-2 rounded-full transition-colors ${showAttach ? "text-[#ef4d62] bg-[#ef4d62]/10" : "text-gray-500 hover:text-gray-700"}`}
              aria-label="Attach">
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text" value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type your message…"
              className="flex-1 min-w-0 px-4 py-2.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:border-[#ef4d62]"
            />
            <button onClick={send} disabled={!message.trim()}
              className="p-3 rounded-full text-white transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              style={message.trim() ? { backgroundColor: CORAL } : undefined} aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportChat;
