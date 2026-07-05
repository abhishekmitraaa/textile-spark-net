import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorDashboard } from "@/lib/queries/vendorDashboard";
import { useMyProducts } from "@/lib/queries/products";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye, MessageSquare, Target, Package, ArrowUpRight, ArrowDownRight,
  Activity, BarChart3, Sparkles,
  Star,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const viewsData = [
  { name: "Jan", views: 1200, inquiries: 45 },
  { name: "Feb", views: 1900, inquiries: 68 },
  { name: "Mar", views: 2400, inquiries: 89 },
  { name: "Apr", views: 1800, inquiries: 72 },
  { name: "May", views: 2800, inquiries: 95 },
  { name: "Jun", views: 3200, inquiries: 112 },
  { name: "Jul", views: 3800, inquiries: 134 },
];

const weeklyData = [
  { name: "Mon", views: 420 }, { name: "Tue", views: 380 },
  { name: "Wed", views: 520 }, { name: "Thu", views: 480 },
  { name: "Fri", views: 590 }, { name: "Sat", views: 340 },
  { name: "Sun", views: 280 },
];

const sourceData = [
  { name: "Direct Search", value: 40 }, { name: "Browse Category", value: 30 },
  { name: "Recommendations", value: 20 }, { name: "External Links", value: 10 },
];

const categoryData = [
  { name: "Cotton Fabrics", value: 35 },
  { name: "Silk", value: 25 },
  { name: "Linen", value: 20 },
  { name: "Wool", value: 12 },
  { name: "Other", value: 8 },
];

const categoryColors = ["#E11D48", "#2563EB", "#F97316", "#A855F7", "#14B8A6"];

const inquiryData = [
  { name: "Jan", inquiries: 45, conversions: 12 },
  { name: "Feb", inquiries: 68, conversions: 18 },
  { name: "Mar", inquiries: 89, conversions: 24 },
  { name: "Apr", inquiries: 72, conversions: 20 },
  { name: "May", inquiries: 95, conversions: 28 },
  { name: "Jun", inquiries: 112, conversions: 35 },
  { name: "Jul", inquiries: 134, conversions: 42 },
];

const topProducts = [
  { rank: 1, name: "Premium Cotton Blend", views: 1245, inquiries: 48 },
  { rank: 2, name: "Italian Silk Collection", views: 987, inquiries: 42 },
  { rank: 3, name: "Sustainable Linen", views: 856, inquiries: 35 },
  { rank: 4, name: "Designer Wool Tweed", views: 654, inquiries: 28 },
  { rank: 5, name: "Organic Hemp Fabric", views: 543, inquiries: 21 },
];

const stats = [
  { title: "Total Views", value: "12.4K", change: "+18.2%", positive: true, icon: Eye },
  { title: "Inquiries", value: "156", change: "+24.5%", positive: true, icon: MessageSquare },
  { title: "Conversion Rate", value: "3.2%", change: "+0.4%", positive: true, icon: Target },
  { title: "Active Products", value: "48", change: "5 inactive", positive: false, icon: Package },
];

const timeFilters = ["7 days", "30 days", "90 days", "1 year"];

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

