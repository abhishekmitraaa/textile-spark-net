import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/** Which review table the review is in: reviews, product_reviews or service_reviews. */
export type ReviewKind = "store" | "product" | "service";

interface ReportReason { code: string; label: string }

const NOTE_MAX = 500;

/**
 * "Report" on a review, and the sheet it opens (2026-10-13).
 *
 * The database decides everything: `report_review()` refuses a signed-out caller,
 * the review's own author and an unknown reason, keeps one open report per account
 * per review, and answers `rate_limited` after ten in a day. The reasons come from
 * `review_report_reasons()`, the one list Cosora-Admin reads too.
 *
 * Renders nothing for a signed-out visitor or on the viewer's own review: a control
 * that can only be refused isn't shown. What happens to a report is not sent back,
 * so the confirmation promises a look, not an outcome.
 */
export function ReportReviewButton({
  kind,
  reviewId,
  authorId,
  accent = "buyer",
  className,
}: {
  kind: ReviewKind;
  reviewId: string;
  /** The review's author, to hide the control on the viewer's own review. */
  authorId?: string | null;
  /** The side this sits on: buyer coral or seller blue. */
  accent?: "buyer" | "vendor";
  className?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [reported, setReported] = useState(false);

  const reasons = useQuery({
    queryKey: ["review-report-reasons"],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<ReportReason[]> => {
      const { data, error } = await supabase.rpc("review_report_reasons");
      if (error) throw error;
      return (data ?? []) as ReportReason[];
    },
  });

  if (!user || (authorId && authorId === user.id)) return null;

  const close = () => {
    setOpen(false);
    setReason("");
    setNote("");
  };

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.rpc("report_review", {
        p_kind: kind,
        p_review_id: reviewId,
        p_reason: reason,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      if (data === "rate_limited") {
        toast.error("You've reported several reviews today", { description: "Try again tomorrow." });
        return;
      }
      setReported(true);
      toast.success(data === "already_reported" ? "You've already reported this review" : "Review reported", {
        description: "Cosora's team will take a look.",
      });
      close();
    } catch (e) {
      toast.error("Couldn't report this review", { description: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const accentText = accent === "vendor" ? "text-brand-vendor" : "text-brand-buyer";
  const accentBg = accent === "vendor" ? "bg-brand-vendor hover:bg-brand-vendor/90" : "bg-brand-buyer hover:bg-brand-buyer/90";

  return (
    <>
      <button
        type="button"
        disabled={reported}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-default disabled:hover:text-gray-400",
          className,
        )}
      >
        <Flag className="h-3 w-3" />
        {reported ? "Reported" : "Report"}
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report this review</DialogTitle>
            <DialogDescription>Tell Cosora what's wrong with it. The person who wrote it isn't told who reported.</DialogDescription>
          </DialogHeader>

          {reasons.isPending ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}
            </div>
          ) : reasons.error ? (
            <p className="text-sm text-gray-600">The reasons couldn't be loaded. Close this and try again.</p>
          ) : (
            <div className="space-y-3">
              <div role="radiogroup" aria-label="Reason" className="space-y-2">
                {(reasons.data ?? []).map((r) => (
                  <label
                    key={r.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm text-gray-800",
                      reason === r.code ? "border-gray-900 bg-gray-50" : "border-gray-200",
                    )}
                  >
                    <input
                      type="radio"
                      name="review-report-reason"
                      value={r.code}
                      checked={reason === r.code}
                      onChange={() => setReason(r.code)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              <div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                  placeholder="Add a note (optional)"
                  rows={3}
                  aria-label="Note"
                />
                <p className={cn("mt-1 text-right text-[11px]", note.length >= NOTE_MAX ? accentText : "text-gray-400")}>
                  {note.length}/{NOTE_MAX}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="button" className={cn("text-white", accentBg)} disabled={!reason || sending} onClick={send}>
              {sending ? "Sending…" : "Report review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
