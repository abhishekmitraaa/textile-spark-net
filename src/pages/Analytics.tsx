import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Target,
  Users,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Sample data for charts
const viewsData = [
  { name: "Jan", views: 1200, inquiries: 45, conversions: 12 },
  { name: "Feb", views: 1900, inquiries: 68, conversions: 18 },
  { name: "Mar", views: 2400, inquiries: 89, conversions: 24 },
  { name: "Apr", views: 1800, inquiries: 72, conversions: 20 },
  { name: "May", views: 2800, inquiries: 95, conversions: 28 },
  { name: "Jun", views: 3200, inquiries: 112, conversions: 35 },
  { name: "Jul", views: 3800, inquiries: 134, conversions: 42 },
];

const weeklyData = [
  { name: "Mon", views: 420, inquiries: 15 },
  { name: "Tue", views: 380, inquiries: 12 },
  { name: "Wed", views: 520, inquiries: 22 },
  { name: "Thu", views: 480, inquiries: 18 },
  { name: "Fri", views: 590, inquiries: 28 },
  { name: "Sat", views: 340, inquiries: 14 },
  { name: "Sun", views: 280, inquiries: 8 },
];

const categoryData = [
  { name: "Cotton Fabrics", value: 35, color: "hsl(38, 80%, 55%)" },
  { name: "Silk", value: 25, color: "hsl(220, 20%, 12%)" },
  { name: "Linen", value: 20, color: "hsl(40, 70%, 70%)" },
  { name: "Wool", value: 12, color: "hsl(220, 15%, 25%)" },
  { name: "Synthetic", value: 8, color: "hsl(40, 10%, 60%)" },
];

const topProducts = [
  { name: "Premium Cotton Blend", views: 1245, inquiries: 48, conversion: "3.8%" },
  { name: "Italian Silk Collection", views: 987, inquiries: 42, conversion: "4.2%" },
  { name: "Sustainable Linen", views: 856, inquiries: 35, conversion: "4.1%" },
  { name: "Designer Wool Tweed", views: 654, inquiries: 28, conversion: "4.3%" },
  { name: "Organic Hemp Fabric", views: 543, inquiries: 21, conversion: "3.9%" },
];

const sourceData = [
  { name: "Direct Search", value: 40 },
  { name: "Browse Category", value: 30 },
  { name: "Recommendations", value: 20 },
  { name: "External Links", value: 10 },
];

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative";
  icon: React.ElementType;
  delay?: number;
}

