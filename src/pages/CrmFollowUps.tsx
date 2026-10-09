import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import CrmLeadSheet from "@/components/vendor/CrmLeadSheet";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/errorMessage";
import {
  STAGE_LABEL, moveFollowUp, setFollowUpDone, useCrmFollowUps, useCrmLeads, useCrmRefresh, type CrmOpenFollowUp,
} from "@/lib/queries/crm";

// CRM follow-ups (subscriptions P8; Silver and above): every follow-up the vendor has planned
// and not done, overdue first. The bell rings when one is due (and on Gold and VIP, WhatsApp,
// once its template is approved); this is where they are worked through.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const WHEN = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export default function CrmFollowUps() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: items = [], isLoading } = useCrmFollowUps(user?.id);
  const { data: leads = [] } = useCrmLeads(user?.id);
  const refresh = useCrmRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const now = Date.now();
  const eod = endOfToday();
  const groups: { key: string; title: string; rows: CrmOpenFollowUp[] }[] = [
    { key: "overdue", title: "Overdue", rows: items.filter((f) => new Date(f.dueAt).getTime() < now) },
    { key: "today", title: "Later today", rows: items.filter((f) => { const t = new Date(f.dueAt).getTime(); return t >= now && t <= eod; }) },
    { key: "later", title: "Coming up", rows: items.filter((f) => new Date(f.dueAt).getTime() > eod) },
  ];

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
      await refresh();
      toast.success(done);
    } catch (e) {
      toast.error("Couldn't save that", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section}>
          <Link to="/crm" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" /> CRM
          </Link>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Follow-ups</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">What you planned to do next with each buyer. Plan one from a lead in your CRM.</p>
        </motion.div>

        <motion.div variants={section} className="space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center" data-testid="crm-follow-ups-empty">
              <p className="text-base font-bold text-gray-900">Nothing planned</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Open a lead in your CRM and plan when to get back to the buyer.</p>
            </div>
          ) : (
            groups.filter((g) => g.rows.length > 0).map((g) => (
              <section key={g.key} data-testid={`crm-follow-ups-${g.key}`}>
                <h2 className={`mb-2 text-xs font-bold uppercase tracking-wide ${g.key === "overdue" ? "text-red-700" : "text-gray-500"}`}>
                  {`${g.title} · ${g.rows.length}`}
                </h2>
                <ul className="space-y-2">
                  {g.rows.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                      <button type="button" onClick={() => setOpenId(f.pipelineId)} className="min-w-0 flex-1 basis-full text-left sm:basis-0">
                        <p data-no-translate className="truncate text-sm font-semibold text-gray-900 hover:underline">{f.leadTitle}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {WHEN.format(new Date(f.dueAt))} · {STAGE_LABEL[f.leadStage]}
                          {f.note ? <> · <span data-no-translate>{f.note}</span></> : null}
                        </p>
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button type="button" disabled={busy === f.id}
                          onClick={() => act(f.id, () => moveFollowUp(f.id, new Date(Math.max(Date.now(), new Date(f.dueAt).getTime()) + 24 * 3600_000)), "Moved to tomorrow")}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                          <Clock className="h-3.5 w-3.5" /> A day later
                        </button>
                        <button type="button" disabled={busy === f.id} data-testid="crm-follow-up-done"
                          onClick={() => act(f.id, () => setFollowUpDone(f.id, true), "Marked done")}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-vendor px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
                          <Check className="h-3.5 w-3.5" /> Done
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </motion.div>
      </motion.div>
      <CrmLeadSheet lead={leads.find((l) => l.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </DashboardLayout>
  );
}
