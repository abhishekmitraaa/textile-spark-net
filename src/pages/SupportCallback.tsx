import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchMyContactInfo } from "@/lib/queries/myContact";
import {
  istDayLabel, labelIn, requestCallback, supportError, useCallbackSlots, useSupportStatus, useSupportTopics, type CallbackSlot,
} from "@/lib/queries/support";
import { useLang } from "@/lib/i18n";
import { SignInForSupport, SupportFrame, SupportUnavailable, useSupportSide } from "@/components/support/SupportFrame";

/**
 * Book a callback from Cosora Support (plan P3d). One-hour windows inside support
 * hours, from 30 minutes ahead, over the next 7 days (support_callback_slots). One
 * pending callback at a time. Staff call from their phone and record the outcome,
 * which shows in the request's thread.
 */

export default function SupportCallback() {
  const { user, loading } = useAuth();
  const status = useSupportStatus(user?.id);
  if (!loading && !user) {
    return (
      <SupportFrame title="Request a callback">
        <SignInForSupport title="Sign in to book a callback." />
      </SupportFrame>
    );
  }
  if (loading || status.isPending) {
    return (
      <SupportFrame title="Request a callback">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </SupportFrame>
    );
  }
  if (!status.data?.available) {
    return (
      <SupportFrame title="Request a callback">
        <SupportUnavailable title="Booking a callback in the app isn't available yet." subject="Callback request" />
      </SupportFrame>
    );
  }
  return <CallbackForm />;
}

function CallbackForm() {
  const { side, accent } = useSupportSide();
  useLang(); // the days follow the language (istDayLabel)
  const topics = useSupportTopics(side, "callback");
  const slots = useCallbackSlots(true);
  const [topic, setTopic] = useState("");
  const [phone, setPhone] = useState("");
  const [slot, setSlot] = useState<CallbackSlot | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ticket_no: string; when: string } | null>(null);

  // Start from the number on the account; the person can change it.
  useEffect(() => {
    void fetchMyContactInfo().then((c) => { if (c.phone) setPhone((p) => p || c.phone!); }).catch(() => undefined);
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, CallbackSlot[]>();
    for (const s of slots.data ?? []) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m.entries()];
  }, [slots.data]);

  const submit = async () => {
    if (!topic) return toast.error("Choose what it's about.");
    if (!phone.trim()) return toast.error("Give the number we should call.");
    if (!slot) return toast.error("Choose a time.");
    setBusy(true);
    try {
      const r = await requestCallback({ category: topic, phone, date: slot.date, start: slot.start, note });
      setDone({ ticket_no: r.ticket_no, when: `${istDayLabel(r.date)}, ${r.start}–${r.end} IST` });
    } catch (e) {
      toast.error(supportError(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <SupportFrame title="Request a callback">
        <Card>
          <CardContent className="p-5 space-y-3 text-center">
            <CheckCircle2 className={cn("w-10 h-10 mx-auto", accent.text)} />
            <p className="text-base font-semibold text-gray-900">{`Callback booked for ${done.when}.`}</p>
            <p className="text-sm text-gray-600">{`Your request number is ${done.ticket_no}.`}</p>
            <p className="text-sm text-gray-600">We'll call the number you gave. What happened on the call shows in My requests.</p>
            <Link to={`/help/requests/${done.ticket_no}`} className={cn("inline-block rounded-full px-4 py-2 text-sm font-semibold text-white", accent.bg, accent.hoverBg)}>
              See the request
            </Link>
          </CardContent>
        </Card>
      </SupportFrame>
    );
  }

  return (
    <SupportFrame title="Request a callback">
      <Card data-clarity-mask="True">
        <CardContent className="p-4 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">What's it about?</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Topic">
              {(topics.data ?? []).map((t) => (
                <button
                  key={t.code}
                  type="button"
                  role="radio"
                  aria-checked={topic === t.code}
                  onClick={() => setTopic(t.code)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    topic === t.code ? cn(accent.bg, "border-transparent text-white") : "border-gray-200 bg-white text-gray-700",
                  )}
                >
                  {labelIn(t.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="callback-phone" className="text-sm font-semibold text-gray-900">Number to call</label>
            <Input id="callback-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" className="h-11" />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">When should we call?</p>
            {slots.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : byDay.length === 0 ? (
              <p className="text-sm text-gray-600">No times are free in the next week. Call or email us instead.</p>
            ) : (
              <div className="space-y-3">
                {byDay.map(([date, list]) => (
                  <div key={date}>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">{istDayLabel(date)}</p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={istDayLabel(date)}>
                      {list.map((s) => {
                        const on = slot?.date === s.date && slot.start === s.start;
                        return (
                          <button
                            key={s.start}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setSlot(s)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums",
                              on ? cn(accent.bg, "border-transparent text-white") : "border-gray-200 bg-white text-gray-700",
                            )}
                          >
                            {s.start}–{s.end}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-gray-500">Times are IST.</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="callback-note" className="text-sm font-semibold text-gray-900">Anything we should know first? (optional)</label>
            <textarea
              id="callback-note"
              value={note}
              rows={3}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <Button onClick={() => void submit()} disabled={busy} className={cn("w-full h-11 text-white", accent.bg, accent.hoverBg)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Book the callback"}
          </Button>
        </CardContent>
      </Card>
    </SupportFrame>
  );
}