const StatCard = ({ title, value, change, changeType, icon: Icon, delay = 0 }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
  >
    <Card className="border-border/50">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>
            <p className="mt-1 font-display text-2xl font-bold text-card-foreground sm:text-3xl">
              {value}
            </p>
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium sm:text-sm ${
              changeType === "positive" ? "text-emerald-600" : "text-red-500"
            }`}>
              {changeType === "positive" ? (
                <ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4" />
              ) : (
                <ArrowDownRight className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              {change}
            </div>
          </div>
          <div className="rounded-xl bg-accent/10 p-2.5 sm:p-3">
            <Icon className="h-5 w-5 text-accent sm:h-6 sm:w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const Analytics = () => {
  const [timeRange, setTimeRange] = useState("7d");

  return (
    <DashboardLayout>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mb-8"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your product performance and customer engagement
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-8 lg:grid-cols-4 lg:gap-6">
        <StatCard
          title="Total Views"
          value="12.4K"
          change="+18.2% vs last period"
          changeType="positive"
          icon={Eye}
          delay={0}
        />
        <StatCard
          title="Inquiries"
          value="156"
          change="+24.5% vs last period"
          changeType="positive"
          icon={MessageSquare}
          delay={0.1}
        />
        <StatCard
          title="Conversion Rate"
          value="3.2%"
          change="+0.4% vs last period"
          changeType="positive"
          icon={Target}
          delay={0.2}
        />
        <StatCard
          title="Active Products"
          value="48"
          change="-2 inactive"
          changeType="negative"
          icon={Package}
          delay={0.3}
        />
      </div>

      {/* Main Charts */}
      <Tabs defaultValue="overview" className="mb-6 lg:mb-8">
        <TabsList className="mb-4 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="views" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Views
          </TabsTrigger>
          <TabsTrigger value="inquiries" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Inquiries
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <PieChartIcon className="h-4 w-4" />
            Products
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
            {/* Trend Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2"
            >
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold sm:text-lg">
                      Performance Trends
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      +18%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={viewsData}>
                        <defs>
                          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(38, 80%, 55%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(38, 80%, 55%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorInquiries" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(220, 20%, 12%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(220, 20%, 12%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 15%, 88%)" />
                        <XAxis 
                          dataKey="name" 
                          stroke="hsl(220, 10%, 45%)"
                          fontSize={12}
                          tickLine={false}
                        />
                        <YAxis 
                          stroke="hsl(220, 10%, 45%)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(0, 0%, 100%)",
                            border: "1px solid hsl(40, 15%, 88%)",
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                          }}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="views"
                          stroke="hsl(38, 80%, 55%)"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorViews)"
                          name="Views"
                        />
                        <Area
                          type="monotone"
                          dataKey="inquiries"
                          stroke="hsl(220, 20%, 12%)"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorInquiries)"
                          name="Inquiries"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Category Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border-border/50 h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold sm:text-lg">
                    Views by Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(0, 0%, 100%)",
                            border: "1px solid hsl(40, 15%, 88%)",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => [`${value}%`, "Share"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-2">
                    {categoryData.slice(0, 4).map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-muted-foreground">{item.name}</span>
                        </div>
                        <span className="font-medium">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>

        <TabsContent value="views">
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold sm:text-lg">
                    Weekly Views
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 15%, 88%)" />
                        <XAxis 
                          dataKey="name" 
                          stroke="hsl(220, 10%, 45%)"
                          fontSize={12}
                        />
                        <YAxis 
                          stroke="hsl(220, 10%, 45%)"
                          fontSize={12}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(0, 0%, 100%)",
                            border: "1px solid hsl(40, 15%, 88%)",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar 
                          dataKey="views" 
                          fill="hsl(38, 80%, 55%)" 
                          radius={[4, 4, 0, 0]}
                          name="Views"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold sm:text-lg">
                    Traffic Sources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sourceData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 15%, 88%)" />
                        <XAxis type="number" stroke="hsl(220, 10%, 45%)" fontSize={12} />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          stroke="hsl(220, 10%, 45%)"
                          fontSize={11}
                          width={100}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(0, 0%, 100%)",
                            border: "1px solid hsl(40, 15%, 88%)",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => [`${value}%`, "Share"]}
                        />
                        <Bar 
                          dataKey="value" 
                          fill="hsl(220, 20%, 12%)" 
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>

        <TabsContent value="inquiries">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold sm:text-lg">
                  Inquiries & Conversions Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={viewsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 15%, 88%)" />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(220, 10%, 45%)"
                        fontSize={12}
                      />
                      <YAxis 
                        stroke="hsl(220, 10%, 45%)"
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(0, 0%, 100%)",
                          border: "1px solid hsl(40, 15%, 88%)",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="inquiries"
                        stroke="hsl(38, 80%, 55%)"
                        strokeWidth={3}
                        dot={{ fill: "hsl(38, 80%, 55%)", strokeWidth: 2 }}
                        name="Inquiries"
                      />
                      <Line
                        type="monotone"
                        dataKey="conversions"
                        stroke="hsl(142, 76%, 36%)"
                        strokeWidth={3}
                        dot={{ fill: "hsl(142, 76%, 36%)", strokeWidth: 2 }}
                        name="Conversions"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="products">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold sm:text-lg">
                    Top Performing Products
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground sm:text-sm">
                        <th className="pb-3 pr-4">Product</th>
                        <th className="pb-3 pr-4 text-right">Views</th>
                        <th className="pb-3 pr-4 text-right">Inquiries</th>
                        <th className="pb-3 text-right">Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product, index) => (
                        <motion.tr
                          key={product.name}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-xs font-bold text-accent sm:h-10 sm:w-10">
                                {index + 1}
                              </div>
                              <span className="text-sm font-medium text-foreground sm:text-base">
                                {product.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                              <Eye className="h-3 w-3" />
                              {product.views.toLocaleString()}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                              <MessageSquare className="h-3 w-3" />
                              {product.inquiries}
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <Badge 
                              variant="outline" 
                              className="border-accent/50 text-accent"
                            >
                              {product.conversion}
                            </Badge>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Quick Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="border-border/50 bg-gradient-to-br from-accent/5 to-accent/10">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-accent/20 p-2.5">
                  <TrendingUp className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground sm:text-lg">
                    Performance Insight
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your <span className="font-medium text-accent">Italian Silk Collection</span> has 
                    the highest conversion rate at 4.2%. Consider running ads to boost its visibility.
                  </p>
                </div>
              </div>
              <Button variant="gold" size="sm" className="shrink-0 gap-2">
                <ArrowUpRight className="h-4 w-4" />
                Promote Product
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
};

export default Analytics;
