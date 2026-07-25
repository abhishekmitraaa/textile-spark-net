import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getOrCreateConversation, CHAT_MONITORING_NOTICE } from "@/lib/chatData";
import { useChatThread } from "@/lib/queries/chat";
import { useCallVendor } from "@/lib/queries/calls";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import {
  ArrowLeft, Phone, Star, MoreVertical, FileText, ChevronRight, Send, Mic, Camera, Paperclip,
  Plus, X, ShieldCheck, Image as ImageIcon, File as FileIcon, User, Headphones,
  Eye, CheckCheck, Check, Star as StarIcon, Archive, Ban, Flag, Trash2, MailOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];

const ChatThread = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { vendorId } = useParams();
  const { user } = useAuth();
  const conv = vendorId ? getOrCreateConversation(vendorId) : null;
  const callVendor = useCallVendor();

  // The thread is shared by both sides. On the seller side it renders inside
  // DashboardLayout so the vendor sidebar stays reachable, and every "back"
  // target has to point at the seller's own inbox (/chat), not the buyer's.
  const { role } = useUserRole();
  const isSeller = role === "seller";
  const inboxHref = isSeller ? "/chat" : "/chats";
  const wrap = (node: ReactElement) =>
    isSeller ? <DashboardLayout variant="full-screen">{node}</DashboardLayout> : node;

  // Real, realtime message thread from Supabase (find-or-create the
  // conversation, load history, live-subscribe). Text is persisted; the
  // attachment buttons send a short text placeholder for now.
  const { messages, otherName, sendText } = useChatThread(vendorId);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const initials = useMemo(() => (conv?.name ?? "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(), [conv?.name]);

  if (!conv) {
    return wrap(
      <div className={cn("bg-white grid place-items-center px-6 text-center", isSeller ? "h-full" : "min-h-screen")}>
        <div>
          <p className="text-sm text-gray-500">This conversation no longer exists.</p>
          <button onClick={() => navigate(inboxHref)} className="mt-3 text-sm font-semibold text-[#ef4d62]">Back to Messages</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return wrap(
      <div className={cn("bg-white grid place-items-center px-6 text-center", isSeller ? "h-full" : "min-h-screen")}>
        <div>
          <p className="text-sm text-gray-500">Sign in to start chatting.</p>
          <p className="mt-1 text-xs text-gray-400">Use the dev switcher (bottom-left) to sign in.</p>
        </div>
      </div>
    );
  }

  const send = () => {
    if (!draft.trim()) return;
    void sendText(draft.trim());
    setDraft("");
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "file") => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Chat media storage is a later pass; send a text placeholder so the
    // message still persists and reaches the other side in realtime.
    void sendText(kind === "image" ? "📷 Photo" : `📎 ${file.name}`, kind);
    setAttachOpen(false);
    e.target.value = "";
  };

  const toggleRecord = () => {
    if (recording) {
      setRecording(false);
      void sendText("🎤 Voice message", "audio");
    } else {
      setRecording(true);
      toast.info("Recording… tap again to send");
    }
  };

  const goProfile = () => navigate(`/vendor/${conv.id}`);
  // Sellers manage quotes they've sent (/quotes); buyers track quotes received.
  const goQuote = () => navigate(isSeller ? "/quotes" : "/requirement/my-quotes");
  const hasText = draft.trim().length > 0;

  const menuItems: { label: string; icon: typeof Eye; danger?: boolean; onClick: () => void }[] = [
    { label: "View Quote details", icon: FileText, onClick: () => { setMenuOpen(false); goQuote(); } },
    { label: "View Vendor Profile", icon: Eye, onClick: () => { setMenuOpen(false); goProfile(); } },
    { label: "Mark as Read", icon: MailOpen, onClick: () => { setMenuOpen(false); toast.success("Marked as read"); } },
    { label: "Star chat", icon: StarIcon, onClick: () => { setMenuOpen(false); toast.success("Chat starred"); } },
    { label: "Archive chat", icon: Archive, onClick: () => { setMenuOpen(false); toast.success("Chat archived"); } },
    { label: "Report", icon: Flag, onClick: () => { setMenuOpen(false); setReportOpen(true); } },
    { label: "Block Vendor", icon: Ban, danger: true, onClick: () => { setMenuOpen(false); blockVendor(); } },
    { label: "Delete chat", icon: Trash2, danger: true, onClick: () => { setMenuOpen(false); toast.success("Chat deleted"); navigate(inboxHref); } },
  ];

  const blockVendor = () => { toast.success(`${conv.name} has been blocked`); navigate(inboxHref); };

  return wrap(
    <div className={cn("flex flex-col bg-gray-50", isSeller ? "h-full" : "h-[100dvh]")}>
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => navigate(inboxHref)} aria-label="Back to Messages" className="p-1 -ml-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
          <button onClick={goProfile} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
            <div className="relative shrink-0">
              {conv.avatar ? <img src={conv.avatar} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#ef4d62]/20 to-[#ef4d62]/40 flex items-center justify-center text-xs font-bold text-gray-700">{initials}</div>}
              {conv.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate leading-tight">{otherName ?? conv.name}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                {conv.online ? <span className="text-emerald-500 font-medium">Online</span> : <span>Offline</span>}
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {conv.rating} ({conv.reviews})</span>
                <span className="text-gray-300 hidden xs:inline">·</span>
                <span className="hidden xs:inline truncate">{conv.location}</span>
              </div>
            </div>
          </button>
          <button onClick={() => vendorId && callVendor(vendorId, conv.rfqProduct)} aria-label="Call" className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0"><Phone className="w-4 h-4 text-white" /></button>
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen((o) => !o)} aria-label="More" className="p-1.5 rounded-full hover:bg-gray-100"><MoreVertical className="w-5 h-5 text-gray-600" /></button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.14, ease: E }}
                    className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                    {menuItems.map((it) => (
                      <button key={it.label} onClick={it.onClick} className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50", it.danger ? "text-red-500" : "text-gray-700")}>
                        <it.icon className="w-4 h-4" /> {it.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RFQ banner → quotes page */}
        <button onClick={goQuote} className="w-full bg-[#ef4d62]/5 border-t border-[#ef4d62]/10">
          <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-2">
            <FileText className="w-4 h-4 text-[#ef4d62] shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-bold text-gray-900">{conv.rfqId}</p>
              <p className="text-[11px] text-gray-500 truncate">{conv.rfqProduct}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#ef4d62] shrink-0" />
          </div>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Monitoring disclosure (legally required) */}
          <div className="mx-auto mb-4 flex max-w-sm items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 leading-snug text-left">{CHAT_MONITORING_NOTICE}</p>
          </div>

          <div className="text-center mb-4"><span className="rounded-full bg-gray-200/70 px-3 py-0.5 text-[11px] font-medium text-gray-500">Today</span></div>

          <div className="space-y-2.5">
            {messages.map((m, i) => (
              <motion.div key={m.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                className={cn("flex", m.sender === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm",
                  m.sender === "user" ? "bg-[#ef4d62] text-white rounded-br-md" : "bg-white text-gray-900 rounded-bl-md border border-gray-100")}>
                  {m.kind === "image" && m.imageUrl && <img src={m.imageUrl} alt="" className="mb-1 rounded-lg max-h-48 object-cover" />}
                  {m.kind === "file" && (
                    <span className="mb-0.5 inline-flex items-center gap-1.5 text-sm"><FileIcon className={cn("w-4 h-4", m.sender === "user" ? "text-white/90" : "text-[#ef4d62]")} /> {m.fileName}</span>
                  )}
                  {m.kind === "audio" && (
                    <span className="inline-flex items-center gap-1.5 text-sm"><Headphones className={cn("w-4 h-4", m.sender === "user" ? "text-white/90" : "text-[#ef4d62]")} /> {m.text}</span>
                  )}
                  {(!m.kind || m.kind === "text") && <p className="text-sm leading-relaxed">{m.text}</p>}
                  <div className={cn("mt-0.5 flex items-center gap-1", m.sender === "user" ? "justify-end" : "")}>
                    <span className={cn("text-[10px]", m.sender === "user" ? "text-white/70" : "text-gray-400")}>{m.time}</span>
                    {m.sender === "user" && (m.status === "read"
                      ? <CheckCheck className="w-3 h-3 text-white/80" />
                      : m.status === "delivered" ? <CheckCheck className="w-3 h-3 text-white/50" /> : <Check className="w-3 h-3 text-white/60" />)}
                  </div>
                </div>
              </motion.div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      {/* Attachment grid */}
      <AnimatePresence>
        {attachOpen && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18, ease: E }}
            className="shrink-0 bg-white border-t border-gray-100">
            <div className="max-w-2xl mx-auto grid grid-cols-4 gap-3 px-5 py-4">
              <AttachItem icon={ImageIcon} label="Gallery" color="text-violet-600 bg-violet-100" onClick={() => galleryRef.current?.click()} />
              <AttachItem icon={Camera} label="Camera" color="text-[#ef4d62] bg-[#ef4d62]/10" onClick={() => cameraRef.current?.click()} />
              <AttachItem icon={FileIcon} label="Document" color="text-indigo-600 bg-indigo-100" onClick={() => docRef.current?.click()} />
              <AttachItem icon={User} label="Contact" color="text-cyan-600 bg-cyan-100" onClick={() => { setAttachOpen(false); toast.success("Contact shared"); }} />
              <AttachItem icon={Headphones} label="Audio" color="text-orange-600 bg-orange-100" onClick={() => { setAttachOpen(false); toggleRecord(); }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="shrink-0 bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => setAttachOpen((o) => !o)} aria-label="Attach" className="shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
            <motion.span animate={{ rotate: attachOpen ? 45 : 0 }} transition={{ duration: 0.18 }}><Plus className="w-5 h-5 text-gray-600" /></motion.span>
          </button>
          <div className="flex-1 flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Message" className="flex-1 bg-transparent text-sm placeholder:text-gray-400 focus:outline-none" />
            <button onClick={() => docRef.current?.click()} aria-label="Attach file" className="shrink-0"><Paperclip className="w-4 h-4 text-gray-400" /></button>
            <button onClick={() => cameraRef.current?.click()} aria-label="Camera" className="shrink-0"><Camera className="w-4 h-4 text-gray-400" /></button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {hasText ? (
              <motion.button key="send" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}
                onClick={send} aria-label="Send" className="shrink-0 w-10 h-10 rounded-full bg-[#ef4d62] flex items-center justify-center hover:bg-[#ef4d62]/90">
                <Send className="w-4 h-4 text-white" />
              </motion.button>
            ) : (
              <motion.button key="mic" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}
                onClick={toggleRecord} aria-label="Record audio"
                className={cn("shrink-0 w-10 h-10 rounded-full flex items-center justify-center", recording ? "bg-red-500 animate-pulse" : "bg-[#ef4d62] hover:bg-[#ef4d62]/90")}>
                <Mic className="w-4 h-4 text-white" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, "image")} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e, "image")} />
      <input ref={docRef} type="file" className="hidden" onChange={(e) => onFile(e, "file")} />

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} name={conv.name} onBlock={blockVendor} />
    </div>
  );
};

