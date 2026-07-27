import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, BadgeCheck, Star, MapPin, MessageCircle, Phone, Clock, DollarSign,
  Package, FlaskConical, Check, X, Star as StarIcon, ChevronRight,
} from "lucide-react";
import { fmtMoney, type QuoteStatus, type Rfq, type VendorQuote } from "@/lib/quotesData";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// A quote request raised from a product page goes to ONE vendor. There is no
// field of competing bids to compare, so this renders the request as a
// single-vendor conversation instead of the marketplace comparison screen
// (Compare mode, Best Price / Top Rated, "For:" tags) used for open RFQs.
//
// Visual language is deliberately inherited: header pattern from ChatThread,
// quote grid + action trio from ReceivedQuoteCard, cards/borders/motion from
// MyQuotes. Vendor-context blue (#256fef) marks "this is one named vendor",
// matching the vendor-side Direct Quote Requests panel.
// ─────────────────────────────────────────────────────────────

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const BLUE = "#256fef";

const STATUS_STYLES: Record<QuoteStatus, { label: string; cls: string }> = {
  pending: { label: "Pending your review", cls: "bg-blue-50 text-blue-600" },
  shortlisted: { label: "Shortlisted", cls: "bg-amber-50 text-amber-600" },
  accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-600" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-500" },
};

function StatCell({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-900">{children}</dd>
    </div>
  );
}

interface Props {
  rfq: Rfq;
  /** The target vendor's reply, or null while the request is still pending. */
  quote: VendorQuote | null;
  onBack: () => void;
  onChat: () => void;
  onCall: () => void;
  onStatus: (status: QuoteStatus) => void;
}

