import { brand } from "@/lib/brand";
import { errorMessage } from "@/lib/errorMessage";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Check, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOpenRfqs, submitQuote } from "@/lib/queries/rfqs";

// ─────────────────────────────────────────────────────────────
// Live buyer RFQs (the real lead pool) with inline quoting, for the vendor
// Leads page. This is the vendor half of the RFQ→quote loop: a buyer's
// PostRequirement shows up here, and the vendor's quote flows back to the
// buyer's My Quotes. Renders nothing when signed-out or when there are no
// open RFQs, so it sits quietly above the existing (mock) leads UI.
//
// The same for every plan (RFQ/leads R2, Mitra 2026-10-02): every vendor sees
// the ranked pool with both match badges, and nothing caps how many leads a
// vendor quotes on. enforce_lead_cap() is still installed but every plan's
// leads_per_month is -1, which it treats as unlimited.
// ─────────────────────────────────────────────────────────────

const BLUE = brand("vendor");

// A lead card shows this many of the buyer's answers; the rest open on request, so a
// requirement with a dozen answers doesn't crowd out the pool (Ranking F1).
const SHOWN_DETAILS = 4;

function LeadDetails({ details }: { details: { label: string; value: string }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? details : details.slice(0, SHOWN_DETAILS);
  const hidden = details.length - SHOWN_DETAILS;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 lg:text-xs">
      {shown.map((d) => (
        <span key={d.label}>
          <span className="text-gray-400">{d.label}:</span>{" "}
          <span data-no-translate className="font-medium text-gray-700">{d.value}</span>
        </span>
      ))}
      {!all && hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="font-semibold text-brand-vendor hover:underline">
          {`+${hidden} more`}
        </button>
      )}
    </div>
  );
}

export default function OpenRfqLeads() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rfqs = [], isLoading } = useOpenRfqs(user?.id);

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ price: "", moq: "", leadTime: "", comment: "" });
  const [busy, setBusy] = useState(false);

  if (!user || isLoading || rfqs.length === 0) return null;

  const submit = async (rfqId: string) => {
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
      toast.success("Quote submitted", { description: "The buyer will see it in My Quotes." });
      setOpenId(null);
      setForm({ price: "", moq: "", leadTime: "", comment: "" });
    } catch (e) {
      toast.error("Couldn't submit quote", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm transition-colors focus:outline-none focus:border-brand-vendor focus:ring-1 focus:ring-brand-vendor/20";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 lg:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 lg:mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-gray-900 lg:text-base">Buyer Requirements</h2>
          <span className="rounded-full bg-brand-vendor/10 text-brand-vendor text-[10px] font-bold px-2 py-0.5 lg:text-[11px]">{rfqs.length} live</span>
        </div>
      </div>

      {/* One column on mobile; two across once there is real width to spend. */}
      <div className="flex flex-col gap-3 min-[1700px]:grid min-[1700px]:grid-cols-2 min-[1700px]:items-start">
        {rfqs.map((r) => (
          <div key={r.id} className={`rounded-xl border p-3 lg:p-3.5 lg:transition-colors ${r.matched || r.strongMatch ? "border-brand-vendor/40 bg-brand-vendor/[0.03] lg:hover:border-brand-vendor/60" : "border-gray-200 lg:hover:border-gray-300"}`}>
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
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-brand-vendor/10 px-2 py-0.5 text-[10px] font-bold text-brand-vendor">
                    <Sparkles className="h-3 w-3" /> Matches your category
                  </span>
                ) : r.strongMatch ? (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-brand-vendor/10 px-2 py-0.5 text-[10px] font-bold text-brand-vendor">
                    <Sparkles className="h-3 w-3" /> Strong match
                  </span>
                ) : null}
                <p data-no-translate className="text-sm font-bold text-gray-900 truncate lg:text-[15px]">{r.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 lg:text-[13px]">
                  {r.units ? `${r.units.toLocaleString("en-IN")} units · ` : ""}
                  {r.priceMin || r.priceMax ? `₹${r.priceMin}–₹${r.priceMax}/unit · ` : ""}{r.date}
                </p>
                {r.details.length > 0 && <LeadDetails details={r.details} />}
              </div>
              {r.image && <img src={r.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0 lg:w-14 lg:h-14" />}
            </div>

            {r.alreadyQuoted ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="w-3.5 h-3.5" /> Quote submitted
              </p>
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
              <button onClick={() => setOpenId(r.id)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-brand-vendor/5" style={{ borderColor: BLUE, color: BLUE }}>
                <Send className="w-3.5 h-3.5" /> Submit Quote
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
