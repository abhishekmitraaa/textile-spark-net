import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { BarChart3, CalendarClock, Columns3, List, Loader2, Plus, Search } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import CrmLeadSheet from "@/components/vendor/CrmLeadSheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { errorMessage } from "@/lib/errorMessage";
import { useVendorEntitlements } from "@/lib/queries/entitlements";
import {
  CRM_STAGES, OPEN_STAGES, STAGE_LABEL, addLead, formatLeadValue, useCrmLeads, useCrmRefresh,
  type CrmLead, type CrmStage,
} from "@/lib/queries/crm";

// The CRM (subscriptions P8; Silver and above): the leads a vendor is working on, by stage.
// A board on desktop (a column per stage), a list with stage chips on a phone. Leads arrive
// when the vendor tracks a requirement from Leads, sends a quote, or a buyer sends them a
// request; they can also be added by hand. Opening one shows its details, follow-ups and
// history (CrmLeadSheet).

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };

const STAGE_DOT: Record<CrmStage, string> = {
  new: "bg-gray-400", contacted: "bg-sky-500", quoted: "bg-brand-vendor", negotiating: "bg-amber-500",
  won: "bg-emerald-600", lost: "bg-red-500",
};
const DUE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:outline-none focus:border-brand-vendor focus:ring-1 focus:ring-brand-vendor/20";

