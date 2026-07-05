import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, BadgeCheck, Star, MapPin, ExternalLink, MessageCircle, Phone,
  ImageIcon, Video, FileText, Download, DollarSign, Package, Clock,
  FlaskConical, Layers, CalendarClock, Check,
} from "lucide-react";
import { fmtMoney, type QuoteStatus, type VendorQuote } from "@/lib/quotesData";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<QuoteStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-blue-50 text-blue-600" },
  shortlisted: { label: "Shortlisted", cls: "bg-amber-50 text-amber-600" },
  accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-600" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-500" },
};

function QuoteStat({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
        <Icon className="w-3.5 h-3.5 text-[#ef4d62]" /> {label}
      </span>
      <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

interface Props {
  quote: VendorQuote | null;
  forProduct: string;
  onClose: () => void;
  onChat: () => void;
  onCall: () => void;
  onStatus: (status: QuoteStatus) => void;
}

export default function QuoteDetailsModal({ quote, forProduct, onClose, onChat, onCall, onStatus }: Props) {
  const navigate = useNavigate();
  const [paymentTerms, setPaymentTerms] = useState("");

  useEffect(() => { if (quote) setPaymentTerms(""); }, [quote]);

  return (
    <AnimatePresence>
      {quote && (
        <motion.div
          className="fixed inset-0 z-[85] flex items-start justify-center bg-black/50 p-3 overflow-y-auto"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md my-4 rounded-2xl bg-white shadow-2xl"
            initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">Quote Details</h2>
                <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLES[quote.status].cls)}>
                  {STATUS_STYLES[quote.status].label}
                </span>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-5">
              {/* Vendor profile */}
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#256fef] text-white flex items-center justify-center text-sm font-bold">
                    {quote.vendorInitials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900">{quote.vendorName}</h3>
                    {quote.verified && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                        <BadgeCheck className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-0.5 text-gray-700 font-semibold">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {quote.rating}
                      </span>
                      <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {quote.location}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => { onClose(); navigate(`/vendor/${quote.vendorId}`); }} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                    View Profile <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={onChat} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Chat
                  </button>
                  <button onClick={onCall} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                    <Phone className="w-3.5 h-3.5" /> Call
                  </button>
                </div>
              </div>

              {/* Quote for */}
              <div>
                <p className="text-[11px] text-gray-400">Quote For</p>
                <p className="text-sm font-bold text-gray-900">{forProduct}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Submitted {quote.submittedAgo}</p>
              </div>

              {/* Attachments */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2">Attachments from Vendor</h4>

                <p className="inline-flex items-center gap-1 text-[11px] text-gray-500 mb-1.5"><ImageIcon className="w-3.5 h-3.5" /> Product Images</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {quote.attachments.images.map((src, i) => (
                    <img key={i} src={src} alt={`Product ${i + 1}`} className="aspect-square w-full rounded-lg object-cover bg-gray-100" />
                  ))}
                </div>

                {quote.attachments.videos.length > 0 && (
                  <>
                    <p className="inline-flex items-center gap-1 text-[11px] text-gray-500 mb-1.5"><Video className="w-3.5 h-3.5" /> Videos</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {quote.attachments.videos.map((src, i) => (
                        <div key={i} className="relative aspect-square w-full rounded-lg overflow-hidden bg-gray-100">
                          <img src={src} alt={`Video ${i + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                              <Video className="w-3.5 h-3.5 text-white" />
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <p className="inline-flex items-center gap-1 text-[11px] text-gray-500 mb-1.5"><FileText className="w-3.5 h-3.5" /> Documents</p>
                {quote.attachments.documents.map((doc) => (
                  <a key={doc.name} href={doc.url} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 hover:border-gray-300 transition-colors">
                    <FileText className="w-4 h-4 text-[#ef4d62]" />
                    <span className="flex-1 truncate">{doc.name}</span>
                    <Download className="w-3.5 h-3.5 text-gray-400" />
                  </a>
                ))}
              </div>

              {/* Vendor quote grid (incl. Fabric per reference note) */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2">Vendor Quote</h4>
                <div className="grid grid-cols-2 gap-2">
                  <QuoteStat icon={DollarSign} label="Price/Unit" value={fmtMoney(quote.currency, quote.pricePerUnit)} />
                  <QuoteStat icon={Package} label="MOQ" value={`${quote.moq.toLocaleString()} Units`} />
                  <QuoteStat icon={Clock} label="Lead Time" value={quote.leadTime} />
                  <QuoteStat icon={FlaskConical} label="Sampling Cost" value={fmtMoney(quote.currency, quote.sampling)} />
                  <QuoteStat icon={Star} label="Rating" value={`${quote.rating} (${quote.ratingCount})`} />
                  <QuoteStat icon={CalendarClock} label="Sample Timeline" value={quote.sampleTimeline} />
                  <QuoteStat icon={Layers} label="Fabric" value={quote.fabric} />
                </div>

                {/* Payment terms */}
                <label className="block text-[11px] font-semibold text-gray-500 mt-3 mb-1">Payment Terms</label>
                <input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="e.g. 50% advance, 50% before dispatch"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
                />
              </div>

              {/* Vendor notes */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2">Vendor Notes</h4>
                <p className="rounded-xl bg-blue-50/60 px-3 py-2.5 text-xs leading-relaxed text-gray-600">{quote.comment}</p>
              </div>

              {/* Chat with vendor */}
              <button onClick={onChat} className="w-full flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-left hover:border-[#ef4d62]/40 transition-colors">
                <span className="w-9 h-9 rounded-full bg-[#ef4d62]/10 flex items-center justify-center text-[#ef4d62]">
                  <MessageCircle className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">Chat with Vendor</span>
                  <span className="block text-[11px] text-gray-500">Ask clarifications or negotiate</span>
                </span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">Avg. response ~2 hours</span>
              </button>
            </div>

            {/* Sticky action footer */}
            <div className="sticky bottom-0 rounded-b-2xl border-t border-gray-100 bg-white px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <button onClick={onChat} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" /> Chat
                </button>
                <button onClick={onCall} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                  <Phone className="w-3.5 h-3.5" /> Call
                </button>
              </div>
              {(quote.status === "pending" || quote.status === "shortlisted") && (
                <div className={cn("grid gap-2", quote.status === "pending" ? "grid-cols-3" : "grid-cols-2")}>
                  <button onClick={() => { onStatus("rejected"); onClose(); }} className="flex items-center justify-center gap-1 rounded-lg bg-red-500 text-white py-2 text-xs font-bold hover:bg-red-600 transition-colors">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                  {quote.status === "pending" && (
                    <button onClick={() => { onStatus("shortlisted"); onClose(); }} className="flex items-center justify-center gap-1 rounded-lg border border-amber-300 text-amber-600 py-2 text-xs font-bold hover:bg-amber-50 transition-colors">
                      <Star className="w-3.5 h-3.5" /> Shortlist
                    </button>
                  )}
                  <button onClick={() => { onStatus("accepted"); onClose(); }} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white py-2 text-xs font-bold hover:bg-emerald-700 transition-colors">
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
