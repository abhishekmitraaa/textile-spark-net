import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Megaphone, BarChart2, MapPin, Star, Eye, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const chartData = [
  {day:"Mon",yours:12,comp:28},{day:"Tue",yours:19,comp:32},{day:"Wed",yours:15,comp:25},
  {day:"Thu",yours:22,comp:30},{day:"Fri",yours:28,comp:35},{day:"Sat",yours:18,comp:20},{day:"Sun",yours:10,comp:15},
];
interface CompetitorAd {
  name: string;
  rating: number;
  spend: number;
  categories: string[];
  pinCode: string;
  city: string;
  state: string;
  country: string;
  headline: string;
  subheadline: string;
  cta: string;
  offer: string;
  gradient: string;
}

const competitors: CompetitorAd[] = [
  {
    name: "Mumbai Textiles",
    rating: 4.6,
    spend: 4200,
    categories: ["Denim", "Formal Wear"],
    pinCode: "400001",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    headline: "Monsoon Ready Denim Drop",
    subheadline: "Bulk buyers get same-day quotations and fast dispatch slots.",
    cta: "Book Sample",
    offer: "Free shipping",
    gradient: "from-slate-950 via-slate-700 to-slate-500",
  },
  {
    name: "Delhi Garments",
    rating: 4.4,
    spend: 3600,
    categories: ["Formal", "Casual"],
    pinCode: "110001",
    city: "Delhi",
    state: "Delhi",
    country: "India",
    headline: "Office Wear That Sells Fast",
    subheadline: "Top-rated tailoring service for retailers scaling their catalogues.",
    cta: "Request Quote",
    offer: "Top 5 placement",
    gradient: "from-indigo-700 via-sky-600 to-cyan-500",
  },
  {
    name: "Surat Fab House",
    rating: 4.3,
    spend: 3100,
    categories: ["Knitwear", "Cotton"],
    pinCode: "395001",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    headline: "Soft Cotton Sets for Retail Chains",
    subheadline: "MOQ-friendly offers with GST invoices and export-ready packing.",
    cta: "Talk to Seller",
    offer: "12% off",
    gradient: "from-rose-600 via-pink-600 to-orange-500",
  },
  {
    name: "Tiruppur Mills",
    rating: 4.5,
    spend: 2800,
    categories: ["T-shirts", "Knitwear"],
    pinCode: "641601",
    city: "Tiruppur",
    state: "Tamil Nadu",
    country: "India",
    headline: "Fast-Moving T-Shirts For Buyers",
    subheadline: "Lead capture ad built for recurring wholesale orders.",
    cta: "View Samples",
    offer: "Low MOQ",
    gradient: "from-emerald-700 via-teal-600 to-cyan-500",
  },
  {
    name: "Jaipur Looms",
    rating: 4.1,
    spend: 2250,
    categories: ["Ethnic", "Handloom"],
    pinCode: "302001",
    city: "Jaipur",
    state: "Rajasthan",
    country: "India",
    headline: "Heritage Pieces for New Collections",
    subheadline: "Seasonal spotlight ad for fashion buyers and boutiques.",
    cta: "See Catalog",
    offer: "New arrival",
    gradient: "from-amber-700 via-orange-600 to-rose-500",
  },
  {
    name: "Ahmedabad Print Lab",
    rating: 4.0,
    spend: 1900,
    categories: ["Printing", "Trims"],
    pinCode: "380001",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    headline: "Print-Ready Collections",
    subheadline: "Promo creatives targeted at high-intent design buyers.",
    cta: "Promote Now",
    offer: "Design help",
    gradient: "from-violet-700 via-fuchsia-600 to-rose-500",
  },
];

const timeFilterOptions = [
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "30 days" },
  { value: "90days", label: "90 days" },
  { value: "1year", label: "Last year" },
  { value: "custom", label: "Custom", disabled: true },
];

