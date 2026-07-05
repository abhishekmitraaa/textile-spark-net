import { motion, AnimatePresence } from "framer-motion";
import { X, Star, MessageCircle, Phone } from "lucide-react";
import { fmtMoney, type VendorQuote } from "@/lib/quotesData";

interface Props {
  quotes: VendorQuote[];
  onClose: () => void;
  onChat: (q: VendorQuote) => void;
  onCall: (q: VendorQuote) => void;
}

// Rows requested in the reference note: Vendor, Price/unit, MOQ, Lead time,
// Fabric, Rating, Action.
export default function CompareTable({ quotes, onClose, onChat, onCall }: Props) {
  return (
    <AnimatePresence>
      {quotes.length > 0 && (
        <motion.div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden"
            initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-base font-bold text-gray-900">Quote Comparison</h2>
              <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="sticky left-0 bg-white px-4 py-3 text-[11px] font-semibold text-gray-400">Criteria</th>
                    {quotes.map((q) => (
                      <th key={q.id} className="px-4 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">{q.vendorName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-xs">
                  <Row label="Price/Unit">
                    {quotes.map((q) => <td key={q.id} className="px-4 py-3 font-bold text-[#ef4d62] whitespace-nowrap">{fmtMoney(q.currency, q.pricePerUnit)}</td>)}
                  </Row>
                  <Row label="MOQ">
                    {quotes.map((q) => <td key={q.id} className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.moq.toLocaleString()} units</td>)}
                  </Row>
                  <Row label="Lead Time">
                    {quotes.map((q) => <td key={q.id} className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.leadTime}</td>)}
                  </Row>
                  <Row label="Fabric">
                    {quotes.map((q) => <td key={q.id} className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.fabric}</td>)}
                  </Row>
                  <Row label="Rating">
                    {quotes.map((q) => (
                      <td key={q.id} className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-0.5 text-gray-700 font-semibold">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {q.rating}
                        </span>
                      </td>
                    ))}
                  </Row>
                  <Row label="Actions">
                    {quotes.map((q) => (
                      <td key={q.id} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => onChat(q)} aria-label="Chat" className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-gray-300">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => onCall(q)} aria-label="Call" className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-700">
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    ))}
                  </Row>
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="sticky left-0 bg-white px-4 py-3 text-[11px] font-semibold text-gray-400 whitespace-nowrap">{label}</td>
      {children}
    </tr>
  );
}
