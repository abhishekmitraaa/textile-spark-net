import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Bug, CheckCircle2, Lightbulb, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitFeedback, supportError, useSupportStatus } from "@/lib/queries/support";
import { SignInForSupport, SupportFrame, SupportUnavailable, useSupportSide } from "@/components/support/SupportFrame";

/**
 * App feedback: a bug or an idea (plan P3d). Each one is stored with an ID the
 * person sees here and in My requests; the team marks it read in Cosora-Admin.
 * An email receipt comes later (P6, once Resend is set up), so nothing here says
 * one was sent.
 */
export default function AppFeedback() {
  const { user, loading } = useAuth();
  const status = useSupportStatus(user?.id);
  if (!loading && !user) {
    return (
      <SupportFrame title="App feedback">
        <SignInForSupport title="Sign in to send feedback." />
      </SupportFrame>
    );
  }
  if (loading || status.isPending) {
    return (
      <SupportFrame title="App feedback">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </SupportFrame>
    );
  }
  if (!status.data?.available) {
    return (
      <SupportFrame title="App feedback">
        <SupportUnavailable title="Sending feedback in the app isn't available yet." subject="App feedback" />
      </SupportFrame>
    );
  }
  return <FeedbackForm />;
}

function FeedbackForm() {
  const { accent } = useSupportSide();
  const location = useLocation();
  // The page they came from, when a link passed it (state.from), so the team can find the bug.
  const from = (location.state as { from?: string } | null)?.from ?? null;
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    if (!body.trim()) return toast.error("Write your feedback first.");
    setBusy(true);
    try {
      const r = await submitFeedback({ kind, body, page: from });
      setDone(r.ticket_no);
    } catch (e) {
      toast.error(supportError(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <SupportFrame title="App feedback">
        <Card>
          <CardContent className="p-5 space-y-3 text-center">
            <CheckCircle2 className={cn("w-10 h-10 mx-auto", accent.text)} />
            <p className="text-base font-semibold text-gray-900">Thanks. The team reads every note.</p>
            <p className="text-sm text-gray-600">{`We've recorded it as ${done}.`}</p>
            <p className="text-sm text-gray-600">You'll see it, and any reply, in My requests.</p>
            <div className="flex justify-center gap-2">
              <Link to="/help/requests" className={cn("rounded-full px-4 py-2 text-sm font-semibold text-white", accent.bg, accent.hoverBg)}>My requests</Link>
              <button type="button" onClick={() => { setDone(null); setBody(""); }} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700">
                Send another
              </button>
            </div>
          </CardContent>
        </Card>
      </SupportFrame>
    );
  }

  const choice = (k: "bug" | "idea", Icon: typeof Bug, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === k}
      onClick={() => setKind(k)}
      className={cn(
        "flex-1 rounded-xl border p-3 text-left transition-colors",
        kind === k ? cn(accent.border, accent.soft) : "border-gray-200 bg-white",
      )}
    >
      <Icon className={cn("w-5 h-5 mb-1", kind === k ? accent.text : "text-gray-500")} />
      <span className="block text-sm font-semibold text-gray-900">{label}</span>
      <span className="block text-[11px] text-gray-500">{hint}</span>
    </button>
  );

  return (
    <SupportFrame title="App feedback">
      <Card data-clarity-mask="True">
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-2" role="radiogroup" aria-label="Kind of feedback">
            {choice("bug", Bug, "Report a bug", "Something isn't working")}
            {choice("idea", Lightbulb, "Suggest an idea", "Something you'd like")}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="feedback-body" className="text-sm font-semibold text-gray-900">
              {kind === "bug" ? "What went wrong?" : "What's your idea?"}
            </label>
            <textarea
              id="feedback-body"
              value={body}
              rows={6}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kind === "bug" ? "What you did, what you expected, and what happened instead." : "What would make Cosora better for you?"}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <Button onClick={() => void submit()} disabled={busy} className={cn("w-full h-11 text-white", accent.bg, accent.hoverBg)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send feedback"}
          </Button>
        </CardContent>
      </Card>
    </SupportFrame>
  );
}
