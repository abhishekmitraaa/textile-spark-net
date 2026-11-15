import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp } from "lucide-react";
import type { ProfileScoreSignal } from "@/lib/queries/vendorDashboard";

/**
 * The one thing that would raise this seller's profile score next (SH-010). It replaced "Boost Your Profile", which
 * promised "+40% visibility" for "3 more products" with nothing behind either figure. The label, points and link
 * are the profile score's own (profileScoreSignals), so they're always true. Nothing renders once every step is done.
 */
export function NextStepCard({ signals }: { signals: ProfileScoreSignal[] }) {
  const next = signals.find((s) => !s.met);
  if (!next) return null;
  return (
    <div data-testid="next-step-card" className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 lg:p-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-vendor/10">
        <TrendingUp className="h-4 w-4 text-brand-vendor" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
        <p className="mt-0.5 text-sm font-bold text-foreground">{next.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">+{next.points} points to your profile score</p>
        <Link
          to={next.href}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-vendor hover:underline"
        >
          Do it now <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
