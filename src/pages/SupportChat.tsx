import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, Camera, Image as ImageIcon, Music,
  FileText, ShieldCheck, CheckCheck,
} from "lucide-react";
import { CHAT_MONITORING_NOTICE } from "@/lib/chatData";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const CORAL = "#ef4d62";

interface Msg {
  id: number;
  sender: "support" | "user";
  text: string;
  timestamp: Date;
  kind?: "system";     // centered status line (e.g. "… joined the chat")
  fileType?: string;   // "photo" | "image" | "audio" | "PDF"
  fileName?: string;
  fileUrl?: string;    // object URL for previewable attachments
}

const TEAM_NAME = "Cosora Team";
const AGENT = { name: "Abdul", role: "Cosora support executive" };

const CANNED = [
  "Thanks for sharing that — let me pull up the details on our side.",
  "Got it. I'm looping in the right team so we can resolve this quickly for you.",
  "Understood. Could you share your order or RFQ number so I can look further?",
];

const QUICK_PROMPTS = [
  "Track my order",
  "Payment or refund help",
  "Verification help",
  "Talk to a human",
];

const SupportChat = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 1,
      sender: "support",
      kind: "system",
      text: `${AGENT.name} from the ${TEAM_NAME} joined the chat`,
      timestamp: new Date(),
    },
    {
      id: 2,
      sender: "support",
      text: `Hi, I'm ${AGENT.name} from the ${TEAM_NAME}. How can I help you with your enquiry today?`,
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
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Release any attachment preview URLs when the chat unmounts.
  useEffect(() => () => { objectUrls.current.forEach(URL.revokeObjectURL); }, []);

  // Back → wherever the user came from (Profile via "Chat with Us"); fall back
  // to Profile on a deep link / refresh where there's no in-app history.
  const goBack = () => {
    const idx = (window.history.state && (window.history.state as { idx?: number }).idx) ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/profile");
  };

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

  const send = (raw?: string) => {
    const text = (raw ?? message).trim();
    if (!text) return;
    setMessages((p) => [...p, { id: p.length + 1, sender: "user", text, timestamp: new Date() }]);
    setMessage("");
    pushSupportReply();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const fileUrl = URL.createObjectURL(file);
    objectUrls.current.push(fileUrl);
    setMessages((p) => [
      ...p,
      { id: p.length + 1, sender: "user", text: `Sent a ${type}: ${file.name}`, timestamp: new Date(), fileType: type, fileName: file.name, fileUrl },
    ]);
    setShowAttach(false);
    pushSupportReply();
  };

  const fmt = (d: Date) => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const attachItems = [
    { label: "Camera", ref: cameraRef, type: "photo", accept: "image/*", capture: "environment" as const, Icon: Camera },
    { label: "Gallery", ref: galleryRef, type: "image", accept: "image/*", capture: undefined, Icon: ImageIcon },
    { label: "Audio", ref: audioRef, type: "audio", accept: "audio/*", capture: undefined, Icon: Music },
    { label: "PDF", ref: pdfRef, type: "PDF", accept: "application/pdf", capture: undefined, Icon: FileText },
  ];

  const isImage = (t?: string) => t === "photo" || t === "image";
  const showQuickPrompts = !messages.some((m) => m.sender === "user") && !isTyping;

  const enter = reduced
    ? {}
    : { initial: { opacity: 0, y: 10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.26, ease: E } };

  return (
    <div className="h-[100dvh] bg-gray-50 lg:bg-slate-100 lg:py-6 lg:px-4">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-gray-50 lg:rounded-3xl lg:border lg:border-gray-200 lg:bg-white lg:shadow-xl">

        {/* ── Header ── */}
        <div className="shrink-0 bg-white border-b border-gray-100">
          <div className="px-3 sm:px-4 py-3 flex items-center gap-3">
            <button onClick={goBack} aria-label="Back"
              className="-ml-1 p-1.5 rounded-full text-gray-700 hover:bg-gray-100 active:scale-95 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold"
                style={{ backgroundColor: CORAL }}>
                {TEAM_NAME[0]}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">{TEAM_NAME}</p>
              <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Online
              </p>
            </div>
          </div>
        </div>

        {/* ── Monitoring disclosure — legally required in every chat flow ── */}
        <div className="shrink-0 bg-amber-50 border-b border-amber-100">
          <div className="px-4 py-2 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-snug">{CHAT_MONITORING_NOTICE}</p>
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="px-3 sm:px-4 py-4 space-y-3">

            {/* Date pill */}
            <div className="flex justify-center">
              <span className="px-3 py-1 rounded-full bg-gray-200/70 text-[11px] font-medium text-gray-500">Today</span>
            </div>

            {messages.map((m) => {
              if (m.kind === "system") {
                return (
                  <motion.div key={m.id} {...enter} className="flex justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[11px] font-medium text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {m.text}
                    </span>
                  </motion.div>
                );
              }
              const isUser = m.sender === "user";
              const hasFile = !!m.fileType;
              return (
                <motion.div key={m.id} {...enter}
                  className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>

                  {/* Support avatar */}
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mb-4"
                      style={{ backgroundColor: CORAL }}>
                      {AGENT.name[0]}
                    </div>
                  )}

                  <div className={`max-w-[80%] sm:max-w-[76%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                    {/* File attachment → white card (legible previews) */}
                    {hasFile ? (
                      <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${isUser ? "rounded-br-md" : "rounded-bl-md"}`}>
                        {isImage(m.fileType) && m.fileUrl ? (
                          <img src={m.fileUrl} alt={m.fileName} className="block max-h-56 w-full object-cover" />
                        ) : m.fileType === "audio" && m.fileUrl ? (
                          <div className="p-2.5 w-[min(72vw,260px)]">
                            <audio controls src={m.fileUrl} className="w-full h-9" />
                          </div>
                        ) : (
                          <a href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 pr-4 hover:bg-gray-50 transition-colors">
                            <span className="w-10 h-10 rounded-xl bg-[#ef4d62]/10 grid place-items-center shrink-0">
                              <FileText className="w-5 h-5 text-[#ef4d62]" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-gray-900 truncate max-w-[180px]">{m.fileName}</span>
                              <span className="block text-[11px] text-gray-400 uppercase tracking-wide">{m.fileType} · tap to open</span>
                            </span>
                          </a>
                        )}
                        {(isImage(m.fileType) && m.fileName) && (
                          <p className="px-3 py-1.5 text-[11px] text-gray-500 truncate">{m.fileName}</p>
                        )}
                        <div className="flex items-center justify-end gap-1 px-3 pb-2 -mt-0.5">
                          <span className="text-[10px] text-gray-400">{fmt(m.timestamp)}</span>
                          {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#ef4d62]" />}
                        </div>
                      </div>
                    ) : (
                      /* Text bubble */
                      <div
                        className={`px-3.5 py-2.5 text-sm shadow-sm ${
                          isUser
                            ? "text-white rounded-2xl rounded-br-md"
                            : "bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-bl-md"
                        }`}
                        style={isUser ? { background: "linear-gradient(180deg, #da3651 0%, #c62f49 100%)" } : undefined}
                      >
                        {!isUser && <p className="text-[11px] font-bold text-[#ef4d62] mb-0.5">{AGENT.name}</p>}
                        <p className="leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 ${isUser ? "text-white/75" : "text-gray-400"}`}>
                          <span className="text-[10px]">{fmt(m.timestamp)}</span>
                          {isUser && <CheckCheck className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {/* Typing indicator */}
            <AnimatePresence>
              {isTyping && (
                <motion.div
                  initial={reduced ? {} : { opacity: 0, y: 6 }}
                  animate={reduced ? {} : { opacity: 1, y: 0 }}
                  exit={reduced ? {} : { opacity: 0 }}
                  transition={{ duration: 0.2, ease: E }}
                  className="flex items-end gap-2 justify-start"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: CORAL }}>
                    {AGENT.name[0]}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={endRef} />
          </div>
        </div>

        {/* ── Input ── */}
        <div className="shrink-0 bg-white border-t border-gray-200 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="px-3 sm:px-4 pt-3">

            {/* Quick prompts (first run) */}
            <AnimatePresence>
              {showQuickPrompts && (
                <motion.div
                  initial={reduced ? {} : { opacity: 0, height: 0 }}
                  animate={reduced ? {} : { opacity: 1, height: "auto" }}
                  exit={reduced ? {} : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: E }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2 pb-3 overflow-x-auto scrollbar-hide">
                    {QUICK_PROMPTS.map((q) => (
                      <button key={q} onClick={() => send(q)}
                        className="shrink-0 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-[#ef4d62]/50 hover:text-[#ef4d62] active:scale-95 transition">
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Attachment menu */}
            <AnimatePresence>
              {showAttach && (
                <motion.div
                  initial={reduced ? {} : { opacity: 0, height: 0 }}
                  animate={reduced ? {} : { opacity: 1, height: "auto" }}
                  exit={reduced ? {} : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: E }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-4 gap-2 pb-3 mb-1 border-b border-gray-100">
                    {attachItems.map(({ label, ref, type, accept, capture, Icon }) => (
                      <button key={label} onClick={() => ref.current?.click()}
                        className="flex flex-col items-center gap-1.5 py-2 rounded-xl hover:bg-gray-50 active:scale-95 transition">
                        <span className="w-12 h-12 rounded-2xl bg-[#ef4d62]/10 flex items-center justify-center hover:bg-[#ef4d62]/20 transition-colors">
                          <Icon className="w-5 h-5 text-[#ef4d62]" />
                        </span>
                        <span className="text-[11px] text-gray-600">{label}</span>
                        <input ref={ref} type="file" className="hidden" accept={accept}
                          {...(capture ? { capture } : {})} onChange={(e) => handleFile(e, type)} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2 pb-1">
              <button onClick={() => setShowAttach((p) => !p)}
                className={`p-2.5 rounded-full transition-colors active:scale-95 ${showAttach ? "text-[#ef4d62] bg-[#ef4d62]/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                aria-label="Attach a file">
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                type="text" value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type your message…"
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-100 rounded-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#ef4d62]/25 transition"
              />
              <motion.button
                onClick={() => send()} disabled={!message.trim()}
                whileTap={reduced ? undefined : { scale: 0.9 }}
                className="p-3 rounded-full text-white transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shrink-0"
                style={message.trim() ? { backgroundColor: CORAL } : undefined} aria-label="Send message">
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportChat;