const Analytics = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: dash } = useVendorDashboard(user?.id);
  const { data: myProducts = [] } = useMyProducts(user?.id);
  const [activeTime, setActiveTime] = useState("7 days");
  const [sortBy, setSortBy] = useState<"views" | "inquiries">("views");

  // Real KPIs derived from the vendor's own data (were hardcoded).
  const totalViews = myProducts.reduce((s, p) => s + p.views, 0);
  const liveCount = myProducts.filter((p) => p.status === "active").length;
  const inactiveCount = myProducts.length - liveCount;
  const inquiries = dash?.enquiries ?? myProducts.reduce((s, p) => s + p.inquiries, 0);
  const convRate = totalViews > 0 ? (inquiries / totalViews) * 100 : 0;

  const stats = [
    { title: "Total Views", value: fmtNum(totalViews), change: `${liveCount} live product${liveCount === 1 ? "" : "s"}`, positive: true, icon: Eye },
    { title: "Inquiries", value: fmtNum(inquiries), change: "From interested buyers", positive: true, icon: MessageSquare },
    { title: "Conversion", value: `${convRate.toFixed(1)}%`, change: "inquiries ÷ views", positive: convRate > 0, icon: Target },
    { title: "Active Products", value: String(liveCount), change: inactiveCount > 0 ? `${inactiveCount} not live` : "all live", positive: inactiveCount === 0, icon: Package },
  ];

  // Real top products by views / inquiries.
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
            Stat cards and Top Products reflect your live data. Trend charts are illustrative until visit-level tracking is enabled.
          </p>
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            {timeFilters.map((f) => (
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
                      <div>
                        <p className="text-xs text-muted-foreground">{s.title}</p>
                        <p className="text-xl font-bold text-foreground mt-0.5">{s.value}</p>
                        <div className={`flex items-center gap-0.5 mt-1 text-xs font-medium ${s.positive ? "text-green-600" : "text-red-500"}`}>
                          {s.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {s.change}
                        </div>
                      </div>
                      <div className="rounded-lg bg-accent/10 p-2">
                        <Icon className="w-4 h-4 text-accent" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Performance Trends */}
        <motion.div variants={section}>
          <Card className="rounded-xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Performance Trends</CardTitle>
                <Badge variant="secondary" className="text-xs gap-1">
                  <ArrowUpRight className="w-3 h-3" /> +18%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={viewsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 87%)" />
                    <XAxis dataKey="name" stroke="hsl(0, 0%, 45%)" fontSize={11} tickLine={false} />
                    <YAxis stroke="hsl(0, 0%, 45%)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} />
                    <Legend />
                    <Line type="monotone" dataKey="views" stroke="hsl(352, 85%, 62%)" strokeWidth={2} dot={false} name="Views" />
                    <Line type="monotone" dataKey="inquiries" stroke="hsl(220, 70%, 55%)" strokeWidth={2} dot={false} name="Inquiries" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tab Sections */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1 text-xs"><Activity className="w-3.5 h-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="views" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" />Views</TabsTrigger>
            <TabsTrigger value="inquiries" className="gap-1 text-xs"><MessageSquare className="w-3.5 h-3.5" />Inquiries</TabsTrigger>
            <TabsTrigger value="products" className="gap-1 text-xs"><Package className="w-3.5 h-3.5" />Products</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 space-y-3">
            <Card className="rounded-xl">
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                Overview shows combined metrics across all tabs. Select a specific tab for details.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="views" className="mt-3 space-y-3">
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Weekly Views</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,87%)" />
                      <XAxis dataKey="name" stroke="hsl(0,0%,45%)" fontSize={11} />
                      <YAxis stroke="hsl(0,0%,45%)" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} />
                      <Bar dataKey="views" fill="hsl(352,85%,62%)" radius={[4, 4, 0, 0]} name="Views" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Views by Category</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={86}
                        paddingAngle={4}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={entry.name} fill={categoryColors[index % categoryColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} formatter={(value: number, name: string, payload: { payload?: { name?: string } }) => [`${value}%`, payload?.payload?.name ?? name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 px-2 text-xs text-muted-foreground sm:grid-cols-3">
                  {categoryData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="font-medium text-foreground">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Traffic Sources</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sourceData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,87%)" />
                      <XAxis type="number" stroke="hsl(0,0%,45%)" fontSize={11} />
                      <YAxis dataKey="name" type="category" stroke="hsl(0,0%,45%)" fontSize={10} width={100} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} formatter={(v: number) => [`${v}%`, "Share"]} />
                      <Bar dataKey="value" fill="hsl(0,0%,21%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inquiries" className="mt-3">
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base">Inquiries & Conversions</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={inquiryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,87%)" />
                      <XAxis dataKey="name" stroke="hsl(0,0%,45%)" fontSize={11} />
                      <YAxis stroke="hsl(0,0%,45%)" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,12%,87%)", borderRadius: "8px" }} />
                      <Legend />
                      <Line type="monotone" dataKey="inquiries" stroke="hsl(352,85%,62%)" strokeWidth={2} dot={false} name="Inquiries" />
                      <Line type="monotone" dataKey="conversions" stroke="hsl(220,70%,55%)" strokeWidth={2} dot={false} name="Conversions" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="mt-3">
            <Card className="rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Top Performing Products</CardTitle>
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
                    onClick={() => navigate("/advertisements")}
                  >
                    Promote Product
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={section}>
          <Card className="rounded-xl border-accent/20 bg-gradient-to-br from-accent/5 via-card to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ratings Snapshot</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">4.2 / 5</p>
                  <p className="mt-1 text-sm text-muted-foreground">24 reviews • 312 helpful votes</p>
                </div>
                <div className="rounded-lg bg-accent/10 p-2">
                  <Star className="h-5 w-5 fill-accent text-accent" />
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Top rated listing", value: "Premium Cotton Blend" },
                  { label: "Response rate", value: "93%" },
                  { label: "Review trend", value: "+8% this month" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="mt-4 border-border" onClick={() => navigate("/reviews") }>
                View Reviews
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Analytics;
