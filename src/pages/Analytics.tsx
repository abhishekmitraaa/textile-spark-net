import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorDashboard, profileScoreSignals } from "@/lib/queries/vendorDashboard";
import { useMyProducts } from "@/lib/queries/products";
import { useVendorReviews } from "@/lib/queries/reviews";
import { useAdBenchmarks } from "@/lib/queries/ads";
import {
  TIME_WINDOWS, WINDOW_DAYS, METRIC_SCOPE_NOTE, type TimeWindowLabel,
  useVendorOrderValue, orderValueSince, formatInrCompact,
  useVendorResponsiveness, formatDelay,
  useLeadFunnelData, funnelForWindow,
  useRepeatBuyers, useVendorProductRatings,
  inWindow, inPriorWindow,
} from "@/lib/queries/vendorAnalytics";
import { useVendorCalls, callAnalyticsForWindow, MISSED_CALLS_UNAVAILABLE } from "@/lib/queries/callAnalytics";
import { useAdPerformance, campaignEconomics, REVENUE_PER_LEAD_LABEL } from "@/lib/queries/adPerformance";
import { useBuyerGeography, coverageSentence, coveragePct } from "@/lib/queries/buyerGeography";
import {
  useEngagementWindow, dailySeries, trafficSources, visitorCounts,
  queryPerformance, adAttribution, ctaPerformance, logEngagement,
} from "@/lib/queries/engagement";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye, MessageSquare, Target, Package, ArrowUpRight, ArrowDownRight,
  Activity, BarChart3, Sparkles, Star, Wallet, CheckCircle2, Clock,
  Phone, PhoneIncoming, Users, Megaphone, Info, ChevronRight, Minus, MapPin, Home,
  Search, MousePointerClick, UserCircle,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────────
// Vendor Analytics.
//
// Every figure on this page is counted from a real row the vendor owns. The
// page previously shipped five hardcoded chart fixtures (viewsData, weeklyData,
// sourceData, categoryData, inquiryData) and a fabricated Ratings Snapshot;
// those are gone. What replaced each of them:
//
//   Views by Category  → grouped from the vendor's own products by
//                        category_name, weighted by real views_count.
//   Traffic Sources    → rebuilt on engagement_events.source, populated at each
//                        call site (search results → 'organic_search', an ad →
//                        'ad', …). It was deleted outright first, because
//                        increment_product_view(p) takes only the product id and
//                        records no referrer at all — there was nothing to fix,
//                        only something to build.
//   Ratings Snapshot   → useVendorReviews + per-product ratings, with a real
//                        window-over-window trend off reviews.created_at.
//   Performance Trends /
//   Weekly Views       → rebuilt on engagement_events' real per-event
//                        timestamps, so the range filter drives them.
//   Inquiries & Conversions
//                      → not restored. The Lead to Order funnel above is the
//                        same question answered from rows that actually exist.
//
// THE TIME FILTER IS HONEST. Each card carries either the active window label
// or a "Lifetime" pill explaining why a date range cannot apply to it. A filter
// click must never appear to do something it did not do.
//
// THREE STATES, NOT TWO, for every engagement_events panel: the table missing
// (migration not applied) is reported differently from the table being empty.
// Collapsing them is how a broken page passes for an empty one.
// ─────────────────────────────────────────────────────────────

const categoryColors = ["#E11D48", "#2563EB", "#F97316", "#A855F7", "#14B8A6", "#0EA5E9", "#F59E0B"];

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n));

