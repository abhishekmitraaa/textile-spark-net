import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  X,
  Crown,
  Package,
  Users,
  Download,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

type PlanId = "basic" | "silver" | "gold";

interface PlanData {
  id: PlanId;
  name: string;
  price: number;
  priceUnit: string;
  businessType: string;
  popular: boolean;
  color: string;
  bgColor: string;
}

const plans: PlanData[] = [
  {
    id: "basic",
    name: "Basic",
    price: 999,
    priceUnit: "/month",
    businessType: "Small Businesses",
    popular: false,
    color: "text-foreground",
    bgColor: "bg-secondary",
  },
  {
    id: "silver",
    name: "Silver",
    price: 2499,
    priceUnit: "/month",
    businessType: "Local Businesses",
    popular: false,
    color: "text-foreground",
    bgColor: "bg-secondary",
  },
  {
    id: "gold",
    name: "Gold",
    price: 4999,
    priceUnit: "/month",
    businessType: "Sales Focused",
    popular: true,
    color: "text-accent-foreground",
    bgColor: "bg-accent",
  },
];

interface FeatureRow {
  name: string;
  basic: string | boolean;
  silver: string | boolean;
  gold: string | boolean;
}

const features: FeatureRow[] = [
  { name: "No of Leads per Month", basic: "150+", silver: "450+", gold: "600+" },
  { name: "International Sales Access", basic: false, silver: false, gold: true },
  { name: "Products you can List", basic: "10", silver: "50", gold: "200" },
  { name: "Ad Location", basic: "1 State", silver: "4 States", gold: "Pan India" },
  { name: "Verified Seller Badge", basic: false, silver: false, gold: true },
  { name: "Search Result Position", basic: false, silver: "Top 10", gold: "Top 5" },
  { name: "Featured Listings", basic: "0", silver: "2/month", gold: "10/month" },
  { name: "Analytics Dashboard", basic: false, silver: true, gold: true },
  { name: "Priority Support", basic: false, silver: true, gold: true },
  { name: "Bulk Product Upload", basic: false, silver: false, gold: true },
  { name: "Dedicated Account Manager", basic: false, silver: false, gold: true },
];

const currentPlan = {
  id: "silver" as PlanId,
  name: "Silver",
  startDate: "2024-01-15",
  nextBilling: "2025-02-15",
  usage: {
    products: { used: 32, limit: 50 },
    leads: { used: 289, limit: 450 },
    featuredAds: { used: 1, limit: 2 },
  },
};

const billingHistory = [
  { id: 1, date: "2025-01-15", amount: 2499, status: "paid", invoice: "INV-2025-001" },
  { id: 2, date: "2024-12-15", amount: 2499, status: "paid", invoice: "INV-2024-012" },
  { id: 3, date: "2024-11-15", amount: 2499, status: "paid", invoice: "INV-2024-011" },
  { id: 4, date: "2024-10-15", amount: 2499, status: "paid", invoice: "INV-2024-010" },
];

