import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  Crown,
  Zap,
  Star,
  TrendingUp,
  Phone,
  Eye,
  Megaphone,
  Package,
  Users,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for small manufacturers getting started",
    price: 0,
    period: "forever",
    features: [
      { text: "Up to 10 product listings", included: true },
      { text: "Basic lead management", included: true },
      { text: "Email notifications", included: true },
      { text: "Standard search visibility", included: true },
      { text: "Priority support", included: false },
      { text: "Featured listings", included: false },
      { text: "Analytics dashboard", included: false },
      { text: "Bulk product upload", included: false },
    ],
    limits: { products: 10, leads: 20, ads: 0 },
    popular: false,
  },
  {
    id: "professional",
    name: "Professional",
    description: "Ideal for growing manufacturing businesses",
    price: 2999,
    period: "month",
    features: [
      { text: "Up to 100 product listings", included: true },
      { text: "Advanced lead management", included: true },
      { text: "Email & SMS notifications", included: true },
      { text: "Boosted search visibility", included: true },
      { text: "Priority support", included: true },
      { text: "2 Featured listings/month", included: true },
      { text: "Analytics dashboard", included: true },
      { text: "Bulk product upload", included: false },
    ],
    limits: { products: 100, leads: 200, ads: 2 },
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For established manufacturers seeking maximum exposure",
    price: 7999,
    period: "month",
    features: [
      { text: "Unlimited product listings", included: true },
      { text: "Premium lead management", included: true },
      { text: "All notification channels", included: true },
      { text: "Top search visibility", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "10 Featured listings/month", included: true },
      { text: "Advanced analytics & reports", included: true },
      { text: "Bulk product upload", included: true },
    ],
    limits: { products: -1, leads: -1, ads: 10 },
    popular: false,
  },
];

// Mock current subscription data
const currentPlan = {
  id: "professional",
  name: "Professional",
  startDate: "2024-01-15",
  nextBilling: "2025-02-15",
  usage: {
    products: { used: 42, limit: 100 },
    leads: { used: 156, limit: 200 },
    featuredAds: { used: 1, limit: 2 },
  },
};

const billingHistory = [
  { id: 1, date: "2025-01-15", amount: 2999, status: "paid", invoice: "INV-2025-001" },
  { id: 2, date: "2024-12-15", amount: 2999, status: "paid", invoice: "INV-2024-012" },
  { id: 3, date: "2024-11-15", amount: 2999, status: "paid", invoice: "INV-2024-011" },
  { id: 4, date: "2024-10-15", amount: 2999, status: "paid", invoice: "INV-2024-010" },
];

export default function Subscription() {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan.id);

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

  return (
    <DashboardLayout>
      <div className="space-y-6 lg:space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            Subscription & Billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">
            Manage your plan, track usage, and view billing history
          </p>
        </div>

        {/* Current Plan Overview */}
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
                    Next billing: {new Date(currentPlan.nextBilling).toLocaleDateString("en-IN", { 
                      day: "numeric", 
                      month: "long", 
                      year: "numeric" 
                    })}
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" className="shrink-0">
                Manage Subscription
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Products Usage */}
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

              {/* Leads Usage */}
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

              {/* Featured Ads */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Megaphone className="h-4 w-4" />
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

        {/* Plans Comparison */}
        <div>
          <h2 className="mb-4 font-display text-xl font-semibold text-foreground">
            Available Plans
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={`relative h-full transition-all duration-200 hover:shadow-lg ${
                    plan.popular ? "border-accent shadow-gold" : ""
                  } ${selectedPlan === plan.id ? "ring-2 ring-accent" : ""}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-accent text-accent-foreground shadow-gold">
                        <Sparkles className="mr-1 h-3 w-3" />
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-center gap-2">
                      {plan.id === "starter" && <Zap className="h-5 w-5 text-muted-foreground" />}
                      {plan.id === "professional" && <Star className="h-5 w-5 text-accent" />}
                      {plan.id === "enterprise" && <Crown className="h-5 w-5 text-accent" />}
                      <CardTitle>{plan.name}</CardTitle>
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-4">
                      <span className="font-display text-3xl font-bold text-foreground">
                        {plan.price === 0 ? "Free" : formatPrice(plan.price)}
                      </span>
                      {plan.price > 0 && (
                        <span className="text-muted-foreground">/{plan.period}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                            feature.included
                              ? "bg-accent/20 text-accent"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span
                          className={`text-sm ${
                            feature.included ? "text-foreground" : "text-muted-foreground line-through"
                          }`}
                        >
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter className="pt-4">
                    <Button
                      className="w-full"
                      variant={currentPlan.id === plan.id ? "outline" : plan.popular ? "gold" : "default"}
                      disabled={currentPlan.id === plan.id}
                    >
                      {currentPlan.id === plan.id ? (
                        "Current Plan"
                      ) : (
                        <>
                          {plan.price === 0 ? "Downgrade" : "Upgrade"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Plan Benefits Highlights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-accent" />
              Why Upgrade?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                  <Eye className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">3x More Views</p>
                  <p className="text-sm text-muted-foreground">Premium listings get boosted visibility</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                  <Phone className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">More Leads</p>
                  <p className="text-sm text-muted-foreground">Higher limits on monthly inquiries</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                  <Megaphone className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Featured Ads</p>
                  <p className="text-sm text-muted-foreground">Promote products to top of search</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Priority Support</p>
                  <p className="text-sm text-muted-foreground">Get help when you need it most</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Billing History */}
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
      </div>
    </DashboardLayout>
  );
}
