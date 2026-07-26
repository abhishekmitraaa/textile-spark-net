import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Send, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDirectQuoteRequests, submitQuote, echoQuoteReplyToChat } from "@/lib/queries/rfqs";

// ─────────────────────────────────────────────────────────────
// Direct Quote Requests: RFQs a buyer addressed to THIS vendor from a product
// page. Deliberately separate from "Buyer Requirements" (OpenRfqLeads), which
// is the shared open-marketplace pool. These are already yours — no competing
// vendors, so no lead-cap gating here.
//
// Replying uses the same submitQuote() as the open pool, then additionally
// echoes a `quote_reply` message into the buyer's chat thread.
// ─────────────────────────────────────────────────────────────

const BLUE = "#256fef";

export default function DirectQuoteRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: requests = [], isLoading } = useDirectQuoteRequests(user?.id);

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ price: "", moq: "", leadTime: "", comment: "" });
  const [busy, setBusy] = useState(false);

  if (!user || isLoading || requests.length === 0) return null;

  const submit = async (rfqId: string) => {
    const price = parseFloat(form.price);
    if (!price) { toast.error("Enter a price per unit"); return; }
    setBusy(true);
    try {
      const moq = form.moq ? parseInt(form.moq, 10) : null;
      const leadTime = form.leadTime || null;
      await submitQuote(user.id, {
        rfqId, pricePerUnit: price, moq, leadTime, comment: form.comment || null,
      });
      // Targeted request: mirror the reply into the buyer's chat thread.
      await echoQuoteReplyToChat(user.id, rfqId, { pricePerUnit: price, moq, leadTime });

      qc.invalidateQueries({ queryKey: ["rfqs"] });
      toast.success("Quote sent", { description: "The buyer sees it in My Quotes and in your chat." });
      setOpenId(null);
      setForm({ price: "", moq: "", leadTime: "", comment: "" });
    } catch (e) {
      toast.error("Couldn't send quote", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm transition-colors focus:outline-none focus:border-[#256fef] focus:ring-1 focus:ring-[#256fef]/20";

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 lg:p-5">
      <div className="mb-3 flex items-center gap-2 lg:mb-4">
        <h2 className="text-sm font-bold text-gray-900 lg:text-base">Direct Quote Requests</h2>
        <span className="rounded-full bg-[#256fef]/10 px-2 py-0.5 text-[10px] font-bold text-[#256fef] lg:text-[11px]">
          {requests.length} for you
        </span>
      </div>

      <div className="flex flex-col gap-3 min-[1700px]:grid min-[1700px]:grid-cols-2 min-[1700px]:items-start">
        {requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-[#256fef]/40 bg-[#256fef]/[0.03] p-3 lg:p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900 lg:text-[15px]">{r.productName}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500 lg:text-[13px]">
                  <UserRound className="h-3.5 w-3.5" /> {r.buyerName} · {r.date}
                </p>
              </div>
              {r.productImage && (
                <img src={r.productImage} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 object-cover lg:h-14 lg:w-14" />
              )}
            </div>

            {/* Full request detail */}
            <dl className="mt-2.5 space-y-1.5 text-xs lg:text-[13px]">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-500">Quantity</dt>
                <dd className="font-semibold text-gray-900">
                  {r.quantity.toLocaleString("en-IN")} pieces
                  {r.sizes.length > 0 && (
                    <span className="font-normal text-gray-600">
                      {" "}({r.sizes.map((s) => `${s.size} x ${s.quantity}`).join(", ")})
                    </span>
                  )}
                </dd>
              </div>
              {r.colors.length > 0 && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-gray-500">Colour</dt>
                  <dd className="font-semibold text-gray-900">{r.colors.join(", ")}</dd>
                </div>
              )}
              {(r.budgetMin > 0 || r.budgetMax > 0) && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-gray-500">Budget</dt>
                  <dd className="font-semibold text-gray-900">₹{r.budgetMin}–₹{r.budgetMax} / unit</dd>
                </div>
              )}
              {r.customizationRequested && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-gray-500">Custom</dt>
                  <dd className="min-w-0 text-gray-900">
                    <span className="font-semibold">{r.customizationNotes || "Requested"}</span>
                    {r.customizationImages.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.customizationImages.map((src, i) => (
                          <a key={src} href={src} target="_blank" rel="noreferrer">
                            <img
                              src={src}
                              alt={`Reference ${i + 1}`}
                              className="h-12 w-12 rounded-md border border-gray-200 object-cover"
                            />
                          </a>
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {r.alreadyQuoted ? (
              <p className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Quote sent
              </p>
            ) : openId === r.id ? (
              <div className="mt-3 space-y-2 lg:max-w-xl">
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} inputMode="numeric" placeholder="Price / unit (₹)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                  <input className={input} inputMode="numeric" placeholder="MOQ" value={form.moq} onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))} />
                </div>
                <input className={input} placeholder="Lead time (e.g. 20 days)" value={form.leadTime} onChange={(e) => setForm((f) => ({ ...f, leadTime: e.target.value }))} />
                <textarea className={input} rows={2} placeholder="Comment (optional)" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={() => setOpenId(null)} className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200">Cancel</button>
                  <button onClick={() => submit(r.id)} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: BLUE }}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send Quote
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setOpenId(r.id)} className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[#256fef]/5" style={{ borderColor: BLUE, color: BLUE }}>
                <Send className="h-3.5 w-3.5" /> Send Quote
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
