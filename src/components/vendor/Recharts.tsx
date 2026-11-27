import { useEffect, useState, type ReactNode } from "react";

// The chart library loads with the first chart that needs it (speed plan 3.6, 2026-11-27): recharts and its d3 parts
// are ~107 KB gzip of seller Analytics' 119 KB, and the page's numbers don't need them. Until it arrives the chart's
// box shows a placeholder of the same size, so nothing moves.

type RechartsModule = typeof import("recharts");
let loaded: RechartsModule | null = null;
let loading: Promise<RechartsModule> | null = null;
const load = () => (loading ??= import("recharts").then((m) => (loaded = m)));

export function Recharts({ children }: { children: (R: RechartsModule) => ReactNode }) {
  const [R, setR] = useState<RechartsModule | null>(loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (R) return;
    let live = true;
    load().then((m) => { if (live) setR(m); }, () => { loading = null; if (live) setFailed(true); });
    return () => { live = false; };
  }, [R]);
  if (R) return <>{children(R)}</>;
  return (
    <div className="h-full w-full rounded-lg bg-muted/30 flex items-center justify-center text-xs text-muted-foreground" aria-busy={!failed}>
      {failed ? "The chart couldn't load. Refresh to try again." : null}
    </div>
  );
}