// ── Scope pill ───────────────────────────────────────────────────────────
// The whole point of the time filter fix: a card says which of the two kinds
// of metric it is, so a filter click is never silently ignored.
function ScopePill({ window, lifetime, reason }: { window?: TimeWindowLabel; lifetime?: boolean; reason?: string }) {
  if (lifetime) {
    return (
      <span
        title={reason ?? METRIC_SCOPE_NOTE}
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      >
        <Info className="h-2.5 w-2.5" /> Lifetime
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
      Last {window}
    </span>
  );
}

// A metric that has no backing data at all, said plainly rather than drawn.
function UnavailablePanel({ title, reason }: { title: string; reason: string }) {
  return (
    <Card className="rounded-xl border-dashed">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{reason}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Deliberately generic: the same notice serves the trend charts, Traffic
// Sources, search terms and the CTA panel, and every one of them is blocked by
// the same single fact.
const NO_EVENT_HISTORY =
  "Visit-level tracking is not switched on for this project yet. This panel needs one row per event, with its own timestamp, viewer and source; until the engagement_events table exists a view only bumps a lifetime counter on the product, so there is nothing here to read.";

/** Table exists, window simply has no rows in it — a real empty state. */
const NO_EVENTS_IN_WINDOW = (range: string) =>
  `No tracked activity in the last ${range}. This fills in as buyers browse, search and tap your listings.`;

// A panel over engagement_events. Keeps "not switched on" and "nothing
// happened" visibly distinct instead of rendering one for the other.
function EventPanel({
  title, ready, hasData, range, scope, children,
}: {
  title: string; ready: boolean; hasData: boolean; range: string;
  scope?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card className={`rounded-xl${ready ? "" : " border-dashed"}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={`text-base${ready ? "" : " text-muted-foreground"}`}>{title}</CardTitle>
          {ready && scope}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {!ready ? (
          <div className="mx-2 flex items-start gap-2 rounded-lg bg-muted/40 p-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">{NO_EVENT_HISTORY}</p>
          </div>
        ) : hasData ? (
          children
        ) : (
          <p className="px-2 text-sm text-muted-foreground">{NO_EVENTS_IN_WINDOW(range)}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── 3.8 Where your buyers are ────────────────────────────────────────────
//
// NO MAP YET, AND THAT IS A DELIBERATE STOP RATHER THAN AN OVERSIGHT.
// The spec called for MapLibre GL JS "so no new dependency" — true of
// Cosora-Admin, which is a SEPARATE REPO. `maplibre-gl` is not in this
// project's package.json and is not installed. Adding it here would mean
// editing package.json/package-lock.json, which a concurrent session is
// actively changing, plus ~800 KB on a bundle already at 745 KB gzipped and a
// runtime tile-provider dependency on a page that otherwise needs no network
// beyond Supabase. The alternative — hand-drawing Indian state boundaries as
// inline SVG — would mean inventing geography, which is the exact class of
// fabrication the rest of this page was built to remove.
//
// So this ships the half that is genuinely useful and genuinely honest: the
// ranked list plus the coverage line. The data shape below is already what a
// choropleth needs (`states`, each with a name and a count), so the map is an
// additive change to this component, not a rewrite.
function BuyerGeographyCard({ vendorId, days, rangeLabel }: { vendorId: string | undefined; days: number; rangeLabel: string }) {
  const { data: geo, isPending } = useBuyerGeography(vendorId, days);
  const coverage = coverageSentence(geo);
  const pct = coveragePct(geo);

  const body = () => {
    if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
    // A refusal is not an empty result. Kept distinct on purpose.
    if (!geo || geo.denied) {
      return <p className="text-sm text-muted-foreground">This breakdown is only visible to the vendor it describes.</p>;
    }
    // Genuinely empty: nobody visited in this window.
    if (!geo.hasData) {
      return (
        <p className="text-sm text-muted-foreground">
          No buyer visits in the last {rangeLabel} yet. Product views, storefront visits and search
          clicks all count towards this.
        </p>
      );
    }
    // Visits happened, but not one of them carried a location. Different
    // statement from "no visits", and said differently.
    if (geo.coverage.eventsWithLocation === 0) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {geo.coverage.totalEvents} buyer visit{geo.coverage.totalEvents === 1 ? "" : "s"} in the last {rangeLabel},
            but none of those buyers has a saved location yet — so there is nothing to place on a map.
          </p>
          <p className="text-xs text-muted-foreground">
            Buyers who signed up before location was stored have none on file, and it cannot be recovered
            after the fact. This fills in as new buyers complete their profile.
          </p>
        </div>
      );
    }

    const maxEvents = Math.max(...geo.states.map((x) => x.events), ...geo.cities.map((x) => x.events), 1);

    return (
      <div className="space-y-4">
        {/* Vendor's own registered location, marked distinctly from demand. */}
        {geo.homeLocation?.city || geo.homeLocation?.state ? (
          <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
            <Home className="h-3.5 w-3.5 shrink-0 text-accent" />
            <p className="text-xs text-foreground">
              You are registered in{" "}
              <span className="font-semibold">
                {[geo.homeLocation.city, geo.homeLocation.state].filter(Boolean).join(", ")}
              </span>
            </p>
          </div>
        ) : null}

        {geo.states.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">By state</p>
            <div className="space-y-2">
              {geo.states.map((st) => (
                <div key={st.state}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm text-foreground">{st.state}</p>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {st.events} visit{st.events === 1 ? "" : "s"} · {st.viewers} buyer{st.viewers === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(st.events / maxEvents) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {geo.cities.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">By city</p>
            <div className="space-y-1.5">
              {geo.cities.map((c) => (
                <div key={`${c.city}-${c.state ?? ""}`} className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5">
                  <p className="min-w-0 truncate text-sm text-foreground">
                    {c.city}
                    {c.state && <span className="text-muted-foreground">, {c.state}</span>}
                  </p>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {c.events} · {c.viewers} buyer{c.viewers === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suppressed places. Shown, never silently dropped, so the totals add up. */}
        {geo.other.places > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {geo.other.events} visit{geo.other.events === 1 ? "" : "s"} from {geo.other.places} other
            place{geo.other.places === 1 ? "" : "s"} are grouped together — a place is only named once at
            least {geo.minViewers} different buyers there have visited, so no individual buyer can be
            identified from this.
          </p>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <MapPin className="h-4 w-4 text-muted-foreground" /> Where your buyers are
          </CardTitle>
          <ScopePill window={rangeLabel as never} />
        </div>
        {/* Always rendered when there is any traffic — a caveat that only shows
            up when the news is bad trains the reader to ignore it. */}
        {coverage && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {coverage}
            {pct != null && pct < 50 && (
              <span className="text-orange-600"> That is {pct}% of recent visits — treat this as a partial picture.</span>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">{body()}</CardContent>
    </Card>
  );
}

const Analytics = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: dash } = useVendorDashboard(user?.id);
  const { data: myProducts = [] } = useMyProducts(user?.id);
  const { data: reviewData } = useVendorReviews(user?.id);
  const { data: productRatings = [] } = useVendorProductRatings(user?.id);
  const { data: orderValue } = useVendorOrderValue(user?.id);
  const { data: responsiveness } = useVendorResponsiveness(user?.id);
  const { data: funnelData } = useLeadFunnelData(user?.id);
  const { data: repeat } = useRepeatBuyers(user?.id);
  const { data: callRows } = useVendorCalls(user?.id);
  const { data: adPerf } = useAdPerformance(user?.id);
  const { data: benchmarks } = useAdBenchmarks(user?.id);

  const [activeTime, setActiveTime] = useState<TimeWindowLabel>("7 days");
  const [sortBy, setSortBy] = useState<"views" | "inquiries">("views");
  const days = WINDOW_DAYS[activeTime];


  // ── Lifetime KPIs (counter-backed — see ScopePill lifetime) ──
  const totalViews = myProducts.reduce((s, p) => s + p.views, 0);
  const liveCount = myProducts.filter((p) => p.status === "active").length;
  const inactiveCount = myProducts.length - liveCount;
  const inquiries = dash?.enquiries ?? myProducts.reduce((s, p) => s + p.inquiries, 0);
  const convRate = totalViews > 0 ? (inquiries / totalViews) * 100 : 0;
  // views_count and enquiries_count are two independent counters that were not
  // necessarily incremented over the same period, so their ratio can exceed
  // 100% — this vendor sits at 15,425%. A four-figure "conversion rate" is not
  // a conversion rate, and printing one would undermine every honest figure
  // beside it. Above 100% the card shows the two counts it is built from and
  // says why, rather than a percentage that cannot mean what it claims.
  const convRateMeaningful = convRate > 0 && convRate <= 100;

  const stats = [
    { title: "Total Views", value: fmtNum(totalViews), change: `${liveCount} live product${liveCount === 1 ? "" : "s"}`, positive: true, icon: Eye, lifetime: true },
    { title: "Inquiries", value: fmtNum(inquiries), change: "From interested buyers", positive: true, icon: MessageSquare, lifetime: true },
    {
      title: "Conversion",
      value: convRateMeaningful ? `${convRate.toFixed(1)}%` : "—",
      change: convRateMeaningful
        ? "inquiries ÷ views"
        : totalViews === 0
          ? "no views recorded yet"
          : `${fmtNum(inquiries)} inquiries vs ${fmtNum(totalViews)} views — counters not comparable`,
      positive: convRateMeaningful,
      icon: Target,
      lifetime: true,
    },
    { title: "Active Products", value: String(liveCount), change: inactiveCount > 0 ? `${inactiveCount} not live` : "all live", positive: inactiveCount === 0, icon: Package, lifetime: true },
  ];

  // ── 1.4 Total Order Value (windowed; shared with the Quotes page) ──
  const tovWindow = orderValueSince(orderValue, days);
  const tovPrior = (orderValue?.orders ?? [])
    .filter((o) => inPriorWindow(o.createdAt, days))
    .reduce((s, o) => s + o.value, 0);
  const tovDelta = tovPrior > 0 ? Math.round(((tovWindow - tovPrior) / tovPrior) * 100) : null;

  // ── 1.6 Quote acceptance rate (lifetime counts from useVendorDashboard) ──
  const quotesSent = dash?.quotesSent ?? 0;
  const quotesAccepted = dash?.quotesAccepted ?? 0;
  const acceptanceRate = quotesSent > 0 ? (quotesAccepted / quotesSent) * 100 : null;

  // ── 1.2 Views by Category — real, from the vendor's own rows ──
  const categoryBreakdown = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const p of myProducts) {
      const key = p.categoryName?.trim() || "Uncategorised";
      byCat.set(key, (byCat.get(key) ?? 0) + p.views);
    }
    const rows = Array.from(byCat, ([name, views]) => ({ name, views }))
      .filter((r) => r.views > 0)
      .sort((a, b) => b.views - a.views);
    const total = rows.reduce((s, r) => s + r.views, 0);
    return rows.map((r) => ({ ...r, percent: total ? Math.round((r.views / total) * 100) : 0 }));
  }, [myProducts]);

  // ── 1.1 Ratings scorecard ──
  const reviews = reviewData?.reviews ?? [];
  const fiveStar = reviewData?.breakdown?.find((b) => b.stars === 5);
  const windowReviews = reviews.filter((r) => inWindow(r.createdAt, days));
  const priorReviews = reviews.filter((r) => inPriorWindow(r.createdAt, days));
  const avgOf = (rs: { rating: number }[]) => (rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null);
  const windowAvg = avgOf(windowReviews);
  const priorAvg = avgOf(priorReviews);
  const ratingTrend = windowAvg != null && priorAvg != null ? windowAvg - priorAvg : null;
  const topRated = productRatings[0] ?? null;
  const worstRated = productRatings.length > 1 ? productRatings[productRatings.length - 1] : null;

  // ── 2.1 Funnel ──
  const funnel = funnelForWindow(funnelData, days);

  // ── 2.3 Calls ──
  const calls = callAnalyticsForWindow(callRows, days);

  // ── Phase 3: the visit-level event log ──
  // `installed` is a THIRD state, distinct from "no events yet": until the
  // 20260907170000 migration is applied PostgREST answers PGRST205, and a panel
  // that rendered "no data" for a table that does not exist would be a broken
  // page passing for an empty one.
  const { data: events } = useEngagementWindow(user?.id, days);
  const eventsReady = events?.installed === true;
  const series = dailySeries(events, days);
  const sources = trafficSources(events);
  const visitors = visitorCounts(events);
  const searchTerms = queryPerformance(events);
  const adAttrib = adAttribution(events);
  const ctaRows = ctaPerformance(events, calls.total);
  const hasSeriesData = eventsReady && series.some((d) => d.views > 0 || d.adClicks > 0);

  // ── 2.8 Per-campaign economics ──
  const leadDates = (funnelData?.rfqs ?? []).map((r) => r.createdAt);
  const campaigns = campaignEconomics(adPerf, leadDates);

  // ── 2.7 Profile-score gaps, from the exact weights the dashboard ring uses ──
  const scoreGaps = dash?.scoreInput
    ? profileScoreSignals(dash.scoreInput).filter((s) => !s.met).sort((a, b) => b.points - a.points).slice(0, 2)
    : [];

  // ── Real top products by views / inquiries ──
  const realTop = myProducts.map((p) => ({ id: p.id, name: p.name, views: p.views, inquiries: p.inquiries }));
  const sorted = [...realTop]
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, 5)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-24">
        {/* Header */}
        <motion.div variants={section}>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Every figure here is counted from your real rows. Cards marked{" "}
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              <Info className="h-2.5 w-2.5" /> Lifetime
            </span>{" "}
            are backed by running totals that store no per-event date, so the range filter cannot narrow them yet.
          </p>
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            {TIME_WINDOWS.map((f) => (
              <motion.button
                key={f}
                whileTap={TAP}
                transition={TAP_T}
                onClick={() => setActiveTime(f)}
                className={`rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors ${
                  activeTime === f
                    ? "bg-accent/10 text-accent border border-accent/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {f}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.title} variants={listItem}>
                <Card className="rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-muted-foreground">{s.title}</p>
                          <ScopePill lifetime />
                        </div>
                        <p className="text-xl font-bold text-foreground mt-0.5">{s.value}</p>
                        <div className={`flex items-center gap-0.5 mt-1 text-xs font-medium ${s.positive ? "text-green-600" : "text-red-500"}`}>
                          {s.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {s.change}
                        </div>
                      </div>
                      <div className="rounded-lg bg-accent/10 p-2 shrink-0">
                        <Icon className="w-4 h-4 text-accent" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* ── 1.4 Total Order Value + 1.6 Quote acceptance rate ── */}
        <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
          <motion.div variants={listItem}>
            <Card className="rounded-xl border-[#ef4d62]/20 bg-gradient-to-br from-[#ef4d62]/10 to-transparent">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">Total Order Value</p>
                      <ScopePill window={activeTime} />
                    </div>
                    <p className="mt-0.5 text-xl font-bold text-[#ef4d62]">{formatInrCompact(tovWindow)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tovDelta != null ? (
                        <span className={tovDelta >= 0 ? "text-green-600" : "text-red-500"}>
                          {tovDelta >= 0 ? "+" : ""}{tovDelta}% vs previous {activeTime}
                        </span>
                      ) : (
                        `${formatInrCompact(orderValue?.total ?? 0)} won all time`
                      )}
                    </p>
                    {(orderValue?.unpriced ?? 0) > 0 && (
                      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                        {orderValue?.unpriced} accepted quote{orderValue?.unpriced === 1 ? "" : "s"} had no quantity on the RFQ and count as ₹0.
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-[#ef4d62]/10 p-2 shrink-0">
                    <Wallet className="w-4 h-4 text-[#ef4d62]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={listItem}>
            <Card className="rounded-xl border-green-200 bg-gradient-to-br from-green-50 to-transparent">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">Quote Acceptance</p>
                      <ScopePill lifetime reason="Counted over every quote you have ever sent." />
                    </div>
                    <p className="mt-0.5 text-xl font-bold text-green-600">
                      {acceptanceRate != null ? `${acceptanceRate.toFixed(0)}%` : "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {quotesSent > 0
                        ? `${quotesAccepted} accepted of ${quotesSent} sent`
                        : "Send your first quote to start this"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-green-100 p-2 shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/*
          Performance Trends. Was a seven-point views/inquiries line chart with
          invented values (Jan 1200 … Jul 3800); it is now one point per day
          across the selected range, counted from engagement_events. The
          "Inquiries & Conversions" chart that shared its fixture shape is not
          restored — the Lead to Order card below answers the same question from
          rows that actually exist.
        */}
        <motion.div variants={section}>
          <EventPanel
            title="Performance Trends"
            ready={eventsReady}
            hasData={hasSeriesData}
            range={activeTime}
            scope={<ScopePill window={activeTime} />}
          >
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 87%)" />
                  <XAxis dataKey="name" stroke="hsl(0, 0%, 45%)" fontSize={11} tickLine={false}
                    interval={Math.max(0, Math.floor(series.length / 7) - 1)} />
                  <YAxis stroke="hsl(0, 0%, 45%)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} />
                  <Legend />
                  <Line type="monotone" dataKey="views" stroke="hsl(352, 85%, 62%)" strokeWidth={2} dot={false} name="Views" />
                  <Line type="monotone" dataKey="adClicks" stroke="hsl(220, 70%, 55%)" strokeWidth={2} dot={false} name="Ad clicks" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* 3.4 — unique visitors ALONGSIDE total views, never instead of it. */}
            <div className="mt-3 grid grid-cols-2 gap-2 px-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Product views</p>
                <p className="mt-0.5 text-xl font-bold text-foreground tabular-nums">{visitors.totalViews}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">every view, including repeats</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Unique visitors</p>
                <p className="mt-0.5 text-xl font-bold text-foreground tabular-nums">{visitors.uniqueVisitors}</p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                  {visitors.signedOutViews > 0
                    ? "a lower bound — signed-out visitors are deduped per session only"
                    : "distinct signed-in buyers"}
                </p>
              </div>
            </div>
          </EventPanel>
        </motion.div>

        {/* ── 1.7 + 2.2 Responsiveness: one query, headline + action list ── */}
        <motion.div variants={section}>
          <Card className="rounded-xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Buyer Responsiveness</CardTitle>
                <ScopePill lifetime reason="Measured across every buyer thread you have, not a date range." />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {responsiveness && responsiveness.measured > 0 ? (
                <>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {responsiveness.within24hPct}%
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        of buyer messages get a first reply within 24 hours
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Across {responsiveness.measured} thread{responsiveness.measured === 1 ? "" : "s"} ·{" "}
                      {responsiveness.avgHours != null ? (
                        <>
                          average first reply{" "}
                          <span className="font-medium text-foreground">{formatDelay(responsiveness.avgHours)}</span>
                          {responsiveness.medianHours != null && (
                            <> · median <span className="font-medium text-foreground">{formatDelay(responsiveness.medianHours)}</span></>
                          )}
                        </>
                      ) : (
                        <>no thread has been answered yet, so there is no average to show</>
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No first-reply times to measure yet — a buyer has to open a thread before a response time exists.
                </p>
              )}

              {/* Action list — the page's AI-Insight-CTA idiom, not a bare stat */}
              <div className="space-y-2">
                {(responsiveness?.awaitingReply ?? 0) > 0 ? (
                  <button
                    onClick={() => navigate("/chat")}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-left transition-colors hover:bg-orange-100"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-orange-800">
                      <Clock className="h-4 w-4 shrink-0" />
                      {responsiveness?.awaitingReply} buyer{responsiveness?.awaitingReply === 1 ? " is" : "s are"} waiting on a reply
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-orange-500" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Every buyer thread has your reply
                  </div>
                )}

                <button
                  onClick={() => navigate("/chat")}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <PhoneIncoming className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {calls.total} call{calls.total === 1 ? "" : "s"} from buyers in the last {activeTime}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>

                {/* Missed calls is deliberately absent as a number. See
                    MISSED_CALLS_UNAVAILABLE in queries/callAnalytics.ts. */}
                <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Missed calls: {MISSED_CALLS_UNAVAILABLE}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── 2.1 Lead → order funnel ── */}
        <motion.div variants={section}>
          <Card className="rounded-xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Lead to Order</CardTitle>
                <ScopePill window={activeTime} />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {funnel.leads === 0 && funnel.quotesSent === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No buyer requirements or quotes in the last {activeTime}. Try a wider range.
                </p>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: "Buyer requirements you could quote on", value: funnel.leads, note: funnel.directLeads > 0 ? `${funnel.directLeads} sent to you directly` : null, color: "bg-blue-500" },
                    { label: "Quotes sent", value: funnel.quotesSent, note: null, color: "bg-indigo-500" },
                    { label: "Quotes accepted", value: funnel.quotesAccepted, note: null, color: "bg-green-500" },
                  ].map((stage) => {
                    const pct = funnel.leads > 0 ? Math.min(100, Math.round((stage.value / funnel.leads) * 100)) : 0;
                    return (
                      <div key={stage.label}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{stage.label}</p>
                          <p className="text-sm font-bold text-foreground tabular-nums">{stage.value}</p>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${Math.max(pct, stage.value > 0 ? 4 : 0)}%` }} />
                        </div>
                        {stage.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{stage.note}</p>}
                      </div>
                    );
                  })}
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-[#ef4d62]/20 bg-[#ef4d62]/5 p-3">
                    <span className="text-xs font-medium text-muted-foreground">Total Order Value won</span>
                    <span className="text-lg font-bold text-[#ef4d62]">{formatInrCompact(tovWindow)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tab Sections */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1 text-xs"><Activity className="w-3.5 h-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="views" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" />Views</TabsTrigger>
            <TabsTrigger value="search" className="gap-1 text-xs"><Search className="w-3.5 h-3.5" />Search</TabsTrigger>
            <TabsTrigger value="calls" className="gap-1 text-xs"><Phone className="w-3.5 h-3.5" />Actions</TabsTrigger>
            <TabsTrigger value="ads" className="gap-1 text-xs"><Megaphone className="w-3.5 h-3.5" />Ads</TabsTrigger>
            <TabsTrigger value="products" className="gap-1 text-xs"><Package className="w-3.5 h-3.5" />Products</TabsTrigger>
          </TabsList>

          {/* ── Overview: benchmarks + repeat buyers ── */}
          <TabsContent value="overview" className="mt-3 space-y-3">
            {/* 2.6 You vs category average — reuses the CompetitorAds hook */}
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">You vs Category Average</CardTitle>
                  <ScopePill lifetime reason="Anonymised aggregate across every seller in your categories." />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {benchmarks?.has_data ? (
                  <div className="space-y-3">
                    {[
                      { label: "Buyer reviews", yours: benchmarks.reviews.yours, peer: benchmarks.reviews.peer_avg },
                      { label: "Profile photos", yours: benchmarks.photos.yours, peer: benchmarks.photos.peer_avg },
                    ].map((row) => {
                      const ahead = row.yours >= row.peer;
                      const max = Math.max(row.yours, row.peer, 1);
                      return (
                        <div key={row.label}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs text-muted-foreground">{row.label}</p>
                            <p className={`text-xs font-semibold ${ahead ? "text-green-600" : "text-orange-600"}`}>
                              {row.yours} vs {row.peer} category avg
                            </p>
                          </div>
                          <div className="mt-1 space-y-1">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${ahead ? "bg-green-500" : "bg-orange-400"}`} style={{ width: `${(row.yours / max) * 100}%` }} />
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${(row.peer / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-muted-foreground">
                      Across {benchmarks.peer_vendor_count} seller{benchmarks.peer_vendor_count === 1 ? "" : "s"} in your categories.
                      No individual competitor is identified.
                    </p>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/competitor-ads")}>
                      Full benchmarks
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No category benchmarks yet — list a product in a category with other sellers to unlock this.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 2.4 Repeat buyers */}
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Repeat Buyers</CardTitle>
                  <ScopePill lifetime reason="Counted across every call, thread and direct request you have ever had." />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(repeat?.totalBuyers ?? 0) > 0 ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{repeat?.repeatBuyers}</p>
                      <p className="text-xs text-muted-foreground">
                        of {repeat?.totalBuyers} buyer{repeat?.totalBuyers === 1 ? "" : "s"} came back more than once
                        {repeat?.repeatPct != null && ` · ${repeat.repeatPct}%`}
                      </p>
                    </div>
                    <div className="rounded-lg bg-accent/10 p-2">
                      <Users className="h-5 w-5 text-accent" />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No buyers have contacted you yet.</p>
                )}
              </CardContent>
            </Card>

            {/* 3.8 Where your buyers are */}
            <BuyerGeographyCard vendorId={user?.id} days={days} rangeLabel={activeTime} />

            {/* 2.7 Profile-score gap nudge — same weights as the dashboard ring */}
            {scoreGaps.length > 0 && (
              <Card className="rounded-xl border-accent/20 bg-accent/5">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base">Close your profile score gap</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    You are at <span className="font-semibold text-foreground">{dash?.profileScore ?? 0}/100</span>. The
                    two biggest wins left:
                  </p>
                  {scoreGaps.map((gap) => (
                    <button
                      key={gap.key}
                      onClick={() => navigate(gap.href)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="text-sm text-foreground">{gap.label}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-accent">
                        +{gap.points} <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Views ── */}
          <TabsContent value="views" className="mt-3 space-y-3">
            <EventPanel
              title={days <= 7 ? "Daily Views" : "Views Over Time"}
              ready={eventsReady}
              hasData={hasSeriesData}
              range={activeTime}
              scope={<ScopePill window={activeTime} />}
            >
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,87%)" />
                    <XAxis dataKey="name" stroke="hsl(0,0%,45%)" fontSize={11}
                      interval={Math.max(0, Math.floor(series.length / 7) - 1)} />
                    <YAxis stroke="hsl(0,0%,45%)" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} />
                    <Bar dataKey="views" fill="hsl(352,85%,62%)" radius={[4, 4, 0, 0]} name="Views" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </EventPanel>

            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Views by Category</CardTitle>
                  <ScopePill lifetime />
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {categoryBreakdown.length >= 2 ? (
                  <>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryBreakdown}
                            dataKey="views"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={86}
                            paddingAngle={4}
                          >
                            {categoryBreakdown.map((entry, index) => (
                              <Cell key={entry.name} fill={categoryColors[index % categoryColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }}
                            formatter={(value: number, _name: string, payload: { payload?: { name?: string; percent?: number } }) => [
                              `${value} view${value === 1 ? "" : "s"} (${payload?.payload?.percent ?? 0}%)`,
                              payload?.payload?.name ?? "",
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 px-2 text-xs text-muted-foreground sm:grid-cols-3">
                      {categoryBreakdown.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          <span className="font-medium text-foreground">{item.percent}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="px-2 text-sm text-muted-foreground">
                    {categoryBreakdown.length === 1
                      ? `All your views so far are on ${categoryBreakdown[0].name}. List products in a second category to see a split.`
                      : "No views on your products yet — this fills in as buyers browse your listings."}
                  </p>
                )}
              </CardContent>
            </Card>

            {/*
              Traffic Sources, rebuilt. It was a fixed 40/30/20/10 split with
              nothing behind it and was deleted outright rather than hidden;
              this version reads engagement_events.source, which each call site
              populates from what it actually knows (search results →
              'organic_search', an ad tap → 'ad', a direct arrival → 'direct').
              Never reintroduce a default breakdown for an empty window.
            */}
            <EventPanel
              title="Traffic Sources"
              ready={eventsReady}
              hasData={sources.length > 0}
              range={activeTime}
              scope={<ScopePill window={activeTime} />}
            >
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sources} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,87%)" />
                    <XAxis type="number" allowDecimals={false} stroke="hsl(0,0%,45%)" fontSize={11} />
                    <YAxis dataKey="label" type="category" stroke="hsl(0,0%,45%)" fontSize={10} width={110} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }}
                      formatter={(v: number, _n: string, pl: { payload?: { percent?: number } }) => [`${v} view${v === 1 ? "" : "s"} (${pl?.payload?.percent ?? 0}%)`, "Views"]}
                    />
                    <Bar dataKey="count" fill="hsl(0,0%,21%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </EventPanel>
          </TabsContent>

          {/* ── 3.5 Search-query performance ── */}
          <TabsContent value="search" className="mt-3 space-y-3">
            <EventPanel
              title="Search Terms That Found You"
              ready={eventsReady}
              hasData={searchTerms.length > 0}
              range={activeTime}
              scope={<ScopePill window={activeTime} />}
            >
              <div className="px-2">
                <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                  Impressions are the searches where one of your listings appeared, counted once per search.
                  These are <span className="font-medium text-foreground">your own impressions only</span> — they say
                  how a term performs for you, not how it ranks across Cosora.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 pr-2 text-left">Search term</th>
                        <th className="py-2 text-right">Impressions</th>
                        <th className="py-2 pl-2 text-right">Clicks</th>
                        <th className="py-2 pl-2 text-right">Click rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchTerms.slice(0, 12).map((t) => (
                        <tr key={t.term} className="border-b last:border-0">
                          <td className="max-w-[180px] truncate py-2 pr-2 font-medium text-foreground">{t.term}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{t.impressions}</td>
                          <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{t.clicks}</td>
                          <td className="py-2 pl-2 text-right tabular-nums text-accent">{t.ctr != null ? `${t.ctr}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </EventPanel>
          </TabsContent>

          {/* ── 2.3 Calls + 3.7 CTA performance ── */}
          <TabsContent value="calls" className="mt-3 space-y-3">
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Call Volume</CardTitle>
                  <ScopePill window={activeTime} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Inbound", value: calls.inbound, hint: "Buyers calling you" },
                    { label: "Outbound", value: calls.outbound, hint: "Calls you placed" },
                    { label: "Total", value: calls.total, hint: `${calls.today} today` },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="mt-0.5 text-xl font-bold text-foreground tabular-nums">{c.value}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{c.hint}</p>
                    </div>
                  ))}
                </div>

                {calls.trendPct != null ? (
                  <p className={`flex items-center gap-1 text-xs font-medium ${calls.trendPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {calls.trendPct === 0 ? <Minus className="h-3 w-3" /> : calls.trendPct > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {calls.trendPct >= 0 ? "+" : ""}{calls.trendPct}% vs the previous {activeTime} ({calls.priorTotal} call{calls.priorTotal === 1 ? "" : "s"})
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No calls in the previous {activeTime} to compare against.</p>
                )}

                {calls.outbound === 0 && calls.inbound > 0 && (
                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    Only buyer-initiated calls are logged today — a call you place from a quote is not recorded, so
                    Outbound stays at zero.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">What Buyers Call About</CardTitle>
                  <ScopePill window={activeTime} />
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {calls.byContext.length > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={calls.byContext.slice(0, 6)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,87%)" />
                        <XAxis type="number" allowDecimals={false} stroke="hsl(0,0%,45%)" fontSize={11} />
                        <YAxis dataKey="context" type="category" stroke="hsl(0,0%,45%)" fontSize={10} width={110} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }}
                          formatter={(v: number) => [`${v} call${v === 1 ? "" : "s"}`, "Calls"]}
                        />
                        <Bar dataKey="count" fill="hsl(352,85%,62%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="px-2 text-sm text-muted-foreground">
                    No calls in the last {activeTime}. The product a buyer was viewing when they tapped Call Now shows up here.
                  </p>
                )}
              </CardContent>
            </Card>

            {/*
              3.7 — every tracked CTA in one place, Call Now included. `calls`
              was the only button in the app with any record of being pressed;
              reporting it on its own page is what made it easy to miss that
              nothing else was tracked at all.
            */}
            <EventPanel
              title="Button Performance"
              ready={eventsReady}
              hasData={ctaRows.length > 0}
              range={activeTime}
              scope={<ScopePill window={activeTime} />}
            >
              <div className="space-y-2 px-2">
                {ctaRows.map((row) => {
                  const max = Math.max(...ctaRows.map((r) => r.count), 1);
                  return (
                    <div key={row.name}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs text-foreground">{row.label}</p>
                        <p className="text-sm font-bold tabular-nums text-foreground">{row.count}</p>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Call Now is counted from the <span className="font-medium text-foreground">calls</span> table, which
                  predates the other buttons here — so its history goes back further than theirs.
                </p>
              </div>
            </EventPanel>
          </TabsContent>

          {/* ── 2.8 Per-campaign economics + 3.6 ad-attributed traffic ── */}
          <TabsContent value="ads" className="mt-3 space-y-3">
            {/*
              Profile views and product views bought by ads are reported as two
              numbers and never summed. They are different outcomes sold by
              different campaign goals — a vendor who paid for "Visit your
              profile" needs to see whether that is what they got, and one
              merged figure would hide exactly that.
            */}
            <EventPanel
              title="Ad-Attributed Traffic"
              ready={eventsReady}
              hasData={adAttrib.profileViews > 0 || adAttrib.productViews > 0}
              range={activeTime}
              scope={<ScopePill window={activeTime} />}
            >
              <div className="grid grid-cols-2 gap-3 px-2">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5">
                    <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Profile visits</p>
                  </div>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{adAttrib.profileViews}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    from Store Promotion / Brand Ad placements
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5">
                    <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Product visits</p>
                  </div>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{adAttrib.productViews}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    from every other placement
                  </p>
                </div>
              </div>
            </EventPanel>

            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base">Campaign Performance</CardTitle>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Cosora ads are flat-rate prepaid placements, so there is no cost-per-click or return-on-ad-spend to
                  report. Each row shows <span className="font-medium text-foreground">{REVENUE_PER_LEAD_LABEL}</span> —
                  what you booked for the campaign against the buyer requirements that arrived while it was live.
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No campaigns yet.{" "}
                    <button className="font-medium text-accent underline" onClick={() => navigate("/advertisements")}>
                      Run your first ad
                    </button>
                    .
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="py-2 pr-2 text-left">Campaign</th>
                          <th className="py-2 text-right">Impr.</th>
                          <th className="py-2 pl-2 text-right">Clicks</th>
                          <th className="py-2 pl-2 text-right">Booked</th>
                          <th className="py-2 pl-2 text-right">Per lead</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => (
                          <tr key={c.adId} className="border-b last:border-0">
                            <td className="max-w-[160px] py-2 pr-2">
                              <p className="truncate font-medium text-foreground">{c.title}</p>
                              <p className="text-[10px] capitalize text-muted-foreground">{c.status}</p>
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">{c.impressions.toLocaleString("en-IN")}</td>
                            <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{c.clicks.toLocaleString("en-IN")}</td>
                            <td className="py-2 pl-2 text-right tabular-nums font-medium text-foreground">{formatInrCompact(c.revenueBooked)}</td>
                            <td className="py-2 pl-2 text-right tabular-nums text-accent">
                              {c.revenuePerLead != null ? formatInrCompact(c.revenuePerLead) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(adPerf?.unattributed ?? 0) > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatInrCompact(adPerf?.unattributed ?? 0)} booked could not be matched to a specific campaign.
                      </p>
                    )}
                    {campaigns.every((c) => c.revenueBooked === 0) && (
                      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" />
                        No paid ad orders on record, so every campaign shows ₹0 booked. Campaigns published without a
                        payment (demo mode) genuinely booked nothing.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Products ── */}
          <TabsContent value="products" className="mt-3 space-y-3">
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Top Performing Products</CardTitle>
                    <ScopePill lifetime />
                  </div>
                  <div className="flex gap-1">
                    <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setSortBy("views")} className={`text-xs px-2 py-0.5 rounded-full ${sortBy === "views" ? "bg-accent/10 text-accent" : "text-muted-foreground"}`}>Views</motion.button>
                    <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setSortBy("inquiries")} className={`text-xs px-2 py-0.5 rounded-full ${sortBy === "inquiries" ? "bg-accent/10 text-accent" : "text-muted-foreground"}`}>Inquiries</motion.button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-2">#</th>
                        <th className="text-left py-2">Name</th>
                        <th className="text-right py-2">Views</th>
                        <th className="text-right py-2 pl-2">Inquiries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p) => (
                        <tr key={p.rank} className="border-b last:border-0">
                          <td className="py-2 pr-2 text-muted-foreground">{p.rank}</td>
                          <td className="py-2 font-medium">{p.name}</td>
                          <td className="py-2 text-right text-muted-foreground">{p.views.toLocaleString()}</td>
                          <td className="py-2 text-right pl-2 text-accent font-medium">{p.inquiries}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 2.5 Review-driven product insight */}
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Rated by Buyers</CardTitle>
                  <ScopePill lifetime reason="Every review ever left on your live products." />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {productRatings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    None of your live products have buyer reviews yet.
                  </p>
                ) : (
                  <>
                    {[
                      topRated ? { ...topRated, tag: "Best rated", tone: "text-green-600" } : null,
                      worstRated ? { ...worstRated, tag: "Needs attention", tone: "text-orange-600" } : null,
                    ]
                      .filter(Boolean)
                      .map((p) => (
                        <button
                          key={(p as { productId: string }).productId}
                          onClick={() => navigate(`/product/${(p as { productId: string }).productId}`)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <p className={`text-[10px] font-semibold uppercase tracking-wider ${(p as { tone: string }).tone}`}>
                              {(p as { tag: string }).tag}
                            </p>
                            <p className="truncate text-sm font-medium text-foreground">{(p as { name: string }).name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(p as { avg: number }).avg} ★ from {(p as { count: number }).count} review
                              {(p as { count: number }).count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* AI Insight */}
        <motion.div variants={section}>
          <Card className="rounded-xl bg-accent/5 border-accent/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-accent/10 p-2 mt-0.5">
                  <Sparkles className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    {sorted.length > 0 ? (
                      <>Your <span className="font-semibold">{sorted[0].name}</span> is your top listing with <span className="font-semibold text-accent">{sorted[0].views.toLocaleString("en-IN")} views</span> and {sorted[0].inquiries} inquiries. Consider running ads to maximize reach.</>
                    ) : (
                      <>Add products and they'll start collecting views and inquiries here. Running an ad boosts reach fast.</>
                    )}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 bg-accent text-accent-foreground text-xs"
                    onClick={() => {
                      void logEngagement({
                        eventType: "cta_click", ctaName: "promote_product",
                        vendorId: user?.id, productId: sorted[0]?.id ?? null,
                      });
                      navigate("/advertisements");
                    }}
                  >
                    Promote Product
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── 1.1 Ratings scorecard (real) ── */}
        <motion.div variants={section}>
          <Card className="rounded-xl border-accent/20 bg-gradient-to-br from-accent/5 via-card to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ratings Snapshot</p>
                    <ScopePill lifetime reason="Your all-time rating; the trend below is windowed." />
                  </div>
                  <p className="mt-1 text-3xl font-bold text-foreground">
                    {reviewData && reviewData.count > 0 ? `${reviewData.avg} / 5` : "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {reviewData && reviewData.count > 0
                      ? `${reviewData.count} review${reviewData.count === 1 ? "" : "s"}`
                      : "No reviews yet"}
                  </p>
                </div>
                <div className="rounded-lg bg-accent/10 p-2">
                  <Star className="h-5 w-5 fill-accent text-accent" />
                </div>
              </div>

              {reviewData && reviewData.count > 0 ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-background/70 p-3">
                      <p className="text-xs text-muted-foreground">5-star share</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {fiveStar?.percent ?? 0}%
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({fiveStar?.count ?? 0} of {reviewData.count})
                        </span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/70 p-3">
                      <p className="text-xs text-muted-foreground">Top rated live listing</p>
                      <p className="mt-1 truncate text-sm font-semibold text-foreground">
                        {topRated ? `${topRated.name} (${topRated.avg} ★)` : "No product reviews yet"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/70 p-3">
                      <p className="text-xs text-muted-foreground">Trend vs previous {activeTime}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {ratingTrend != null ? (
                          <span className={ratingTrend >= 0 ? "text-green-600" : "text-red-500"}>
                            {ratingTrend >= 0 ? "+" : ""}{ratingTrend.toFixed(1)} ★
                            <span className="ml-1 font-normal text-muted-foreground">
                              ({windowAvg?.toFixed(1)} vs {priorAvg?.toFixed(1)})
                            </span>
                          </span>
                        ) : windowReviews.length > 0 ? (
                          <span className="font-normal text-muted-foreground">
                            {windowReviews.length} new review{windowReviews.length === 1 ? "" : "s"}, none in the period before
                          </span>
                        ) : (
                          <span className="font-normal text-muted-foreground">No reviews in this range</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" className="mt-4 border-border" onClick={() => navigate("/reviews")}>
                    View Reviews
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Buyers who work with you can rate your business from your profile. Reviews are also worth{" "}
                  <span className="font-medium text-foreground">11 points</span> on your profile score.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Analytics;