function LeadCard({ lead, onOpen }: { lead: CrmLead; onOpen: () => void }) {
  const due = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  const overdue = due ? due.getTime() < Date.now() : false;
  return (
    <button type="button" onClick={onOpen} data-testid="crm-lead"
      className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-brand-vendor/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-vendor/40">
      <p data-no-translate className="line-clamp-2 text-sm font-semibold text-gray-900">{lead.title}</p>
      {lead.buyerName && <p data-no-translate className="mt-0.5 truncate text-xs text-gray-500">{lead.buyerName}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="font-semibold text-gray-800">{formatLeadValue(lead.valueInr)}</span>
        {due && (
          <span className={`inline-flex items-center gap-0.5 ${overdue ? "font-semibold text-red-700" : "text-gray-500"}`}>
            <CalendarClock className="h-3 w-3" aria-hidden />{DUE.format(due)}
          </span>
        )}
        {lead.tags.slice(0, 3).map((t) => (
          <span key={t} data-no-translate className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600">{t}</span>
        ))}
      </div>
    </button>
  );
}

function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: (id: string) => void }) {
  const [form, setForm] = useState({ title: "", buyerName: "", value: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const value = form.value.trim() === "" ? null : Number(form.value.replace(/[,\s₹]/g, ""));
    if (value != null && !(value >= 0)) { toast.error("Enter the value as a number"); return; }
    setBusy(true);
    try {
      const id = await addLead({ title: form.title.trim(), buyerName: form.buyerName.trim(), valueInr: value });
      setForm({ title: "", buyerName: "", value: "" });
      onAdded(id);
    } catch (e) {
      toast.error("Couldn't add the lead", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>A buyer you met elsewhere: a trade fair, a call, a referral.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="crm-new-title" className="mb-1 block text-xs font-semibold text-gray-500">What they need</label>
            <input id="crm-new-title" className={input} maxLength={200} placeholder="2,000 cotton polo shirts" value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="crm-new-buyer" className="mb-1 block text-xs font-semibold text-gray-500">Buyer</label>
              <input id="crm-new-buyer" className={input} maxLength={120} value={form.buyerName}
                onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="crm-new-value" className="mb-1 block text-xs font-semibold text-gray-500">Value (₹)</label>
              <input id="crm-new-value" className={input} inputMode="decimal" value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={submit} disabled={busy || !form.title.trim()} data-testid="crm-add-lead-save"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-vendor px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add lead
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Crm() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: leads = [], isLoading } = useCrmLeads(user?.id);
  const { data: entitlements } = useVendorEntitlements(user?.id);
  const refresh = useCrmRefresh();

  const [view, setView] = useState<"board" | "list" | null>(null);
  const shown = view ?? (isMobile ? "list" : "board");
  const [stage, setStage] = useState<CrmStage | "open">("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter((l) => [l.title, l.buyerName ?? "", ...l.tags].some((s) => s.toLowerCase().includes(needle)));
  }, [leads, q]);
  const byStage = useMemo(() => {
    const m = Object.fromEntries(CRM_STAGES.map((s) => [s, [] as CrmLead[]])) as Record<CrmStage, CrmLead[]>;
    for (const l of filtered) m[l.stage].push(l);
    return m;
  }, [filtered]);
  const openLead = leads.find((l) => l.id === openId) ?? null;
  const openValue = leads.filter((l) => OPEN_STAGES.includes(l.stage)).reduce((s, l) => s + (l.valueInr ?? 0), 0);
  const listRows = stage === "open" ? filtered.filter((l) => OPEN_STAGES.includes(l.stage)) : byStage[stage];

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section} className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground lg:text-2xl">CRM</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {`${leads.filter((l) => OPEN_STAGES.includes(l.stage)).length} open leads worth ${formatLeadValue(openValue)}. Quotes you send and the buyer's answers move them for you.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/crm/follow-ups" className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
              <CalendarClock className="h-4 w-4" /> Follow-ups
            </Link>
            {entitlements?.features.crm_analytics && (
              <Link to="/crm/analytics" className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50" data-testid="crm-analytics-link">
                <BarChart3 className="h-4 w-4" /> Analytics
              </Link>
            )}
            <button type="button" onClick={() => setAdding(true)} data-testid="crm-add-lead"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-vendor px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90">
              <Plus className="h-4 w-4" /> Add lead
            </button>
          </div>
        </motion.div>

        <motion.div variants={section} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input aria-label="Search leads" className={`${input} pl-9`} placeholder="Search by name, buyer or tag" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="View">
            <button type="button" aria-pressed={shown === "board"} onClick={() => setView("board")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${shown === "board" ? "bg-gray-900 text-white" : "text-gray-600"}`}>
              <Columns3 className="h-3.5 w-3.5" /> Board
            </button>
            <button type="button" aria-pressed={shown === "list"} onClick={() => setView("list")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${shown === "list" ? "bg-gray-900 text-white" : "text-gray-600"}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </motion.div>

        <motion.div variants={section}>
          {isLoading ? (
            <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : leads.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center" data-testid="crm-empty">
              <p className="text-base font-bold text-gray-900">Nothing in your CRM yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                Track a requirement from Leads, or send a quote, and it appears here. You can also add a buyer you met elsewhere.
              </p>
              <Link to="/leads" className="mt-4 inline-flex text-sm font-medium text-brand-vendor hover:underline">Open my leads</Link>
            </div>
          ) : shown === "board" ? (
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" data-testid="crm-board">
              {CRM_STAGES.map((s) => (
                <div key={s} className="flex w-64 shrink-0 flex-col rounded-2xl bg-gray-50 p-2.5" data-testid={`crm-column-${s}`}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700">
                      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s]}`} />{STAGE_LABEL[s]}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-500">{byStage[s].length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {byStage[s].map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Stage">
                {(["open", ...CRM_STAGES] as const).map((s) => {
                  const n = s === "open" ? filtered.filter((l) => OPEN_STAGES.includes(l.stage)).length : byStage[s].length;
                  return (
                    <button key={s} type="button" role="tab" aria-selected={stage === s} onClick={() => setStage(s)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${stage === s ? "bg-brand-vendor text-white" : "bg-gray-100 text-gray-700"}`}>
                      {s === "open" ? "All open" : STAGE_LABEL[s]} <span className="opacity-70">{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="crm-list">
                {listRows.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />)}
                {listRows.length === 0 && <p className="text-sm text-gray-500">No leads here.</p>}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      <CrmLeadSheet lead={openLead} onClose={() => setOpenId(null)} />
      <AddLeadDialog open={adding} onOpenChange={setAdding}
        onAdded={async (id) => { setAdding(false); await refresh(); setOpenId(id); toast.success("Lead added"); }} />
    </DashboardLayout>
  );
}
