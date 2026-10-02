import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errorMessage";
import { formatINR } from "@/lib/plan";
import { requestRefundGuarantee, useRefundGuarantee } from "@/lib/queries/subscriptions";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * The 7-day money-back guarantee on /subscription (2026-10-02).
 *
 * The Subscription FAQ promises: "We offer a 7-day money-back guarantee for
 * first-time subscribers. If you're not satisfied, contact us for a full refund."
 * This is the "contact us": a seller whose first payment is under 7 days old asks
 * here, and Cosora's finance team refunds each payment through Razorpay, after which
 * the plan ends (refund_guarantee_request / admin_refund_guarantee_close).
 *
 * Shows only while it means something: an open offer, a request in progress, or a
 * finished refund. A demo checkout took no money, so it offers nothing back.
 */
export function RefundGuaranteeCard({ vendorId }: { vendorId: string | undefined }) {
  const qc = useQueryClient();
  const { data: g } = useRefundGuarantee(vendorId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!g) return null;
  const offered = g.eligible;
  const requested = g.reason === "requested";
  const closed = g.reason === "closed";
  if (!offered && !requested && !closed) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await requestRefundGuarantee(reason);
      await qc.invalidateQueries({ queryKey: ["refund_guarantee"] });
      setOpen(false);
      toast.success("Refund requested", {
        description: "Our team refunds it to the card or account you paid with, and your plan ends then.",
      });
    } catch (e) {
      toast.error("Couldn't send your request", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-brand-success/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">7-day money-back guarantee</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {offered && g.deadline
                ? `Not satisfied? You can ask for a full refund of ${formatINR(g.totalRupees)} until ${DAY.format(new Date(g.deadline))}.`
                : requested && g.requestedAt
                  ? `You asked for a refund of ${formatINR(g.totalRupees)} on ${DAY.format(new Date(g.requestedAt))}. Our team refunds it to the card or account you paid with, and your plan ends then.`
                  : closed && g.closedAt
                    ? `We refunded ${formatINR(g.totalRupees)} on ${DAY.format(new Date(g.closedAt))}. A refund usually reaches your account in 5–7 working days.`
                    : null}
            </p>
          </div>
        </div>
        {offered && (
          <Button variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
            Request a refund
          </Button>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a full refund</DialogTitle>
            <DialogDescription>
              {`We refund ${formatINR(g.totalRupees)} to the card or account you paid with, and your plan ends then. You can ask once.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="refund-reason" className="text-sm font-medium text-foreground">What didn't work for you? (optional)</label>
            <textarea
              id="refund-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request the refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
