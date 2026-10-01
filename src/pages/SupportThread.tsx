import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, FileText, Image as ImageIcon, Loader2, Mic, Music, Paperclip, Send, ShieldCheck, X, Download, Lock, Square,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CHAT_MONITORING_NOTICE } from "@/lib/chatData";
import { cn } from "@/lib/utils";
import {
  AUDIO_TYPES, PHOTO_TYPES, endChat, fileProblem, istLabel, labelIn, markRead, postMessage, supportError, supportFileUrl,
  uploadSupportFile, useSupportStatus, useSupportThread, type RequestDetail, type ThreadAttachment, type ThreadMessage,
} from "@/lib/queries/support";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { SignInForSupport, SupportFrame, SupportUnavailable, useSupportSide } from "@/components/support/SupportFrame";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * One support request and its conversation with Cosora Support (plan P3b, P3c).
 *
 * The person only ever sees "Cosora Support" (D-06): no staff name, no avatar, and
 * no "online" or "typing" signals, because none would be true. Automatic messages
 * are shown from their event code, so they read in the person's language. Files are
 * photos, PDFs and voice notes (D-09); fraud evidence is never shown back.
 */

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const MAX_FILES = 5;

const STATUS_TEXT: Record<string, string> = {
  new: "Waiting for Cosora Support",
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

const CHANNEL_TEXT: Record<string, string> = {
  chat: "Chat",
  callback: "Callback request",
  fraud_report: "Fraud report",
  feedback: "Feedback",
};

/** The automatic messages, by event code. The body is the English fallback. */
function systemText(m: ThreadMessage): string {
  const meta = m.meta ?? {};
  const slot = typeof meta.date === "string" && typeof meta.start === "string" && typeof meta.end === "string"
    ? `${meta.date}, ${meta.start}–${meta.end} IST`
    : "";
  switch (m.event) {
    case "received": return "Thanks. Cosora Support will reply here.";
    case "received_offline":
      return typeof meta.next_open_at === "string"
        ? `We're closed now. Cosora Support will reply from ${istLabel(meta.next_open_at)}.`
        : "We're closed now. Cosora Support will reply when we're next open.";
    case "joined": return "Cosora Support has joined the chat.";
    case "resolved": return "Cosora Support marked this request resolved. Reply within 7 days to reopen it.";
    case "closed": return "This request is closed. Start a new one if you need more help.";
    case "reopened": return "You reopened this request.";
    case "reopened_by_staff": return "Cosora Support reopened this request.";
    case "ended": return "You ended this chat. Reply within 7 days to reopen it.";
    case "callback_requested": return slot ? `Callback requested for ${slot}.` : "Callback requested.";
    case "callback_completed": return "We called you. If there's anything else, reply here.";
    case "callback_missed":
      return meta.final ? "We tried to call you 3 times and couldn't reach you. Reply here to book another time."
        : "We tried to call you and couldn't reach you. We'll try again.";
    case "callback_wrong_number": return "We couldn't reach you on the number you gave. Reply here with the right number.";
    case "callback_cancelled": return "This callback was cancelled.";
    case "report_received": return "We've recorded your report. Our team reviews every report.";
    case "report_reviewed": return "Our team has reviewed your report. Thank you for telling us.";
    case "feedback_received": return "Thanks. The team reads every note.";
    case "feedback_reviewed": return "The team has read your feedback. Thank you.";
    default: return m.body ?? "";
  }
}

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return DAY.format(d);
}

type Pending = { key: string; file: File; durationMs?: number; label: string };

export default function SupportThread() {
  const { ticketNo } = useParams<{ ticketNo: string }>();
  const { user, loading } = useAuth();
  if (!loading && !user) {
    return (
      <SupportFrame title="Your request">
        <SignInForSupport title="Sign in to see your support requests." />
      </SupportFrame>
    );
  }
  return <Thread ticketNo={ticketNo} userId={user?.id} />;
}

