import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart2,
  Star,
  MapPin,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const fadeIn = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay, ease: "easeOut" as const },
});

const timeFilters = ["Last 7 days", "30 days", "90 days", "Last year"];

const competitors = [
  { name: "Surat Silk House", rating: 4.5, spend: "₹5,000/mo", category: "Silk, Georgette", pincodes: "395001, 395003", img: "/placeholder.svg" },
  { name: "Gujarat Fabrics", rating: 4.1, spend: "₹3,200/mo", category: "Cotton, Linen", pincodes: "395004, 395006", img: "/placeholder.svg" },
  { name: "Royal Textiles", rating: 3.8, spend: "₹4,800/mo", category: "Denim, Polyester", pincodes: "395002, 395005", img: "/placeholder.svg" },
  { name: "Patel Clothings", rating: 4.3, spend: "₹2,500/mo", category: "Cotton, Chiffon", pincodes: "395007, 395009", img: "/placeholder.svg" },
  { name: "Navneet Exports", rating: 4.0, spend: "₹6,100/mo", category: "Silk, Satin", pincodes: "395001, 395008", img: "/placeholder.svg" },
  { name: "Shree Fabrics", rating: 3.9, spend: "₹1,800/mo", category: "Knitted, Velvet", pincodes: "395003, 395010", img: "/placeholder.svg" },
];

const trendData = [
  { month: "Jan", searches: 420, projected: false },
  { month: "Feb", searches: 380, projected: false },
  { month: "Mar", searches: 510, projected: false },
  { month: "Apr", searches: 470, projected: false },
  { month: "May", searches: 560, projected: false },
  { month: "Jun", searches: 620, projected: false },
  { month: "Jul", searches: 700, projected: true },
];

const CompetitorAds = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("Last 7 days");

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-24 lg:pb-8">
        {/* Header */}
        <motion.div {...fadeIn(0)}>
          <h1 className="font-display text-2xl font-bold text-foreground">Competitor Advertisements</h1>
          <p className="text-sm text-muted-foreground">Monitor what your competitors are promoting</p>
        </motion.div>

        {/* Time Filter Pills */}
        <motion.div {...fadeIn(0.05)} className="flex gap-2 overflow-x-auto no-scrollbar">
          {timeFilters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${
                activeFilter === f
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </motion.div>

        {/* Stats Row */}
        <motion.div {...fadeIn(0.1)} className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total Competitor Ads</p>
            <p className="text-2xl font-bold text-foreground">12</p>
            <span className="text-[10px] bg-green-500/10 text-green-600 rounded-full px-2 py-0.5 inline-block mt-1">
              +3 this week
            </span>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Avg. Daily Budget</p>
            <p className="text-2xl font-bold text-foreground">Rs 67</p>
            <span className="flex items-center gap-0.5 text-[10px] text-green-600 mt-1">
              <TrendingUp className="w-3 h-3" /> +12%
            </span>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <button
              onClick={() => navigate("/analytics")}
              className="w-full rounded-xl bg-accent text-accent-foreground p-3 text-center hover:bg-accent/90 transition-colors"
            >
              <BarChart2 className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm font-medium">VIEW MY ANALYSIS</span>
            </button>
          </div>
        </motion.div>

        {/* Competitor Cards */}
        <motion.div {...fadeIn(0.15)}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-1">Your Competitors' Ads</h2>
          <p className="text-xs text-muted-foreground mb-3">Top 6 competitors in your category and area</p>

          <div className="grid grid-cols-2 gap-3">
            {competitors.map((c) => (
              <div key={c.name} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="aspect-video bg-muted">
                  <img src={c.img} alt={c.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <span className="flex items-center gap-0.5 text-xs text-accent shrink-0">
                      <Star className="w-3 h-3 fill-accent" /> {c.rating}
                    </span>
                  </div>
                  <span className="inline-block bg-accent/10 text-accent text-xs rounded-full px-2 py-0.5 mb-1">
                    {c.spend}
                  </span>
                  <p className="text-[10px] text-muted-foreground">{c.category}</p>
                  <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground mt-0.5">
                    <MapPin className="w-2.5 h-2.5" /> {c.pincodes}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Button
            className="w-full mt-3 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => navigate("/advertisements")}
          >
            Advertise Now
          </Button>
        </motion.div>

        {/* Competition Trend Panel */}
        <motion.div {...fadeIn(0.2)} className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold text-foreground mb-1">Monthly search trend for your categories</h3>
          <p className="text-xs text-muted-foreground mb-4">Based on buyer searches in your area</p>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="searches" radius={[4, 4, 0, 0]}>
                  {trendData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.projected ? "hsl(var(--accent) / 0.3)" : "hsl(var(--accent))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Button
            variant="outline"
            className="w-full mt-3 gap-2"
            onClick={() => navigate("/advertisements")}
          >
            Advertise Now <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>

        {/* Benchmarking Section */}
        <motion.div {...fadeIn(0.25)} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Reviews Benchmark */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-foreground text-sm mb-3">Reviews collected this month</h3>
            <div className="flex items-center justify-around mb-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-accent">3</p>
                <p className="text-xs text-muted-foreground">You</p>
              </div>
              <span className="text-muted-foreground text-sm">vs</span>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">12</p>
                <p className="text-xs text-muted-foreground">Competition avg</p>
              </div>
            </div>
            <div className="space-y-2 mb-3">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>You</span><span>3</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: "25%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Competition</span><span>12</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-foreground/30 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-accent text-accent-foreground text-xs rounded-full px-3 py-1 h-auto hover:bg-accent/90"
              onClick={() => navigate("/reviews")}
            >
              Ask More Reviews →
            </Button>
          </div>

          {/* Photos Benchmark */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-foreground text-sm mb-3">Product photos uploaded</h3>
            <div className="flex items-center justify-around mb-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-accent">8</p>
                <p className="text-xs text-muted-foreground">You</p>
              </div>
              <span className="text-muted-foreground text-sm">vs</span>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">24</p>
                <p className="text-xs text-muted-foreground">Competition avg</p>
              </div>
            </div>
            <div className="space-y-2 mb-3">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>You</span><span>8</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: "33%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Competition</span><span>24</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-foreground/30 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-accent text-accent-foreground text-xs rounded-full px-3 py-1 h-auto hover:bg-accent/90"
              onClick={() => navigate("/upload")}
            >
              Upload More Photos →
            </Button>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default CompetitorAds;
