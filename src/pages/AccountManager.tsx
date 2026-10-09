import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { CalendarClock, Loader2, Send, Sparkles, Star, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/errorMessage";
import {
  WINDOW_LABEL, cancelCallback, markAccountManagerRead, requestCallback, sendToAccountManager, useAccountManagerRefresh,
  useAmMessages, useAmNotes, useMyAccountManager, type CallWindow,
} from "@/lib/queries/accountManager";

// Account manager (subscriptions P9; Silver and above): who at Cosora looks after this vendor,
// a thread with them, a call back at a time the vendor picks, and on VIP the requirements the
// manager picks for them and the monthly success review. Silver is looked after by the Cosora
// account team; Gold and VIP by a named manager once one is assigned.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:outline-none focus:border-brand-vendor focus:ring-1 focus:ring-brand-vendor/20";

/** Today in India, as YYYY-MM-DD, plus `days`. */
function istDate(days = 0): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export default function AccountManager() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: me, isLoading } = useMyAccountManager(user?.id);
  const { data: messages = [] } = useAmMessages(user?.id);
  const vip = Boolean(me?.concierge);
  const { data: notes = [] } = useAmNotes(user?.id, vip);
  const refresh = useAccountManagerRefresh();
  const [tab, setTab] = useState("messages");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [call, setCall] = useState<{ date: string; window: CallWindow; note: string }>({ date: istDate(1), window: "morning", note: "" });
  const end = useRef<HTMLDivElement>(null);

  // Reading the thread marks it read.
  useEffect(() => {
    if (tab === "messages" && me && me.unread > 0) markAccountManagerRead().then(() => refresh()).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me?.unread]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    if (busy) return false;
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error("Couldn't send that", { description: errorMessage(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const named = me?.manager;
  const who = named ? named.name : "Your Cosora account team";
  const concierge = notes.filter((n) => n.kind === "concierge");
  const reviews = notes.filter((n) => n.kind === "success_review");

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section} className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 lg:p-5" data-testid="am-header">
          {named?.photo ? (
            <img src={named.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-vendor/10 text-brand-vendor">
              {named ? <span className="text-lg font-bold">{named.name.slice(0, 1)}</span> : <Users className="h-6 w-6" aria-hidden />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{named ? "Your account manager" : "Account manager"}</p>
            <h1 className="text-xl font-semibold text-foreground" data-no-translate={named ? true : undefined}>{who}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {vip
                ? "Help with your plan, your catalogue and your leads, requirements picked for you, and a review each month."
                : "Help with your plan, your catalogue and your leads. Write here, or ask for a call."}
            </p>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <motion.div variants={section}>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
                <TabsTrigger value="messages">{me && me.unread > 0 ? `Messages (${me.unread})` : "Messages"}</TabsTrigger>
                <TabsTrigger value="call">Call me back</TabsTrigger>
                {vip && <TabsTrigger value="concierge">Picked for you</TabsTrigger>}
                {vip && <TabsTrigger value="reviews">Monthly reviews</TabsTrigger>}
              </TabsList>

              <TabsContent value="messages">
                <div className="rounded-2xl border border-gray-200 bg-white p-3 lg:p-4">
                  <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1" data-testid="am-messages">
                    {messages.length === 0 && (
                      <p className="py-6 text-center text-sm text-gray-500">{`Write to ${named ? named.name : "your account team"}: a question about your plan, your catalogue or a lead.`}</p>
                    )}
                    {messages.map((m) => (
                      <div key={m.id} className={m.authorKind === "vendor" ? "ml-10 text-right" : "mr-10"}>
                        <div className={`inline-block max-w-full rounded-2xl px-3.5 py-2 text-left text-sm ${m.authorKind === "vendor" ? "bg-brand-vendor text-white" : "bg-gray-100 text-gray-900"}`}>
                          <p className="whitespace-pre-wrap break-words" data-no-translate>{m.body}</p>
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {m.authorKind === "vendor" ? "You" : <span data-no-translate>{m.authorLabel}</span>}{` · ${WHEN.format(new Date(m.createdAt))}`}
                        </p>
                      </div>
                    ))}
                    <div ref={end} />
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <textarea aria-label="Message" className={input} rows={2} maxLength={4000} placeholder="Write a message" value={body} onChange={(e) => setBody(e.target.value)} />
                    <button type="button" disabled={!body.trim() || busy === "send"} data-testid="am-send"
                      onClick={async () => { if (await run("send", () => sendToAccountManager(body.trim()))) setBody(""); }}
                      className="inline-flex items-center gap-1.5 self-end rounded-lg bg-brand-vendor px-3.5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
                      {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                    </button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="call">
                <div className="max-w-lg rounded-2xl border border-gray-200 bg-white p-4" data-testid="am-call">
                  {me?.callback ? (
                    <>
                      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><CalendarClock className="h-4 w-4 text-brand-vendor" /> Your call is booked</p>
                      <p className="mt-1 text-sm text-gray-700">{`${DAY.format(new Date(`${me.callback.date}T00:00:00`))}, ${WINDOW_LABEL[me.callback.window]} (IST)`}</p>
                      {me.callback.note && <p className="mt-1 text-xs text-gray-500" data-no-translate>{me.callback.note}</p>}
                      <button type="button" disabled={busy === "cancel"} onClick={() => run("cancel", () => cancelCallback(me.callback!.id), "Call cancelled")}
                        className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        Cancel this call
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">{`Choose when ${named ? named.name : "your account team"} should call you, on the number in your settings.`}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="am-call-date" className="mb-1 block text-xs font-semibold text-gray-500">Day</label>
                          <input id="am-call-date" type="date" className={input} min={istDate(0)} max={istDate(30)} value={call.date}
                            onChange={(e) => setCall((c) => ({ ...c, date: e.target.value }))} />
                        </div>
                        <div>
                          <label htmlFor="am-call-window" className="mb-1 block text-xs font-semibold text-gray-500">Time</label>
                          <select id="am-call-window" className={input} value={call.window} onChange={(e) => setCall((c) => ({ ...c, window: e.target.value as CallWindow }))}>
                            {(Object.keys(WINDOW_LABEL) as CallWindow[]).map((w) => <option key={w} value={w}>{WINDOW_LABEL[w]}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="am-call-note" className="mb-1 block text-xs font-semibold text-gray-500">What it's about (optional)</label>
                        <input id="am-call-note" className={input} maxLength={280} value={call.note} onChange={(e) => setCall((c) => ({ ...c, note: e.target.value }))} />
                      </div>
                      <button type="button" disabled={!call.date || busy === "book"} data-testid="am-book-call"
                        onClick={() => run("book", () => requestCallback(call.date, call.window, call.note.trim()), "Call booked")}
                        className="rounded-lg bg-brand-vendor px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
                        Book the call
                      </button>
                    </div>
                  )}
                </div>
              </TabsContent>

              {vip && (
                <TabsContent value="concierge">
                  <div className="space-y-2" data-testid="am-concierge">
                    {concierge.length === 0 && (
                      <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">When your manager spots a requirement that suits you, it appears here with why.</p>
                    )}
                    {concierge.map((n) => (
                      <div key={n.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-vendor"><Sparkles className="h-3.5 w-3.5" /> {`Picked by ${n.authorLabel}`}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900" data-no-translate>{n.body}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                          <span>{WHEN.format(new Date(n.createdAt))}</span>
                          {n.rfqId && <Link to="/leads" className="font-semibold text-brand-vendor hover:underline">Open my leads</Link>}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}
              {vip && (
                <TabsContent value="reviews">
                  <div className="space-y-2" data-testid="am-reviews">
                    {reviews.length === 0 && (
                      <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">Your manager writes a review of each month here: quotes, wins and what to try next.</p>
                    )}
                    {reviews.map((n) => (
                      <div key={n.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Star className="h-3.5 w-3.5" /> {n.period ? MONTH.format(new Date(`${n.period}T00:00:00`)) : ""}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900" data-no-translate>{n.body}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
