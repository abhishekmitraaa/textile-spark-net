import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, MessageCircle, ShieldCheck, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CHAT_MONITORING_NOTICE } from "@/lib/chatData";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  labelIn, resolveTopic, startChat, supportError, useMyRequests, useSupportStatus, useSupportTopics,
} from "@/lib/queries/support";
import { HoursBanner, SignInForSupport, SupportFrame, SupportUnavailable, useSupportSide } from "@/components/support/SupportFrame";

/**
 * Start a chat with Cosora Support, or carry on an open one (plan P3b).
 *
 * A link from elsewhere in the app can name the topic and the item it's about
 * (`?category=vendor_kyc&entity_type=kyc&entity_id=…`, lib/supportContact.ts). A topic
 * that's switched off, or for the other side, is ignored and the person picks one.
 * Starting again on a topic with an open chat continues that chat (the database
 * decides, support_start_chat).
 */
export default function SupportChatStart() {
  const { user, loading } = useAuth();
  const status = useSupportStatus(user?.id);

  if (!loading && !user) {
    return (
      <SupportFrame title="Chat with Cosora Support">
        <SignInForSupport title="Sign in to chat with Cosora Support." />
      </SupportFrame>
    );
  }
  if (loading || status.isPending) {
    return (
      <SupportFrame title="Chat with Cosora Support">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </SupportFrame>
    );
  }
  if (!status.data?.available) {
    return (
      <SupportFrame title="Chat with Cosora Support">
        <SupportUnavailable title="Chat with Cosora Support isn't available in the app yet." />
      </SupportFrame>
    );
  }
  return <StartForm userId={user!.id} />;
}

function StartForm({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { side, accent } = useSupportSide();
  const status = useSupportStatus(userId);
  const topics = useSupportTopics(side, "chat");
  const mine = useMyRequests(true);
  const [topic, setTopic] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const entityType = params.get("entity_type");
  const entityId = params.get("entity_id");

  // The topic a link asked for, once the topics have loaded.
  useEffect(() => {
    if (topic || !topics.data) return;
    const asked = resolveTopic(params.get("category"), side, topics.data);
    if (asked) setTopic(asked);
  }, [topics.data, params, side, topic]);

  const openChats = (mine.data ?? []).filter((r) => r.channel === "chat" && (r.status === "new" || r.status === "open"));

  const start = async () => {
    if (!topic) {
      toast.error("Choose what it's about.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write your message.");
      return;
    }
    setBusy(true);
    try {
      const r = await startChat({ category: topic, body, entityType, entityId });
      navigate(`/help/requests/${r.ticket_no}`, { replace: true });
    } catch (e) {
      toast.error(supportError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SupportFrame title="Chat with Cosora Support">
      <div className="space-y-4" data-clarity-mask="True">
        <HoursBanner status={status.data} />

        {openChats.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-900">Your open chats</p>
              <ul className="divide-y divide-gray-100">
                {openChats.map((r) => (
                  <li key={r.id}>
                    <Link to={`/help/requests/${r.ticket_no}`} className="flex items-center gap-3 py-2.5">
                      <MessageCircle className={cn("w-4 h-4 shrink-0", accent.text)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-900" data-no-translate>{r.subject}</span>
                        <span className="block text-[11px] text-gray-500">{labelIn(r.category_label)}</span>
                      </span>
                      {r.unread && <span className={cn("w-2 h-2 rounded-full", accent.bg)} aria-label="New reply" />}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">What's it about?</p>
              {topics.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Topic">
                  {(topics.data ?? []).map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      role="radio"
                      aria-checked={topic === t.code}
                      onClick={() => setTopic(t.code)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        topic === t.code ? cn(accent.bg, "border-transparent text-white") : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                      )}
                    >
                      {labelIn(t.label)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="support-first-message" className="text-sm font-semibold text-gray-900">Your message</label>
              <textarea
                id="support-first-message"
                value={body}
                rows={5}
                maxLength={4000}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Tell us what happened and what you need. You can add photos, PDFs and voice notes in the chat."
                className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 leading-snug">{CHAT_MONITORING_NOTICE}</p>
            </div>
            <Button onClick={() => void start()} disabled={busy} className={cn("w-full h-11 text-white", accent.bg, accent.hoverBg)}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start chat"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </SupportFrame>
  );
}