function AttachItem({ icon: Icon, label, color, onClick }: { icon: typeof ImageIcon; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
      <span className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", color)}><Icon className="w-6 h-6" /></span>
      <span className="text-[11px] text-gray-600">{label}</span>
    </button>
  );
}

const REPORT_REASONS = [
  "I just don't like it",
  "Bullying or unwanted contact",
  "Violence, hate or exploitation",
  "Selling or promoting restricted items",
  "Nudity or sexual activity",
  "Scam, fraud or spam",
  "False information",
];

function ReportModal({ open, onClose, name, onBlock }: { open: boolean; onClose: () => void; name: string; onBlock: () => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (open) setDone(false); }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} onClick={(e) => e.stopPropagation()}>
            {!done ? (
              <>
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h3 className="text-base font-bold text-gray-900">Report</h3>
                  <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Why are you reporting this?</p>
                  <div className="divide-y divide-gray-100">
                    {REPORT_REASONS.map((r) => (
                      <button key={r} onClick={() => setDone(true)} className="w-full flex items-center justify-between py-3 text-left text-sm text-gray-700 hover:text-gray-900">
                        {r} <ChevronRight className="w-4 h-4 text-gray-300" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-center">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center"><Check className="w-6 h-6 text-emerald-500" /></div>
                <h3 className="text-base font-bold text-gray-900">Thanks for your feedback</h3>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">When you report something, Cosora reviews it against our Community Standards. You can also block this vendor so they can no longer contact you.</p>
                <button onClick={() => { onClose(); onBlock(); }} className="mt-5 w-full text-left flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3 text-sm font-semibold text-red-500 hover:bg-red-50">
                  Block {name} <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="mt-2 w-full rounded-xl bg-[#256fef] py-3 text-sm font-bold text-white hover:bg-[#256fef]/90">Close</button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ChatThread;
