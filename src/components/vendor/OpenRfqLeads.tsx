import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Check, Loader2, Sparkles, Crown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenRfqs, submitQuote } from "@/lib/queries/rfqs";
import { useVendorPlan } from "@/lib/queries/subscriptions";
import { capReached, isUnlimited, remaining } from "@/lib/plan";

// ─────────────────────────────────────────────────────────────
// Live buyer RFQs (the real lead pool) with inline quoting, for the vendor
// Leads page. This is the vendor half of the RFQ→quote loop: a buyer's
// PostRequirement shows up here, and the vendor's quote flows back to the
// buyer's My Quotes. Renders nothing when signed-out or when there are no
// open RFQs, so it sits quietly above the existing (mock) leads UI.
//
// Subscription-aware: paid vendors see category-matched RFQs flagged + first
// (Part 3b); a "lead consumed" = quoting a new RFQ this period, and quoting is
// blocked once the plan's monthly lead allowance is used up (Part 3).
// ─────────────────────────────────────────────────────────────

const BLUE = "#256fef";

export default function OpenRfqLeads() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rfqs = [], isLoading } = useOpenRfqs(user?.id);
  const { data: vplan } = useVendorPlan(user?.id);

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ price: "", moq: "", leadTime: "", comment: "" });
  const [busy, setBusy] = useState(false);

  if (!user || isLoading || rfqs.length === 0) return null;

  const leadCap = vplan?.limits.leads_per_month ?? 0;
  const leadsUsed = vplan?.usage.leads_used ?? 0;
  const capHit = capReached(leadsUsed, leadCap);
  const leadsLeft = remaining(leadsUsed, leadCap);

  const submit = async (rfqId: string) => {
    if (capHit) {
      toast.error("Monthly lead limit reached", { description: "Upgrade your plan to quote on more leads this month." });
      return;
    }
    const price = parseFloat(form.price);
    if (!price) { toast.error("Enter a price per unit"); return; }
    setBusy(true);
    try {
      await submitQuote(user.id, {
        rfqId, pricePerUnit: price,
        moq: form.moq ? parseInt(form.moq, 10) : null,
        leadTime: form.leadTime || null,
        comment: form.comment || null,
      });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["vendor_plan"] }); // usage changed
      toast.success("Quote submitted", { description: "The buyer will see it in My Quotes." });
      setOpenId(null);
      setForm({ price: "", moq: "", leadTime: "", comment: "" });
    } catch (e) {
      toast.error("Couldn't submit quote", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm transition-colors focus:outline-none focus:border-[#256fef] focus:ring-1 focus:ring-[#256fef]/20";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 lg:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 lg:mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-gray-900 lg:text-base">Buyer Requirements</h2>
          <span className="rounded-full bg-[#256fef]/10 text-[#256fef] text-[10px] font-bold px-2 py-0.5 lg:text-[11px]">{rfqs.length} live</span>
        </div>
        {vplan && (
          <span className={`text-[11px] font-semibold lg:text-xs ${capHit ? "text-red-600" : "text-gray-500"}`}>
            {isUnlimited(leadCap)
              ? "Unlimited leads"
              : `${Math.min(leadsUsed, leadCap)}/${leadCap} leads used`}
          </span>
        )}
      </div>

      {capHit && (
        <Link to="/subscription" className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <Crown className="h-3.5 w-3.5" /> Monthly lead limit reached — upgrade to keep quoting
          </span>
          <span className="text-xs font-bold text-amber-900">Upgrade →</span>
        </Link>
      )}

      {/* One column on mobile; two across once there is real width to spend. */}
      <div className="flex flex-col gap-3 min-[1700px]:grid min-[1700px]:grid-cols-2 min-[1700px]:items-start">
        {rfqs.map((r) => (
          <div key={r.id} className={`rounded-xl border p-3 lg:p-3.5 lg:transition-colors ${r.matched || r.strongMatch ? "border-[#256fef]/40 bg-[#256fef]/[0.03] lg:hover:border-[#256fef]/60" : "border-gray-200 lg:hover:border-gray-300"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* Two distinct claims, deliberately not merged into one badge.
                    "Matches your category" asserts an exact category overlap and
                    has to stay literally true; "Strong match" is the semantic
                    signal — the RFQ text reads like this vendor's catalogue —
                    and says so in its own words rather than borrowing the
                    category badge's. The category badge wins when both hold,
                    being the more specific claim. */}
                {r.matched ? (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#256fef]/10 px-2 py-0.5 text-[10px] font-bold text-[#256fef]">
                    <Sparkles className="h-3 w-3" /> Matches your category
                  </span>
                ) : r.strongMatch ? (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#256fef]/10 px-2 py-0.5 text-[10px] font-bold text-[#256fef]">
                    <Sparkles className="h-3 w-3" /> Strong match
                  </span>
                ) : null}
                <p className="text-sm font-bold text-gray-900 truncate lg:text-[15px]">{r.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 lg:text-[13px]">
                  {r.units ? `${r.units.toLocaleString("en-IN")} units · ` : ""}
                  {r.priceMin || r.priceMax ? `₹${r.priceMin}–₹${r.priceMax}/unit · ` : ""}{r.date}
                </p>
              </div>
              {r.image && <img src={r.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0 lg:w-14 lg:h-14" />}
            </div>

            {r.alreadyQuoted ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="w-3.5 h-3.5" /> Quote submitted
              </p>
            ) : capHit ? (
              <Link to="/subscription" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                <Crown className="w-3.5 h-3.5" /> Upgrade to quote
              </Link>
            ) : openId === r.id ? (
              // Capped on desktop: at full width the inputs stretch to ~1100px
              // on /leads, which reads as a form nobody designed.
              <div className="mt-3 space-y-2 lg:max-w-xl">
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} inputMode="numeric" placeholder="Price / unit (₹)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                  <input className={input} inputMode="numeric" placeholder="MOQ" value={form.moq} onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))} />
                </div>
                <input className={input} placeholder="Lead time (e.g. 20 days)" value={form.leadTime} onChange={(e) => setForm((f) => ({ ...f, leadTime: e.target.value }))} />
                <textarea className={input} rows={2} placeholder="Comment (optional)" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={() => setOpenId(null)} className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors">Cancel</button>
                  <button onClick={() => submit(r.id)} disabled={busy} className="flex-1 py-2 rounded-lg text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 transition-opacity hover:opacity-90" style={{ backgroundColor: BLUE }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send Quote
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setOpenId(r.id)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[#256fef]/5" style={{ borderColor: BLUE, color: BLUE }}>
                <Send className="w-3.5 h-3.5" /> Submit Quote
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
