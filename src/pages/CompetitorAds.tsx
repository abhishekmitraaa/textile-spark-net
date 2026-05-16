import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Eye, Megaphone, BarChart2, ArrowRight, MapPin, Star } from "lucide-react";

const chartData = [
  { day: "Mon", yours: 12, comp: 28 },
  { day: "Tue", yours: 19, comp: 32 },
  { day: "Wed", yours: 15, comp: 25 },
  { day: "Thu", yours: 22, comp: 30 },
  { day: "Fri", yours: 28, comp: 35 },
  { day: "Sat", yours: 18, comp: 20 },
  { day: "Sun", yours: 10, comp: 15 },
];

const competitors = [
  { name: "Surat Fab House", rating: 4.3, spend: 2100, categories: ["Knitwear", "Cotton"], pinCode: "395001" },
  { name: "Mumbai Textiles", rating: 4.1, spend: 3500, categories: ["Denim", "Polyester"], pinCode: "400001" },
  { name: "Tiruppur Mills", rating: 4.5, spend: 1800, categories: ["T-shirts", "Knitwear"], pinCode: "641601" },
  { name: "Delhi Garments", rating: 3.9, spend: 2800, categories: ["Formal", "Casual"], pinCode: "110001" },
];

const cn = (...classes: string[]) => classes.filter(Boolean).join(" ");

const CompetitorAds = () => {
  const [timePeriod, setTimePeriod] = useState("7days");

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">Competitor Advertisements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor what competitors are promoting in your category</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="flex gap-2 flex-wrap">
            {[
              ["7days", "Last 7 days"],
              ["30days", "30 days"],
              ["90days", "90 days"],
              ["1year", "Last year"],
            ].map(([val, label]) => (
              <button
                key={val}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm transition-all border",
                  timePeriod === val
                    ? "bg-accent/10 text-accent border-accent/30 font-medium"
                    : "bg-card text-muted-foreground border-border hover:border-accent/30",
                )}
                onClick={() => setTimePeriod(val)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-foreground">12</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Competitor Ads</p>
              <Badge className="bg-green-500/10 text-green-600 text-[10px] mt-1 rounded-full">+3 this week</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-foreground">₹67</p>
              <p className="text-xs text-muted-foreground mt-0.5">Avg. Daily Budget</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-[10px] text-muted-foreground">12% higher than you</span>
              </div>
            </CardContent>
          </Card>
          <Link to="/advertisements">
            <div className="rounded-xl bg-accent p-3 h-full flex flex-col justify-between min-h-[80px]">
              <BarChart2 className="h-5 w-5 text-accent-foreground" />
              <p className="text-sm font-semibold text-accent-foreground mt-auto">View My Analysis</p>
              <ArrowRight className="h-4 w-4 text-accent-foreground self-end" />
            </div>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <p className="text-base font-semibold font-display text-foreground">Your Competitors' Ads</p>
          <p className="text-xs text-muted-foreground mb-3">Top competitors in your category and area</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {competitors.map((comp) => (
              <Card key={comp.name} className="overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                  <Megaphone className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <CardContent className="p-3">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium text-foreground truncate flex-1 mr-1">{comp.name}</p>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs">{comp.rating}</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] mt-1.5">₹{comp.spend}/mo</Badge>
                  <p className="text-[10px] text-muted-foreground mt-1">{comp.categories.join(" · ")}</p>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <MapPin className="h-2.5 w-2.5 text-muted-foreground/60" />
                    <span className="text-[10px] text-muted-foreground">{comp.pinCode}</span>
                  </div>
                  <Link to="/advertisements">
                    <Button size="sm" className="w-full mt-2 h-7 text-xs bg-accent text-accent-foreground hover:bg-accent/90">
                      Advertise Now
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold font-display text-foreground">Monthly Competition vs Your Reach</p>
              <p className="text-xs text-muted-foreground mb-4">Ad impressions comparison by day</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={8} barGap={2}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} axisLine={false} tickLine={false} />
                  <YAxis hide={true} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(220 12% 87%)" }} />
                  <Bar dataKey="comp" name="Competition" fill="hsl(220 12% 87%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="yours" name="You" fill="hsl(352 85% 62%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-accent" />
                  <span className="text-xs text-muted-foreground">You</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-secondary" />
                  <span className="text-xs text-muted-foreground">Avg. Competitor</span>
                </div>
              </div>
              <Link to="/advertisements">
                <Button variant="outline" className="w-full mt-4 h-9 text-sm gap-2 hover:border-accent/50 hover:text-accent">
                  <Megaphone className="h-4 w-4" /> Create Your Ad Now
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold font-display text-foreground">Reviews Collected This Month</p>
              <div className="flex justify-around items-center my-4">
                <div className="text-center">
                  <span className="text-3xl font-bold text-accent">3</span>
                  <p className="text-xs text-muted-foreground mt-1">You</p>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <span className="text-3xl font-bold text-foreground">12</span>
                  <p className="text-xs text-muted-foreground mt-1">Competition avg.</p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground w-8">You</span>
                    <div className="flex-1 bg-muted h-2 rounded-full">
                      <div className="h-2 rounded-full transition-all bg-accent" style={{ width: "25%" }} />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground w-8">Avg.</span>
                    <div className="flex-1 bg-muted h-2 rounded-full">
                      <div className="h-2 rounded-full transition-all bg-muted-foreground/30" style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>
              </div>
              <Link to="/reviews">
                <Button className="w-full mt-3 h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90">Ask More Reviews →</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold font-display text-foreground">Product Photos Uploaded</p>
              <div className="flex justify-around items-center my-4">
                <div className="text-center">
                  <span className="text-3xl font-bold text-accent">8</span>
                  <p className="text-xs text-muted-foreground mt-1">You</p>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <span className="text-3xl font-bold text-foreground">24</span>
                  <p className="text-xs text-muted-foreground mt-1">Competition avg.</p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground w-8">You</span>
                    <div className="flex-1 bg-muted h-2 rounded-full">
                      <div className="h-2 rounded-full transition-all bg-accent" style={{ width: "33%" }} />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground w-8">Avg.</span>
                    <div className="flex-1 bg-muted h-2 rounded-full">
                      <div className="h-2 rounded-full transition-all bg-muted-foreground/30" style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>
              </div>
              <Link to="/upload">
                <Button className="w-full mt-3 h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90">Upload More Photos →</Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default CompetitorAds;