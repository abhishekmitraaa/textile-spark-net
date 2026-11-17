import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MySubmittedQuote } from "@/lib/queries/rfqs";
import { priceText } from "@/lib/currency";

const STATUS_LABEL: Record<MySubmittedQuote["status"], string> = {
  awaiting: "Waiting for the buyer",
  in_negotiation: "Shortlisted by the buyer",
  accepted: "Accepted",
  not_selected: "Not selected",
};

function Row({ label, children, userText = false }: { label: string; children: React.ReactNode; userText?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-gray-900 break-words" data-no-translate={userText || undefined}>{children}</dd>
    </div>
  );
}

/**
 * The quote a seller sent and the request it answers, read-only (Seller Home audit SH-082; Mitra, 2026-11-17, "View
 * only"). Changing a price stays a conversation in chat. "View quote" and "View RFQ" used to open nothing.
 */
export function QuoteDetailDialog({ quote, onClose }: { quote: MySubmittedQuote | null; onClose: () => void }) {
  return (
    <Dialog open={quote !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" data-testid="quote-detail">
        {quote && (
          <>
            <DialogHeader>
              <DialogTitle>Your quote</DialogTitle>
              <DialogDescription>{quote.quoteCode} · {STATUS_LABEL[quote.status]}</DialogDescription>
            </DialogHeader>
            <dl className="divide-y divide-gray-100">
              <Row label="Price per unit">{priceText("₹", quote.pricePerUnit)}</Row>
              <Row label="MOQ">{quote.moq}</Row>
              <Row label="Lead time" userText>{quote.leadTime}</Row>
              <Row label="Sent">{quote.submittedDate}</Row>
              {quote.lastUpdated !== quote.submittedDate && <Row label="Last changed">{quote.lastUpdated}</Row>}
            </dl>
            {quote.comment && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-500">Your message</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-800" data-no-translate>{quote.comment}</p>
              </div>
            )}

            <h3 className="pt-2 text-sm font-bold text-gray-900">The request</h3>
            {quote.image && <img src={quote.image} alt="" className="h-36 w-full rounded-xl object-cover" />}
            <dl className="divide-y divide-gray-100">
              <Row label="Request" userText>{quote.rfqTitle}</Row>
              <Row label="Buyer" userText>{quote.buyerName}</Row>
              <Row label="Quantity">{quote.pcs}</Row>
              <Row label="Reference">{quote.rfqCode}</Row>
              <Row label="Quotes received">{quote.totalQuotes}</Row>
              {quote.requestStatus && (
                <Row label="Status">{quote.requestStatus === "active" ? "Open" : "Closed"}</Row>
              )}
            </dl>
            <p className="text-xs leading-relaxed text-gray-500">
              To change the price or terms, talk it through with the buyer in chat.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