function Thread({ ticketNo, userId }: { ticketNo: string | undefined; userId: string | undefined }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const { accent } = useSupportSide();
  const thread = useSupportThread(ticketNo);
  const status = useSupportStatus(userId);
  const d = thread.data;
  const endRef = useRef<HTMLDivElement>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Read up to the newest message, and keep reading as replies arrive.
  const newest = d?.messages.at(-1)?.id;
  useEffect(() => {
    if (d?.ticket.id) void markRead(d.ticket.id).then(() => qc.invalidateQueries({ queryKey: ["support", "mine"] }));
  }, [d?.ticket.id, newest, qc]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }, [newest, reduced]);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/help/requests");
  };

  if (thread.isPending) {
    return (
      <SupportFrame title="Your request" back="/help/requests">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </SupportFrame>
    );
  }
  if (!d) {
    return (
      <SupportFrame title="Your request" back="/help/requests">
        <p className="text-sm text-gray-600">We couldn't find that request. <Link to="/help/requests" className="underline">See your requests</Link>.</p>
      </SupportFrame>
    );
  }

  const t = d.ticket;
  const filesByMessage = new Map<string, ThreadAttachment[]>();
  for (const a of d.attachments) filesByMessage.set(a.message_id, [...(filesByMessage.get(a.message_id) ?? []), a]);
  const canEnd = t.channel === "chat" && (t.status === "new" || t.status === "open");
  const available = status.data?.available ?? false;
  let lastDay = "";

  return (
    <div className="h-[100dvh] bg-gray-50 lg:bg-slate-100 lg:py-6 lg:px-4" data-clarity-mask="True">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-gray-50 lg:rounded-3xl lg:border lg:border-gray-200 lg:bg-white lg:shadow-xl">

        {/* ── Header: the team, never a person ── */}
        <div className="shrink-0 bg-white border-b border-gray-100">
          <div className="px-3 sm:px-4 py-3 flex items-center gap-3">
            <button onClick={goBack} aria-label="Back" className="-ml-1 p-1.5 rounded-full text-gray-700 hover:bg-gray-100 active:scale-95 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className={cn("w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white text-base font-bold", accent.bg)} aria-hidden>C</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">Cosora Support</p>
              <p className="text-[11px] text-gray-500 truncate">
                {CHANNEL_TEXT[t.channel]} · {labelIn(t.category_label)} · <span className="font-mono" data-no-translate>{t.ticket_no}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">{STATUS_TEXT[t.status]}</span>
          </div>
        </div>

        {/* ── Monitoring disclosure: legally required in every chat flow ── */}
        <div className="shrink-0 bg-amber-50 border-b border-amber-100">
          <div className="px-4 py-2 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-snug">{CHAT_MONITORING_NOTICE}</p>
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="px-3 sm:px-4 py-4 space-y-3">
            {d.messages.map((m) => {
              const day = dayLabel(m.created_at);
              const pill = day !== lastDay ? (
                <div className="flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-gray-200/70 text-[11px] font-medium text-gray-500">{day}</span>
                </div>
              ) : null;
              lastDay = day;
              return (
                <div key={m.id} className="space-y-3">
                  {pill}
                  <MessageBubble m={m} files={filesByMessage.get(m.id) ?? []} accentBg={accent.bg} reduced={!!reduced} />
                </div>
              );
            })}
            {t.channel === "fraud_report" && d.files_received > 0 && (
              <div className="flex justify-center">
                <span className="px-3 py-1 rounded-full bg-white border border-gray-200 text-[11px] text-gray-600">
                  {d.files_received === 1 ? "1 file received" : `${d.files_received} files received`}
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* ── Reply, or why not ── */}
        {t.can_reply && available ? (
          <Composer
            detail={d}
            onSent={() => void qc.invalidateQueries({ queryKey: ["support", "request", ticketNo] })}
            onEnd={canEnd ? () => setConfirmEnd(true) : undefined}
          />
        ) : t.can_reply && !status.isPending ? (
          <div className="shrink-0 border-t border-gray-200 bg-white p-3">
            <SupportUnavailable title="Replying in the app isn't available yet." subject={`About ${t.ticket_no}`} />
          </div>
        ) : !t.can_reply ? (
          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-gray-600"><Lock className="w-4 h-4" /> This request is closed.</p>
            <Link to="/help/chat" className={cn("rounded-full px-4 py-2 text-sm font-semibold text-white", accent.bg, accent.hoverBg)}>
              Start a new chat
            </Link>
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this chat?</AlertDialogTitle>
            <AlertDialogDescription>You can reply within 7 days to reopen it. After that, start a new chat.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep chatting</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await endChat(t.id);
                  void qc.invalidateQueries({ queryKey: ["support"] });
                } catch (e) {
                  toast.error(supportError(e));
                }
              }}
            >
              End chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MessageBubble({ m, files, accentBg, reduced }: { m: ThreadMessage; files: ThreadAttachment[]; accentBg: string; reduced: boolean }) {
  const enter = reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: E } };
  if (m.author_kind === "system") {
    return (
      <motion.div {...enter} className="flex justify-center">
        <span className="max-w-[88%] text-center px-3 py-1.5 rounded-2xl bg-white border border-gray-200 text-[11px] text-gray-600">{systemText(m)}</span>
      </motion.div>
    );
  }
  const mine = m.author_kind === "requester";
  return (
    <motion.div {...enter} className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] sm:max-w-[76%] flex flex-col", mine ? "items-end" : "items-start")}>
        {!mine && <p className="text-[11px] font-bold text-gray-700 mb-0.5 px-1">Cosora Support</p>}
        {m.body && (
          <div className={cn(
            "px-3.5 py-2.5 text-sm shadow-sm rounded-2xl",
            mine ? cn(accentBg, "text-white rounded-br-md") : "bg-white border border-gray-200 text-gray-900 rounded-bl-md",
          )}>
            <p className="leading-relaxed whitespace-pre-wrap break-words" data-no-translate>{m.body}</p>
          </div>
        )}
        {files.length > 0 && (
          <div className={cn("flex flex-col gap-1.5", m.body && "mt-1.5", mine ? "items-end" : "items-start")}>
            {files.map((f) => <FileView key={f.id} a={f} />)}
          </div>
        )}
        <span className="mt-1 px-1 text-[10px] text-gray-400">{TIME.format(new Date(m.created_at))}</span>
      </div>
    </motion.div>
  );
}