const CompetitorAds = () => {
  const [timePeriod, setTimePeriod] = useState("7days");
  const [viewMode, setViewMode] = useState<"competitors" | "analysis">("competitors");
  const fadeUp = (delay: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay } });

  const sortedCompetitors = useMemo(() => [...competitors].sort((left, right) => right.spend - left.spend), []);
  const weeklyTotals = useMemo(
    () => chartData.reduce((totals, entry) => ({ yours: totals.yours + entry.yours, comp: totals.comp + entry.comp }), { yours: 0, comp: 0 }),
    []
  );
  const projectedNextMonth = useMemo(
    () => ({
      yours: Math.round(weeklyTotals.yours * 4.3 * 1.12),
      comp: Math.round(weeklyTotals.comp * 4.3 * 1.08),
    }),
    [weeklyTotals]
  );
  const reachGap = Math.max(projectedNextMonth.comp - projectedNextMonth.yours, 0);
  const topCompetitor = sortedCompetitors[0];

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-8">
        <motion.div {...fadeUp(0)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold font-display lg:text-2xl">Competitor Advertisements</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Monitor what competitors are promoting in your category</p>
            </div>
            <Button
              type="button"
              variant={viewMode === "analysis" ? "default" : "outline"}
              className={cn("shrink-0 gap-2", viewMode === "analysis" ? "bg-accent text-accent-foreground hover:bg-accent/90" : "border-border")}
              onClick={() => setViewMode((current) => (current === "competitors" ? "analysis" : "competitors"))}
            >
              <BarChart2 className="h-4 w-4" />
              {viewMode === "competitors" ? "View My Analysis" : "Back to Competitors"}
            </Button>
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.05)} className="flex flex-wrap gap-2">
          {timeFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => !option.disabled && setTimePeriod(option.value)}
              disabled={option.disabled}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-all",
                option.disabled
                  ? "cursor-not-allowed border-dashed border-border bg-muted/50 text-muted-foreground"
                  : timePeriod === option.value
                    ? "border-accent/30 bg-accent/10 font-medium text-accent"
                    : "border-border bg-card text-muted-foreground hover:border-accent/30"
              )}
              title={option.disabled ? "Coming soon" : undefined}
            >
              {option.label}
            </button>
          ))}
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-2xl font-bold">{sortedCompetitors.length}</p>
              <p className="text-xs text-muted-foreground">Total Competitor Ads</p>
              <Badge className="mt-1 border-green-500/20 bg-green-500/10 text-[10px] text-green-600">+3 this week</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-2xl font-bold">₹67</p>
              <p className="text-xs text-muted-foreground">Avg. Daily Budget</p>
              <div className="mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] text-muted-foreground">12% higher than you</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Comparison mode</p>
              <p className="text-sm font-semibold text-foreground">Switch between competitor intel and your own analysis</p>
              <p className="mt-1 text-xs text-muted-foreground">Use the button above to compare performance before launching an ad.</p>
            </CardContent>
          </Card>
        </motion.div>

        {viewMode === "analysis" ? (
          <motion.div {...fadeUp(0.12)}>
            <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 via-card to-transparent">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Eye className="h-4 w-4 text-accent" />
                  My Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "Projected monthly reach",
                      value: projectedNextMonth.yours.toLocaleString(),
                      note: "If current pacing holds",
                    },
                    {
                      label: "Top competitor spend",
                      value: `₹${topCompetitor.spend.toLocaleString()}/mo`,
                      note: topCompetitor.name,
                    },
                    {
                      label: "Gap to close",
                      value: reachGap.toLocaleString(),
                      note: "Add Search + Featured listings",
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-border bg-background/80 p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{item.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/70 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Open the full dashboard</p>
                    <p className="text-sm font-medium text-foreground">Go deeper with performance trends, inquiries, and product insights.</p>
                  </div>
                  <Link to="/analytics">
                    <Button variant="outline" className="h-9 border-border">
                      Open Analytics
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        <motion.div {...fadeUp(0.15)}>
          <p className="text-base font-semibold font-display">Your Competitors' Ads</p>
          <p className="text-xs text-muted-foreground mb-3">Top 6 competitors sorted by highest ad spend in your category and area</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedCompetitors.map((competitor) => (
              <Card key={competitor.name} className="overflow-hidden border-border">
                <div className={cn("flex min-h-56 flex-col justify-between bg-gradient-to-br p-4 text-white", competitor.gradient)}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-white/60">Latest creative</p>
                      <p className="mt-2 text-lg font-semibold leading-tight">{competitor.headline}</p>
                      <p className="mt-1 text-sm text-white/80">{competitor.subheadline}</p>
                    </div>
                    <Badge className="border-white/20 bg-white/10 text-white">{competitor.offer}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {competitor.categories.map((category) => (
                      <span key={category} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium text-white/90">
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{competitor.name}</p>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{competitor.city}, {competitor.state}, {competitor.country}</span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-medium">{competitor.rating}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">₹{competitor.spend}/mo</Badge>
                    <span>{competitor.pinCode}</span>
                  </div>
                  <Button size="sm" className="mt-3 h-8 w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    Advertise Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.2)}>
          <Card>
            <CardContent className="p-4">
              <div className="mb-1 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold font-display mb-0.5">Monthly Competition vs Your Reach</p>
                  <p className="text-xs text-muted-foreground">Ad impressions by day and projected next month</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Projected next month: {projectedNextMonth.yours.toLocaleString()} vs {projectedNextMonth.comp.toLocaleString()}
                </Badge>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={8} barGap={2}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="comp" name="Competition" fill="hsl(220 12% 87%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="yours" name="You" fill="hsl(352 85% 62%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-sm bg-accent" />
                  <span className="text-xs text-muted-foreground">You</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-sm bg-secondary" />
                  <span className="text-xs text-muted-foreground">Avg. Competitor</span>
                </div>
                <span className="text-xs text-muted-foreground">Gap to close: {reachGap.toLocaleString()} impressions</span>
              </div>
              <Link to="/advertisements">
                <Button variant="outline" className="mt-3 h-9 w-full gap-2 text-sm">
                  <Megaphone className="h-4 w-4" /> Create Your Ad Now
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeUp(0.25)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { title: "Reviews Collected This Month", you: 3, avg: 12, youPct: 25, href: "/reviews", cta: "Ask More Reviews →" },
            { title: "Product Photos Uploaded", you: 8, avg: 24, youPct: 33, href: "/upload", cta: "Upload More Photos →" },
          ].map(item => (
            <Card key={item.title}><CardContent className="p-4">
              <p className="text-sm font-semibold">{item.title}</p>
              <div className="flex justify-around my-3">
                <div className="text-center"><p className="text-3xl font-bold text-accent">{item.you}</p><p className="text-xs text-muted-foreground">You</p></div>
                <div className="w-px bg-border self-stretch"/>
                <div className="text-center"><p className="text-3xl font-bold text-foreground">{item.avg}</p><p className="text-xs text-muted-foreground">Competition avg.</p></div>
              </div>
              <div className="space-y-1.5">
                {[["You", item.youPct, "bg-accent"],["Avg.", 100, "bg-muted-foreground"]].map(([label, pct, color]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">{label}</span>
                    <div className="flex-1 bg-muted h-2 rounded-full"><div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }}/></div>
                  </div>
                ))}
              </div>
              <Link to={item.href}>
                <Button className="w-full mt-3 h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90">{item.cta}</Button>
              </Link>
            </CardContent></Card>
          ))}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};
export default CompetitorAds;