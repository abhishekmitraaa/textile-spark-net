import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  Zap,
  Shield,
  TrendingUp,
  Star,
  MessageSquare,
  Clock,
  Gift,
  Percent,
  ArrowRight,
  Building2,
  Globe,
  Award,
} from "lucide-react";

type PlanId = "basic" | "silver" | "gold";

interface PlanData {
  id: PlanId;
  name: string;
  price: number;
  yearlyPrice: number;
  priceUnit: string;
  businessType: string;
  description: string;
  popular: boolean;
  icon: typeof Crown;
}

const plans: PlanData[] = [
  {
    id: "basic",
    name: "Basic",
    price: 999,
    yearlyPrice: 9999,
    priceUnit: "/month",
    businessType: "Small Businesses",
    description: "Perfect for startups and small manufacturers",
    popular: false,
    icon: Building2,
  },
  {
    id: "silver",
    name: "Silver",
    price: 2499,
    yearlyPrice: 24999,
    priceUnit: "/month",
    businessType: "Growing Businesses",
    description: "Ideal for established local businesses",
    popular: false,
    icon: Award,
  },
  {
    id: "gold",
    name: "Gold",
    price: 4999,
    yearlyPrice: 49999,
    priceUnit: "/month",
    businessType: "Enterprise Ready",
    description: "For businesses targeting national growth",
    popular: true,
    icon: Crown,
  },
];

interface FeatureRow {
  name: string;
  basic: string | boolean;
  silver: string | boolean;
  gold: string | boolean;
  tooltip?: string;
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
  daysRemaining: 28,
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

const testimonials = [
  {
    name: "Rajesh Kumar",
    company: "Kumar Industries",
    plan: "Gold",
    quote: "After upgrading to Gold, our leads increased by 300% in just 2 months. The dedicated account manager helped us optimize our listings perfectly.",
    avatar: "RK",
  },
  {
    name: "Priya Sharma",
    company: "Sharma Textiles",
    plan: "Silver",
    quote: "The analytics dashboard helped us understand our customers better. We've seen consistent growth month over month.",
    avatar: "PS",
  },
  {
    name: "Amit Patel",
    company: "Patel Manufacturing",
    plan: "Gold",
    quote: "Pan India reach was a game changer for our business. We're now shipping to 15 states!",
    avatar: "AP",
  },
];

const faqs = [
  {
    question: "Can I upgrade or downgrade my plan anytime?",
    answer: "Yes, you can upgrade your plan at any time and the difference will be prorated. Downgrades will take effect from your next billing cycle.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit/debit cards, UPI, net banking, and bank transfers for annual plans.",
  },
  {
    question: "Is there a refund policy?",
    answer: "We offer a 7-day money-back guarantee for first-time subscribers. If you're not satisfied, contact us for a full refund.",
  },
  {
    question: "What happens when I reach my lead limit?",
    answer: "You'll receive notifications as you approach your limit. You can always upgrade your plan to get more leads or wait for the next billing cycle.",
  },
  {
    question: "Do you offer discounts for annual billing?",
    answer: "Yes! You save up to 17% when you choose annual billing. That's effectively 2 months free!",
  },
];

const benefits = [
  { icon: TrendingUp, title: "3x More Leads", description: "Gold users receive 3x more buyer inquiries" },
  { icon: Globe, title: "Pan India Reach", description: "Expand beyond local markets nationwide" },
  { icon: Shield, title: "Verified Badge", description: "Build trust with verified seller status" },
  { icon: Zap, title: "Priority Listing", description: "Appear in top 5 search results" },
];

export default function Subscription() {
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [isYearly, setIsYearly] = useState(false);

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

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "bg-destructive";
    if (percentage >= 70) return "bg-amber-500";
    return "bg-accent";
  };

  const renderFeatureValue = (value: string | boolean, planId: PlanId) => {
    if (typeof value === "boolean") {
      return value ? (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10">
          <Check className="h-4 w-4 text-green-600" />
        </div>
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
          <X className="h-4 w-4 text-muted-foreground/50" />
        </div>
      );
    }
    return (
      <span className={`text-sm font-semibold ${planId === "gold" ? "text-accent" : "text-foreground"}`}>
        {value}
      </span>
    );
  };

  const displayedFeatures = showAllFeatures ? features : features.slice(0, 6);
  const savingsPercentage = 17;