export default function Subscription() {
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0;
    return Math.round((used / limit) * 100);
  };

  const renderFeatureValue = (value: string | boolean, planId: PlanId) => {
    if (typeof value === "boolean") {
      return value ? (
        <Check className="h-5 w-5 text-green-600" />
      ) : (
        <X className="h-5 w-5 text-muted-foreground/50" />
      );
    }
    return (
      <span className={`text-sm font-semibold ${planId === "gold" ? "text-accent" : "text-foreground"}`}>
        {value}
      </span>
    );
  };

  const displayedFeatures = showAllFeatures ? features : features.slice(0, 6);

  return (
    <DashboardLayout>
      <div className="space-y-6 lg:space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            Subscription Plans
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">
            Choose the perfect plan to grow your business
          </p>
        </div>

        {/* Current Plan Usage Card */}
        <Card className="border-accent/20 bg-gradient-to-br from-card to-accent/5">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent shadow-gold">
                  <Crown className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{currentPlan.name} Plan</CardTitle>
                    <Badge variant="secondary" className="bg-accent/20 text-accent">
                      Active
                    </Badge>
                  </div>
                  <CardDescription>
                    Next billing:{" "}
                    {new Date(currentPlan.nextBilling).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Products
                  </div>
                  <span className="text-sm font-medium">
                    {currentPlan.usage.products.used}/{currentPlan.usage.products.limit}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(currentPlan.usage.products.used, currentPlan.usage.products.limit)}
                  className="mt-2 h-2"
                />
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Monthly Leads
                  </div>
                  <span className="text-sm font-medium">
                    {currentPlan.usage.leads.used}/{currentPlan.usage.leads.limit}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(currentPlan.usage.leads.used, currentPlan.usage.leads.limit)}
                  className="mt-2 h-2"
                />
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4" />
                    Featured Ads
                  </div>
                  <span className="text-sm font-medium">
                    {currentPlan.usage.featuredAds.used}/{currentPlan.usage.featuredAds.limit}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(currentPlan.usage.featuredAds.used, currentPlan.usage.featuredAds.limit)}
                  className="mt-2 h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border bg-secondary/30">
              <CardTitle>Compare Plans</CardTitle>
              <CardDescription>See what's included in each plan</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Table Header */}
              <div className="grid grid-cols-4 border-b border-border">
                <div className="p-4 font-medium text-muted-foreground">FEATURES</div>
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`p-4 text-center ${plan.popular ? "bg-accent/10" : ""}`}
                  >
                    <div className="relative">
                      {plan.popular && (
                        <Badge className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-accent text-accent-foreground text-xs">
                          Popular
                        </Badge>
                      )}
                      <p className={`font-semibold ${plan.popular ? "text-accent" : "text-foreground"}`}>
                        {plan.name.toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price Row */}
              <div className="grid grid-cols-4 border-b border-border bg-secondary/20">
                <div className="flex items-center p-4 font-medium text-foreground">Price</div>
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`flex items-center justify-center p-4 ${plan.popular ? "bg-accent/10" : ""}`}
                  >
                    <span className={`text-sm font-bold ${plan.popular ? "text-accent" : "text-foreground"}`}>
                      {formatPrice(plan.price)}
                      <span className="text-xs font-normal text-muted-foreground">{plan.priceUnit}</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Feature Rows */}
              {displayedFeatures.map((feature, index) => (
                <div
                  key={feature.name}
                  className={`grid grid-cols-4 border-b border-border ${
                    index % 2 === 0 ? "bg-card" : "bg-secondary/10"
                  }`}
                >
                  <div className="flex items-center p-4 text-sm text-foreground">{feature.name}</div>
                  <div className={`flex items-center justify-center p-4`}>
                    {renderFeatureValue(feature.basic, "basic")}
                  </div>
                  <div className={`flex items-center justify-center p-4`}>
                    {renderFeatureValue(feature.silver, "silver")}
                  </div>
                  <div className={`flex items-center justify-center p-4 bg-accent/5`}>
                    {renderFeatureValue(feature.gold, "gold")}
                  </div>
                </div>
              ))}

              {/* Business Type Row */}
              <div className="grid grid-cols-4 border-b border-border bg-secondary/20">
                <div className="flex items-center p-4 font-medium text-foreground">Business Type</div>
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`flex items-center justify-center p-4 text-center ${plan.popular ? "bg-accent/10" : ""}`}
                  >
                    <span className={`text-sm font-semibold ${plan.popular ? "text-accent" : "text-muted-foreground"}`}>
                      {plan.businessType}
                    </span>
                  </div>
                ))}
              </div>

              {/* View More Button */}
              <div className="flex justify-center border-b border-border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllFeatures(!showAllFeatures)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showAllFeatures ? (
                    <>
                      View Less <ChevronUp className="ml-1 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      View More Features <ChevronDown className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

              {/* Buy Now Buttons */}
              <div className="grid grid-cols-4 bg-card">
                <div className="p-4" />
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`flex items-center justify-center p-4 ${plan.popular ? "bg-accent/10" : ""}`}
                  >
                    <Button
                      variant={plan.popular ? "gold" : "outline"}
                      className={`w-full max-w-[140px] ${
                        currentPlan.id === plan.id ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      disabled={currentPlan.id === plan.id}
                    >
                      {currentPlan.id === plan.id ? "Current" : "Buy Now"}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Selected Plan Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-accent bg-gradient-to-r from-accent/10 via-accent/5 to-transparent">
            <CardContent className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-accent px-3 py-1.5">
                  <span className="text-sm font-bold text-accent-foreground">GOLD PACK</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatPrice(4999)}
                    <span className="text-sm font-normal text-muted-foreground"> / month</span>
                  </p>
                  <p className="text-xs text-muted-foreground">+ GST as applicable</p>
                </div>
              </div>
              <Button variant="gold" size="lg" className="w-full sm:w-auto">
                <Sparkles className="mr-2 h-4 w-4" />
                Upgrade to Gold
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Billing History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>View and download your past invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                      <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Invoice</th>
                      <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Amount</th>
                      <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="pb-3 text-right text-sm font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {billingHistory.map((bill) => (
                      <tr key={bill.id}>
                        <td className="py-3 text-sm text-foreground">
                          {new Date(bill.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">{bill.invoice}</td>
                        <td className="py-3 text-sm font-medium text-foreground">
                          {formatPrice(bill.amount)}
                        </td>
                        <td className="py-3">
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                            {bill.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <Button variant="ghost" size="sm">
                            <Download className="mr-1 h-4 w-4" />
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
