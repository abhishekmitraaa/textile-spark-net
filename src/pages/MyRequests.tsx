import { Link } from "react-router-dom";
import { ChevronRight, Flag, Lightbulb, Loader2, MessageCircle, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { labelIn, useMyRequests, type MyRequest } from "@/lib/queries/support";
import { CallOrEmail, SignInForSupport, SupportFrame, useSupportSide } from "@/components/support/SupportFrame";

/** Every request this person has made, newest activity first (plan P3e). */
const ICONS: Record<MyRequest["channel"], typeof MessageCircle> = {
  chat: MessageCircle,
  callback: PhoneCall,
  fraud_report: Flag,
  feedback: Lightbulb,
};

const STATUS_TEXT: Record<MyRequest["status"], string> = {
  new: "Waiting for a reply",
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function MyRequests() {
  const { user, loading } = useAuth();
  const { accent } = useSupportSide();
  const mine = useMyRequests(Boolean(user));

  if (!loading && !user) {
    return (
      <SupportFrame title="My requests">
        <SignInForSupport title="Sign in to see your support requests." />
      </SupportFrame>
    );
  }

  return (
    <SupportFrame title="My requests">
      <div className="space-y-4" data-clarity-mask="True">
        {mine.isPending ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : mine.error ? (
          <p className="text-sm text-red-600">Your requests couldn't be loaded. Try again in a moment.</p>
        ) : (mine.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-5 space-y-3">
              <p className="text-sm font-semibold text-gray-900">No requests yet.</p>
              <p className="text-sm text-gray-600">When you chat with us, book a callback, report fraud or send feedback, it shows here.</p>
              <div className="flex flex-wrap gap-2">
                <Link to="/help/chat" className={cn("rounded-full px-4 py-2 text-sm font-semibold text-white", accent.bg, accent.hoverBg)}>Start a chat</Link>
                <Link to="/help" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">Back to Help</Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-gray-100">
                {(mine.data ?? []).map((r) => {
                  const Icon = ICONS[r.channel];
                  return (
                    <li key={r.id}>
                      <Link to={`/help/requests/${r.ticket_no}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                        <span className={cn("w-9 h-9 shrink-0 rounded-full flex items-center justify-center", accent.soft)}>
                          <Icon className={cn("w-4 h-4", accent.text)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900" data-no-translate>{r.subject}</span>
                          <span className="block text-[11px] text-gray-500">
                            {labelIn(r.category_label)} · {STATUS_TEXT[r.status]} · {WHEN.format(new Date(r.last_message_at))}
                          </span>
                        </span>
                        {r.unread && <span className={cn("w-2 h-2 shrink-0 rounded-full", accent.bg)} aria-label="New reply" />}
                        <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm text-gray-700">Need to talk to someone?</p>
            <CallOrEmail />
          </CardContent>
        </Card>
      </div>
    </SupportFrame>
  );
}
