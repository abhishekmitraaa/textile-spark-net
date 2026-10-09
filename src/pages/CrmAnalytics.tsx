import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { SOURCE_LABEL, formatLeadValue, useCrmAnalytics, type CrmSource } from "@/lib/queries/crm";
import {
  formatDelay, formatInrCompact, orderValueSince, useVendorOrderValue, useVendorResponsiveness,
} from "@/lib/queries/vendorAnalytics";

// CRM analytics (subscriptions P8; Gold and VIP): how the vendor's leads move. The funnel
// counts the leads added in the period by the furthest stage each reached; won, lost and the
// win rate count leads closed in it; follow-ups count those due in it. Response time and
// order value come from the same hooks as the Analytics page, so the figures agree.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const PERIODS = [30, 90, 365] as const;
const FUNNEL = [
  ["new", "Added"], ["contacted", "Contacted"], ["quoted", "Quoted"], ["negotiating", "Negotiating"], ["won", "Won"],
] as const;

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid={testId}>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default function CrmAnalytics() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(90);
  const { data: a, isLoading } = useCrmAnalytics(user?.id, days);
  const { data: responsiveness } = useVendorResponsiveness(user?.id);
  const { data: orderValue } = useVendorOrderValue(user?.id);

  const top = Math.max(1, a?.funnel.new ?? 0);
  const fu = a?.followUps;
  const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/crm" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-3.5 w-3.5" /> CRM
            </Link>
            <h1 className="text-xl font-semibold text-foreground lg:text-2xl">CRM analytics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">How your leads move from first contact to an order.</p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${days === p ? "bg-gray-900 text-white" : "text-gray-600"}`}>
                {p === 365 ? "12 months" : `${p} days`}
              </button>
            ))}
          </div>
        </motion.div>

        {isLoading || !a ? (
          <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <motion.div variants={section} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Open pipeline" value={formatLeadValue(a.openValue)} hint="Value of the leads still open" testId="crm-stat-open" />
              <Stat label="Won" value={formatLeadValue(a.wonValue)} hint={`${a.won} won, ${a.lost} lost`} testId="crm-stat-won" />
              <Stat label="Win rate" value={pct(a.winRate)} hint="Of the leads closed in the period" testId="crm-stat-win-rate" />
              <Stat label="Days to win" value={a.avgDaysToWin == null ? "—" : String(a.avgDaysToWin)} hint="Average, from added to won" />
            </motion.div>

            <motion.div variants={section} className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="crm-funnel">
                <h2 className="text-sm font-bold text-gray-900">Funnel</h2>
                <p className="text-xs text-gray-500">{`Leads added in the period (${a.created}), by the furthest stage each reached`}</p>
                <ul className="mt-3 space-y-2">
                  {FUNNEL.map(([k, label]) => {
                    const n = a.funnel[k];
                    return (
                      <li key={k}>
                        <div className="flex justify-between text-xs"><span className="font-semibold text-gray-700">{label}</span><span className="text-gray-500">{n}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-brand-vendor" style={{ width: `${Math.round((n / top) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="crm-follow-up-stats">
                  <h2 className="text-sm font-bold text-gray-900">Follow-ups kept</h2>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{fu && fu.due > 0 ? pct(fu.onTime / fu.due) : "—"}</p>
                  <p className="text-xs text-gray-500">
                    {fu ? `${fu.onTime} of ${fu.due} due in the period done within a day; ${fu.overdueOpen} overdue now` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Reply within 24 h" value={pct(responsiveness?.within24hPct == null ? null : responsiveness.within24hPct / 100)}
                    hint={`Median ${formatDelay(responsiveness?.medianHours ?? null)}`} />
                  <Stat label="Order value" value={formatInrCompact(orderValueSince(orderValue, days))} hint="Accepted quotes in the period" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={section} className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900">Why leads were lost</h2>
                {a.lostReasons.length === 0 ? <p className="mt-2 text-xs text-gray-500">None lost in the period.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {a.lostReasons.map((r) => (
                      <li key={r.reason} className="flex justify-between gap-2"><span data-no-translate className="truncate text-gray-700">{r.reason}</span><span className="text-gray-500">{r.count}</span></li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900">Where leads came from</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {(Object.keys(SOURCE_LABEL) as CrmSource[]).map((s) => (
                    <li key={s} className="flex justify-between"><span className="text-gray-700">{SOURCE_LABEL[s]}</span><span className="text-gray-500">{a.bySource[s] ?? 0}</span></li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