export default function DirectRequestThread({ rfq, quote, onBack, onChat, onCall, onStatus }: Props) {
  const reduced = useReducedMotion();
  const detail = rfq.direct;
  const vendorName = rfq.targetVendorName ?? "the vendor";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? undefined : { opacity: 0, x: -16 }}
      transition={{ duration: 0.28, ease: E }}
    >
      {/* ── Header: who this request went to ── */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} aria-label="Back to requests" className="-ml-1 p-1 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div
          className="w-10 h-10 rounded-full text-white flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: BLUE }}
        >
          {rfq.targetVendorInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[15px] font-bold text-gray-900 truncate leading-tight">{vendorName}</h1>
            {rfq.targetVendorVerified && <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-0.5 font-semibold text-gray-700">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {rfq.targetVendorRating.toFixed(1)}
            </span>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3 shrink-0" /> {rfq.targetVendorLocation}
            </span>
          </div>
        </div>
        <button
          onClick={onChat}
          aria-label={`Chat with ${vendorName}`}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center shrink-0 text-gray-600 hover:border-gray-300 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
        </button>
        <button
          onClick={onCall}
          aria-label={`Call ${vendorName}`}
          className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 hover:bg-emerald-600 transition-colors"
        >
          <Phone className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* ── Direct-request marker ── */}
      <div
        className="rounded-xl px-3.5 py-2.5 mb-3"
        style={{ backgroundColor: `${BLUE}0d`, border: `1px solid ${BLUE}26` }}
      >
        <p className="text-[11px] font-semibold" style={{ color: BLUE }}>Direct request</p>
        {/* Vendor name is kept mid-sentence: brand names often end in a period
            ("Demo Textiles Co."), which doubles up at a sentence boundary. */}
        <p className="text-xs text-gray-600 mt-0.5">
          Sent to {vendorName} only. No other vendor can see or quote on it.
        </p>
      </div>

      {/* ── What was requested ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-snug">{rfq.productName}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Requested {detail?.sentAgo ?? rfq.date}</p>
          </div>
          {rfq.image && (
            <img src={rfq.image} alt="" className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" />
          )}
        </div>

        <dl className="mt-3 space-y-1.5 text-xs">
          <DetailRow label="Quantity">
            <span className="font-semibold">{rfq.units.toLocaleString("en-IN")} pieces</span>
            {detail && detail.sizes.length > 0 && (
              <span className="text-gray-600">
                {" "}({detail.sizes.map((s) => `${s.size} x ${s.quantity}`).join(", ")})
              </span>
            )}
          </DetailRow>
          {detail && detail.colors.length > 0 && (
            <DetailRow label="Colour"><span className="font-semibold">{detail.colors.join(", ")}</span></DetailRow>
          )}
          {(rfq.priceMin > 0 || rfq.priceMax > 0) && (
            <DetailRow label="Budget">
              <span className="font-semibold">₹{rfq.priceMin}–₹{rfq.priceMax}</span> / unit
            </DetailRow>
          )}
          {detail?.customizationRequested && (
            <DetailRow label="Custom">
              <span className="font-semibold">{detail.customizationNotes || "Requested"}</span>
              {detail.customizationImages.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {detail.customizationImages.map((src, i) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      <img
                        src={src}
                        alt={`Reference ${i + 1}`}
                        className="w-12 h-12 rounded-md border border-gray-200 object-cover"
                      />
                    </a>
                  ))}
                </span>
              )}
            </DetailRow>
          )}
        </dl>
      </div>

      {/* ── The reply, or the wait ── */}
      {!quote ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
          <span className="mx-auto mb-3 flex w-10 h-10 items-center justify-center rounded-full bg-gray-50">
            <Clock className="w-5 h-5 text-gray-400" />
          </span>
          <p className="text-sm font-semibold text-gray-700">Waiting for {vendorName} to reply</p>
          <p className="text-xs text-gray-400 mt-1">
            Sent {detail?.sentAgo ?? "recently"}. You will see the quote here and in your chat.
          </p>
          <button
            onClick={onChat}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors hover:bg-[#256fef]/5"
            style={{ borderColor: BLUE, color: BLUE }}
          >
            <MessageCircle className="w-3.5 h-3.5" /> Continue in chat
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Their quote</h2>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_STYLES[quote.status].cls)}>
              {STATUS_STYLES[quote.status].label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-3 gap-x-4 rounded-xl bg-gray-50 p-3 mt-3">
            <StatCell icon={DollarSign} label="Price/Unit" value={fmtMoney(quote.currency, quote.pricePerUnit)} />
            <StatCell icon={Package} label="MOQ" value={`${quote.moq.toLocaleString()} units`} />
            <StatCell icon={Clock} label="Lead Time" value={quote.leadTime} />
            <StatCell icon={FlaskConical} label="Sampling" value={fmtMoney(quote.currency, quote.sampling)} />
          </div>

          {quote.comment && (
            <p className="mt-3 rounded-lg bg-blue-50/60 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
              {quote.comment}
            </p>
          )}

          <button
            onClick={onChat}
            className="mt-3 w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3.5 py-2.5 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Continue in chat
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </button>

          {quote.status === "pending" && (
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <button onClick={() => onStatus("rejected")} className="flex items-center justify-center gap-1 rounded-lg bg-red-500 text-white py-2 text-xs font-bold hover:bg-red-600 transition-colors">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
              <button onClick={() => onStatus("shortlisted")} className="flex items-center justify-center gap-1 rounded-lg border border-amber-300 text-amber-600 py-2 text-xs font-bold hover:bg-amber-50 transition-colors">
                <StarIcon className="w-3.5 h-3.5" /> Shortlist
              </button>
              <button onClick={() => onStatus("accepted")} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white py-2 text-xs font-bold hover:bg-emerald-700 transition-colors">
                <Check className="w-3.5 h-3.5" /> Accept
              </button>
            </div>
          )}
          {quote.status === "shortlisted" && (
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <button onClick={() => onStatus("rejected")} className="flex items-center justify-center gap-1 rounded-lg bg-red-500 text-white py-2 text-xs font-bold hover:bg-red-600 transition-colors">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
              <button onClick={() => onStatus("accepted")} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white py-2 text-xs font-bold hover:bg-emerald-700 transition-colors">
                <Check className="w-3.5 h-3.5" /> Accept Quote
              </button>
            </div>
          )}

          <p className="mt-2.5 text-[11px] text-gray-400">Replied {quote.submittedAgo}</p>
        </div>
      )}
    </motion.div>
  );
}