  return (
    <DashboardLayout>
      <div className="space-y-8 lg:space-y-10">
        {/* Header with Toggle */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Badge variant="outline" className="mb-3 border-accent/30 bg-accent/10 text-accent">
              <Sparkles className="mr-1 h-3 w-3" />
              Upgrade & Save
            </Badge>
            <h1 className="font-display text-3xl font-bold text-foreground lg:text-4xl">
              Choose Your Growth Plan
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Unlock premium features and accelerate your business growth with our flexible subscription plans
            </p>
          </motion.div>

          {/* Billing Toggle */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <span className={`text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>
              Monthly
            </span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <span className={`text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>
              Yearly
            </span>
            {isYearly && (
              <Badge className="ml-1 bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <Percent className="mr-1 h-3 w-3" />
                Save {savingsPercentage}%
              </Badge>
            )}
          </motion.div>
        </div>

        {/* Current Plan Usage Card - Enhanced */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="overflow-hidden border-accent/20">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10" />
            <CardHeader className="relative pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/80 shadow-gold">
                    <Crown className="h-7 w-7 text-accent-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-2xl">{currentPlan.name} Plan</CardTitle>
                      <Badge className="bg-accent/20 text-accent">
                        Active
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      {currentPlan.daysRemaining} days until renewal
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Current billing</p>
                  <p className="text-2xl font-bold text-foreground">{formatPrice(2499)}<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: Package, label: "Products", ...currentPlan.usage.products },
                  { icon: Users, label: "Monthly Leads", ...currentPlan.usage.leads },
                  { icon: Sparkles, label: "Featured Ads", ...currentPlan.usage.featuredAds },
                ].map((item) => {
                  const percentage = getUsagePercentage(item.used, item.limit);
                  return (
                    <div key={item.label} className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </div>
                        <span className={`text-sm font-semibold ${percentage >= 90 ? "text-destructive" : percentage >= 70 ? "text-amber-600" : "text-foreground"}`}>
                          {item.used}/{item.limit}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={`h-full rounded-full ${getUsageColor(percentage)}`}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{percentage}% used</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Plan Cards - New Design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid gap-6 lg:grid-cols-3"
        >
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const price = isYearly ? plan.yearlyPrice : plan.price;
            const isCurrentPlan = currentPlan.id === plan.id;
            
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className="relative"
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <Badge className="bg-accent px-4 py-1 text-accent-foreground shadow-gold">
                      <Star className="mr-1 h-3 w-3 fill-current" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                <Card className={`relative h-full overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  plan.popular 
                    ? "border-2 border-accent shadow-gold" 
                    : "border-border hover:border-accent/30"
                } ${isCurrentPlan ? "ring-2 ring-accent/20" : ""}`}>
                  {plan.popular && (
                    <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent" />
                  )}
                  <CardHeader className="relative pb-4 pt-8 text-center">
                    <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${
                      plan.popular 
                        ? "bg-gradient-to-br from-accent to-accent/80 shadow-gold" 
                        : "bg-secondary"
                    }`}>
                      <Icon className={`h-8 w-8 ${plan.popular ? "text-accent-foreground" : "text-foreground"}`} />
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-foreground">{formatPrice(price)}</span>
                      <span className="text-muted-foreground">/{isYearly ? "year" : "month"}</span>
                    </div>
                    {isYearly && (
                      <p className="mt-1 text-sm text-green-600">
                        Save {formatPrice(plan.price * 12 - plan.yearlyPrice)} per year
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="relative space-y-4">
                    <div className="space-y-3">
                      {features.slice(0, 5).map((feature) => {
                        const value = feature[plan.id];
                        const hasFeature = typeof value === "boolean" ? value : true;
                        return (
                          <div key={feature.name} className="flex items-center gap-3">
                            {hasFeature ? (
                              <Check className="h-5 w-5 flex-shrink-0 text-green-600" />
                            ) : (
                              <X className="h-5 w-5 flex-shrink-0 text-muted-foreground/30" />
                            )}
                            <span className={`text-sm ${hasFeature ? "text-foreground" : "text-muted-foreground/50"}`}>
                              {typeof value === "string" ? `${feature.name}: ${value}` : feature.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      variant={plan.popular ? "gold" : "outline"}
                      className={`w-full ${isCurrentPlan ? "opacity-50" : ""}`}
                      disabled={isCurrentPlan}
                      size="lg"
                    >
                      {isCurrentPlan ? (
                        "Current Plan"
                      ) : (
                        <>
                          {plan.popular ? "Upgrade Now" : "Get Started"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Feature Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border bg-gradient-to-r from-secondary/50 to-transparent">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                Detailed Feature Comparison
              </CardTitle>
              <CardDescription>See exactly what's included in each plan</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Table Header */}
              <div className="grid grid-cols-4 border-b border-border bg-muted/30">
                <div className="p-4 text-sm font-semibold text-muted-foreground">FEATURES</div>
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`p-4 text-center ${plan.popular ? "bg-accent/10" : ""}`}
                  >
                    <p className={`font-bold ${plan.popular ? "text-accent" : "text-foreground"}`}>
                      {plan.name.toUpperCase()}
                    </p>
                  </div>
                ))}
              </div>

              {/* Feature Rows */}
              <AnimatePresence mode="wait">
                {displayedFeatures.map((feature, index) => (
                  <motion.div
                    key={feature.name}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className={`grid grid-cols-4 border-b border-border ${
                      index % 2 === 0 ? "bg-card" : "bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center p-4 text-sm text-foreground">{feature.name}</div>
                    <div className="flex items-center justify-center p-4">
                      {renderFeatureValue(feature.basic, "basic")}
                    </div>
                    <div className="flex items-center justify-center p-4">
                      {renderFeatureValue(feature.silver, "silver")}
                    </div>
                    <div className="flex items-center justify-center p-4 bg-accent/5">
                      {renderFeatureValue(feature.gold, "gold")}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* View More Button */}
              <div className="flex justify-center border-b border-border p-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowAllFeatures(!showAllFeatures)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showAllFeatures ? (
                    <>
                      Show Less <ChevronUp className="ml-1 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      View All {features.length} Features <ChevronDown className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Why Upgrade Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 via-card to-accent/10">
            <CardHeader className="text-center">
              <Badge variant="outline" className="mx-auto mb-2 w-fit border-accent/30 bg-accent/10 text-accent">
                <Gift className="mr-1 h-3 w-3" />
                Why Upgrade?
              </Badge>
              <CardTitle className="text-2xl">Unlock Your Business Potential</CardTitle>
              <CardDescription className="mx-auto max-w-2xl">
                Join thousands of successful manufacturers who've scaled their business with our premium plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={benefit.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + index * 0.1 }}
                    className="group rounded-xl border border-border bg-card p-5 text-center transition-all hover:border-accent/30 hover:shadow-md"
                  >
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                      <benefit.icon className="h-6 w-6" />
                    </div>
                    <h4 className="font-semibold text-foreground">{benefit.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{benefit.description}</p>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Upgrade CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="overflow-hidden border-accent">
            <div className="relative bg-gradient-to-r from-accent via-accent/90 to-accent/80 p-6 sm:p-8">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNiA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
              <div className="relative flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-4">
                  <div className="hidden rounded-xl bg-accent-foreground/10 p-3 sm:block">
                    <Crown className="h-8 w-8 text-accent-foreground" />
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-xl font-bold text-accent-foreground sm:text-2xl">
                      Upgrade to Gold Today
                    </h3>
                    <p className="text-accent-foreground/80">
                      Get 600+ leads/month, Pan India reach & dedicated support
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 sm:items-end">
                  <div className="text-center sm:text-right">
                    <p className="text-3xl font-bold text-accent-foreground">
                      {formatPrice(isYearly ? plans[2].yearlyPrice : plans[2].price)}
                      <span className="text-base font-normal">/{isYearly ? "year" : "month"}</span>
                    </p>
                    <p className="text-sm text-accent-foreground/70">+ GST as applicable</p>
                  </div>
                  <Button size="lg" className="bg-accent-foreground text-accent hover:bg-accent-foreground/90">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Testimonials */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <div className="mb-6 text-center">
            <h2 className="font-display text-2xl font-bold text-foreground">What Our Customers Say</h2>
            <p className="mt-1 text-muted-foreground">Join thousands of satisfied manufacturers</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                      ))}
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground italic">"{testimonial.quote}"</p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{testimonial.name}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.company} • {testimonial.plan} Plan</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-accent" />
                <CardTitle>Frequently Asked Questions</CardTitle>
              </div>
              <CardDescription>Everything you need to know about our plans</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left text-foreground hover:text-accent">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        {/* Billing History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Billing History</CardTitle>
                  <CardDescription>View and download your past invoices</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export All
                </Button>
              </div>
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
                      <tr key={bill.id} className="group transition-colors hover:bg-muted/30">
                        <td className="py-4 text-sm text-foreground">
                          {new Date(bill.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-4 text-sm font-medium text-muted-foreground">{bill.invoice}</td>
                        <td className="py-4 text-sm font-semibold text-foreground">
                          {formatPrice(bill.amount)}
                        </td>
                        <td className="py-4">
                          <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                            <Check className="mr-1 h-3 w-3" />
                            {bill.status}
                          </Badge>
                        </td>
                        <td className="py-4 text-right">
                          <Button variant="ghost" size="sm" className="opacity-0 transition-opacity group-hover:opacity-100">
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