// Signed links last 5 minutes. A photo or PDF signs a fresh one when opened; audio
// re-signs when play starts on a link older than 4 minutes.
const FRESH_MS = 4 * 60_000;

function FileView({ a }: { a: ThreadAttachment }) {
  const url = useQuery({ queryKey: ["support-file", a.id], staleTime: FRESH_MS, queryFn: () => supportFileUrl(a) });
  const open = async () => {
    const tab = a.kind === "image" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    try {
      const fresh = await supportFileUrl(a);
      if (tab) tab.location.href = fresh;
      else window.location.href = fresh;
    } catch (e) {
      tab?.close();
      toast.error(supportError(e));
    }
  };
  if (url.error) return <span className="text-[11px] text-red-600">The file couldn't be opened.</span>;
  if (!url.data) return <span className="block h-16 w-24 rounded-xl bg-gray-200 animate-pulse" />;
  if (a.kind === "image") {
    return (
      <button type="button" onClick={() => void open()} aria-label="Open the photo" className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <img src={url.data} alt="Photo" className="block max-h-56 max-w-[min(72vw,260px)] object-cover" />
      </button>
    );
  }
  if (a.kind === "audio") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-2.5 w-[min(72vw,260px)]">
        <audio
          controls
          preload="none"
          src={url.data}
          className="w-full h-9"
          onPlay={(e) => {
            if (Date.now() - url.dataUpdatedAt < FRESH_MS) return;
            const el = e.currentTarget;
            el.pause();
            void url.refetch().then((r) => {
              if (!r.data) return;
              el.src = r.data;
              void el.play();
            });
          }}
        />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => void open()} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 pr-4 hover:bg-gray-50">
      <FileText className="w-5 h-5 text-gray-600" />
      <span className="text-sm font-medium text-gray-900">PDF</span>
      <Download className="w-4 h-4 text-gray-400" />
    </button>
  );
}

