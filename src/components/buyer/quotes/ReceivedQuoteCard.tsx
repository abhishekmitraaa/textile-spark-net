import {
  BadgeCheck, Star, MapPin, Clock, DollarSign, Package, FlaskConical,
  MessageCircle, Phone, Eye, X, Star as StarIcon, Check,
} from "lucide-react";
import { fmtMoney, type QuoteStatus, type VendorQuote } from "@/lib/quotesData";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<QuoteStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-blue-50 text-blue-600" },
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

interface Props {
  quote: VendorQuote;
  forProduct: string;
  compareMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onChat: () => void;
  onCall: () => void;
  onDetails: () => void;
  onStatus: (status: QuoteStatus) => void;
}

export default function ReceivedQuoteCard({
  quote: q, forProduct, compareMode, selected, onToggleSelect, onChat, onCall, onDetails, onStatus,
}: Props) {
  const status = STATUS_STYLES[q.status];

  return (
    <div className={cn(
      "rounded-2xl border bg-white p-4 transition-colors",
      compareMode && selected ? "border-[#ef4d62] ring-1 ring-[#ef4d62]" : "border-gray-200"
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        {compareMode && (
          <button
            onClick={onToggleSelect}
            aria-label={selected ? "Deselect" : "Select for comparison"}
            className={cn(
              "mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
              selected ? "bg-[#ef4d62] border-[#ef4d62]" : "border-gray-300"
            )}
          >
            {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </button>
        )}
        <div className="w-11 h-11 rounded-full bg-[#256fef] text-white flex items-center justify-center text-sm font-bold shrink-0">
          {q.vendorInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-gray-900 truncate">{q.vendorName}</h3>
          </div>
          {q.verified && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
              <BadgeCheck className="w-3.5 h-3.5" /> Verified
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-0.5 text-gray-700 font-semibold">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {q.rating} <span className="font-normal text-gray-400">({q.ratingCount})</span>
            </span>
            <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {q.location}</span>
            <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> {q.responseTime}</span>
          </div>
        </div>
      </div>

      {/* For + status */}
      <p className="mt-2.5 text-xs text-gray-500">For: <span className="font-semibold text-gray-800">{forProduct}</span></p>
      <span className={cn("inline-block mt-1.5 w-full text-center rounded-md py-1 text-[11px] font-semibold", status.cls)}>
        {status.label}
      </span>

      {/* Quote grid */}
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 rounded-xl bg-gray-50 p-3 mt-3">
        <StatCell icon={DollarSign} label="Price/Unit" value={fmtMoney(q.currency, q.pricePerUnit)} />
        <StatCell icon={Package} label="MOQ" value={`${q.moq.toLocaleString()} units`} />
        <StatCell icon={Clock} label="Lead Time" value={q.leadTime} />
        <StatCell icon={FlaskConical} label="Sampling" value={fmtMoney(q.currency, q.sampling)} />
      </div>

      {/* Comment */}
      {q.comment && (
        <p className="mt-3 rounded-lg bg-blue-50/60 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
          {q.comment}
        </p>
      )}

      {/* Contact row */}
      <div className="flex items-center gap-2 mt-3">
        <button onClick={onChat} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
          <MessageCircle className="w-3.5 h-3.5" /> Chat
        </button>
        <button onClick={onCall} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
          <Phone className="w-3.5 h-3.5" /> Call
        </button>
        <button onClick={onDetails} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
          <Eye className="w-3.5 h-3.5" /> View Details
        </button>
      </div>

      {/* Actions by status */}
      {q.status === "pending" && (
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
      {q.status === "shortlisted" && (
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <button onClick={() => onStatus("rejected")} className="flex items-center justify-center gap-1 rounded-lg bg-red-500 text-white py-2 text-xs font-bold hover:bg-red-600 transition-colors">
            <X className="w-3.5 h-3.5" /> Reject
          </button>
          <button onClick={() => onStatus("accepted")} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white py-2 text-xs font-bold hover:bg-emerald-700 transition-colors">
            <Check className="w-3.5 h-3.5" /> Accept Quote
          </button>
        </div>
      )}

      <p className="mt-2.5 text-[11px] text-gray-400">Submitted {q.submittedAgo}</p>
    </div>
  );
}