function Composer({ detail: d, onSent, onEnd }: { detail: RequestDetail; onSent: () => void; onEnd?: () => void }) {
  const reduced = useReducedMotion();
  const { accent } = useSupportSide();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const uploaded = useRef(new Map<string, string>());
  const voice = useVoiceRecorder();
  const inputs = { camera: useRef<HTMLInputElement>(null), gallery: useRef<HTMLInputElement>(null), pdf: useRef<HTMLInputElement>(null), audio: useRef<HTMLInputElement>(null) };

  const addFiles = (list: FileList | File[] | null, durationMs?: number, label?: string) => {
    if (!list) return;
    const next = [...pending];
    for (const file of Array.from(list)) {
      const problem = fileProblem(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      if (next.length >= MAX_FILES) {
        toast.error("Up to 5 files in one message.");
        break;
      }
      next.push({ key: `${file.name}-${file.size}-${Date.now()}-${next.length}`, file, durationMs, label: label ?? file.name });
    }
    setPending(next);
    setShowAttach(false);
  };

  const send = async () => {
    if (!text.trim() && pending.length === 0) return;
    let failing: string | null = null;
    try {
      const ids: string[] = [];
      for (const [i, p] of pending.entries()) {
        const done = uploaded.current.get(p.key);
        if (done) {
          ids.push(done);
          continue;
        }
        failing = p.key;
        setBusy(pending.length > 1 ? `Sending file ${i + 1} of ${pending.length}…` : "Sending file…");
        const id = await uploadSupportFile(d.ticket.id, p.file, p.durationMs);
        uploaded.current.set(p.key, id);
        ids.push(id);
      }
      failing = null;
      setBusy("Sending…");
      await postMessage(d.ticket.id, text, ids);
      setText("");
      setPending([]);
      uploaded.current.clear();
      onSent();
    } catch (e) {
      // The file that failed comes off the list; files already sent up are reused.
      const bad = failing;
      if (bad) setPending((list) => list.filter((p) => p.key !== bad));
      toast.error(supportError(e));
    } finally {
      setBusy(null);
    }
  };

  // Hold to record; release to add the note. Keyboard users press once to start and again to stop.
  const startVoice = async () => {
    const ok = await voice.start();
    if (!ok) {
      toast.message("The microphone isn't available. Choose an audio file instead.");
      inputs.audio.current?.click();
    }
  };
  const stopVoice = async () => {
    const note = await voice.stop();
    if (!note) return;
    if (note.durationMs < 1000) {
      toast.message("Hold the microphone to record.");
      return;
    }
    addFiles([note.file], note.durationMs, `Voice note · ${Math.round(note.durationMs / 1000)}s`);
  };
  const recording = voice.state === "recording";

  const attachItems: { key: keyof typeof inputs; label: string; accept: string; capture?: "environment"; Icon: typeof Camera }[] = [
    { key: "camera", label: "Camera", accept: PHOTO_TYPES, capture: "environment", Icon: Camera },
    { key: "gallery", label: "Photo", accept: PHOTO_TYPES, Icon: ImageIcon },
    { key: "pdf", label: "PDF", accept: "application/pdf", Icon: FileText },
    { key: "audio", label: "Audio", accept: AUDIO_TYPES, Icon: Music },
  ];

  const resolved = d.ticket.status === "resolved";

  return (
    <div className="shrink-0 bg-white border-t border-gray-200 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="px-3 sm:px-4 pt-3 space-y-2">
        {resolved && <p className="text-[11px] text-gray-500">This request is resolved. Replying reopens it.</p>}
        {onEnd && (
          <div className="flex justify-end">
            <button onClick={onEnd} className="text-xs font-medium text-red-600 hover:underline">End chat</button>
          </div>
        )}

        {showAttach && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="grid grid-cols-4 gap-2 pb-2 border-b border-gray-100 overflow-hidden"
          >
            {attachItems.map(({ key, label, accept, capture, Icon }) => (
              <button key={key} type="button" onClick={() => inputs[key].current?.click()} className="flex flex-col items-center gap-1.5 py-2 rounded-xl hover:bg-gray-50">
                <span className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", accent.soft)}>
                  <Icon className={cn("w-5 h-5", accent.text)} />
                </span>
                <span className="text-[11px] text-gray-600">{label}</span>
                <input
                  ref={inputs[key]}
                  type="file"
                  className="hidden"
                  accept={accept}
                  multiple={key !== "camera"}
                  {...(capture ? { capture } : {})}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
              </button>
            ))}
          </motion.div>
        )}

        {pending.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {pending.map((p) => (
              <li key={p.key} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-700">
                <span className="max-w-[160px] truncate" data-no-translate={p.label === p.file.name ? true : undefined}>{p.label}</span>
                <button type="button" aria-label="Remove file" onClick={() => setPending(pending.filter((x) => x.key !== p.key))}>
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2 pb-1">
          {!recording && (
            <button
              type="button"
              onClick={() => setShowAttach((v) => !v)}
              className={cn("p-2.5 rounded-full transition-colors", showAttach ? cn(accent.text, accent.soft) : "text-gray-500 hover:bg-gray-100")}
              aria-label="Attach a file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
          )}
          {recording ? (
            <div className="flex-1 min-w-0 flex items-center gap-3 rounded-full bg-red-50 px-4 py-2.5" role="status">
              <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-700 tabular-nums">{`${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")} / 2:00`}</span>
              <span className="flex-1 truncate text-xs text-red-700">Release to add the voice note</span>
              <button type="button" onClick={voice.cancel} className="text-xs font-medium text-red-700 underline">Cancel</button>
            </div>
          ) : (
            <textarea
              value={text}
              rows={1}
              maxLength={4000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Write your message…"
              aria-label="Your message"
              className="flex-1 min-w-0 max-h-32 resize-none px-4 py-2.5 bg-gray-100 rounded-2xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-300"
            />
          )}
          {!recording && (text.trim() || pending.length > 0) ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={Boolean(busy)}
              className={cn("p-3 rounded-full text-white shrink-0 disabled:opacity-60", accent.bg)}
              aria-label="Send"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          ) : (
            // Hold to record, release to add. The button stays mounted while recording and
            // captures the pointer, so the release always reaches it. A pointer click is
            // handled by the pointer events; a keyboard press (detail 0) toggles instead.
            <button
              type="button"
              aria-label={recording ? "Stop and add the voice note" : voice.state === "idle" ? "Hold to record a voice note" : "Choose an audio file"}
              onPointerDown={(e) => {
                if (e.button !== 0 || recording) return;
                e.preventDefault();
                if (voice.state === "idle") {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  void startVoice();
                } else {
                  inputs.audio.current?.click();
                }
              }}
              onPointerUp={() => { if (recording) void stopVoice(); }}
              onClick={(e) => {
                if (e.detail !== 0) return;
                if (recording) void stopVoice();
                else if (voice.state === "idle") void startVoice();
                else inputs.audio.current?.click();
              }}
              className={cn(
                "p-3 rounded-full shrink-0 select-none touch-none",
                recording ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>
        {busy && <p className="text-[11px] text-gray-500 pb-1">{busy}</p>}
      </div>
    </div>
  );
}
