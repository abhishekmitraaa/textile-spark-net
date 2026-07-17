import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Check, X, Crown, Package, Users, Download, ChevronDown, ChevronUp, Sparkles,
  Shield, Star, MessageSquare, Clock, Percent, ArrowRight, Loader2, Lock, FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useSubscriptionPlans, useVendorPlan, useVendorInvoices, purchaseSubscription } from "@/lib/queries/subscriptions";
import {
  formatINR, tierStyle, isUnlimited, usagePct, yearlySavingsPct, yearlySavingsAmount,
  type Plan, type PlanId, type PlanDisplay,
} from "@/lib/plan";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { show: { transition: { staggerChildren: 0.055 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

// Comparison-table rows are modelled from the plan's `display` jsonb (one entry
// per spec row) so the whole table is data-driven — no hardcoded matrix.
const FEATURE_ROWS: { key: keyof PlanDisplay; label: string }[] = [
  { key: "leads", label: "Leads / month (est.)" },
  { key: "products", label: "Products listed" },
  { key: "international", label: "International buyer access" },
  { key: "ad", label: "Ad location" },
  { key: "trust", label: "Verified / Cosora trust seal" },
  { key: "search", label: "Search result position" },
  { key: "account_manager", label: "Dedicated account manager" },
  { key: "lead_channel", label: "Lead access channel" },
  { key: "alerts", label: "Real-time lead alerts" },
  { key: "crm", label: "CRM & lead management" },
  { key: "catalog", label: "Automatic catalog upload" },
];

const FAQS = [
  { q: "Can I upgrade or downgrade my plan anytime?", a: "Yes. Upgrading takes effect immediately for the period you pay for. There's no autopay — each period (monthly or yearly) is a one-time payment you make explicitly, so you're always in control." },
  { q: "How does billing work — is there autopay?", a: "No auto-debit. Every billing period is a discrete payment. When your period nears its end you'll get a renew reminder; if you don't renew, your account falls back to the Free plan." },
  { q: "What payment methods do you accept?", a: "All major cards, UPI, and net banking via Razorpay. Yearly billing gives you two months free versus paying monthly." },
  { q: "What happens when I reach my lead or product limit?", a: "You'll be prompted to upgrade at the point of action (quoting a lead or publishing a product). Existing listings and quotes are never removed." },
  { q: "How is GST handled?", a: "Plan prices are exclusive of GST; 18% GST is added at checkout. Add your GSTIN below and it's recorded on every invoice for your input tax credit." },
];

function isNegative(v: string): boolean {
  return v === "No" || v === "None" || v === "—" || v === "";
}

function renderCell(v: string, highlight: boolean) {
  if (isNegative(v)) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
        <X className="h-4 w-4 text-muted-foreground/50" />
      </div>
    );
  }
  return <span className={`text-xs font-semibold ${highlight ? "text-accent" : "text-foreground"}`}>{v}</span>;
}

export default function Subscription() {
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const { data: plans = [], isLoading: plansLoading } = useSubscriptionPlans();
  const { data: vplan } = useVendorPlan(user?.id);
  const { data: invoices = [] } = useVendorInvoices(user?.id);

  const [isYearly, setIsYearly] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);

  // Tax details — persisted to vendor_profiles (and sent with each checkout, so
  // they land on the invoice for input credit). Loaded once on mount.
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  useEffect(() => {
    if (!user) return;
    supabase.from("vendor_profiles").select("gstin, pan").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) { setGstin(data.gstin ?? ""); setPan(data.pan ?? ""); } });
  }, [user]);

  const saveTax = async (patch: { gstin?: string; pan?: string }) => {
    if (!user) return;
    const { error } = await supabase.from("vendor_profiles").update(patch).eq("id", user.id);
    if (error) toast.error("Couldn't save tax details", { description: error.message });
  };

  const currentPlanId = vplan?.effective_plan_id ?? "free";
  const currentPlan = vplan?.plan;
  const billingCycle: "monthly" | "yearly" = isYearly ? "yearly" : "monthly";

  const daysRemaining = vplan?.subscription_end
    ? Math.max(0, Math.ceil((new Date(vplan.subscription_end).getTime() - Date.now()) / 86_400_000))
    : null;

  const buy = async (plan: Plan) => {
    if (!user) { toast.error("Sign in as a vendor to subscribe"); return; }
    if (plan.id === "free") { toast.info("Free is the default plan — no purchase needed."); return; }
    if (plan.is_invite_only) {
      toast("Cosora VIP is invite-only", { description: "Our team hand-picks VIP vendors. Ask your account manager to request access." });
      return;
    }
    setBusyPlan(plan.id);
    try {
      const res = await purchaseSubscription({
        planId: plan.id, billingCycle, gstNumber: gstin || undefined, planName: plan.name,
        prefill: { name: profile?.full_name ?? undefined, email: profile?.email ?? undefined },
      });
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["vendor_plan"] });
        qc.invalidateQueries({ queryKey: ["subscription_invoices"] });
        toast.success(res.demo ? `${plan.name} activated (demo mode)` : `You're now on ${plan.name}!`, {
          description: res.demo ? "Simulated checkout — add Razorpay keys for live payments." : "Your new plan is active.",
        });
      } else if (res.error === "invite_only") {
        toast("Cosora VIP is invite-only");
      } else {
        toast.error("Couldn't complete purchase", { description: res.error });
      }
    } catch (e) {
      if (e instanceof Error && e.message === "dismissed") toast.info("Checkout cancelled");
      else toast.error("Checkout failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyPlan(null);
    }
  };

  const savingsPct = currentPlan ? yearlySavingsPct(2299, 22990) : 17; // Gold reference (~17%)

  // Usage bars (live from get_vendor_plan). Featured-ad quota isn't part of the
  // plan model, so the third tile shows renewal timing instead.
  const usage = vplan?.usage;
  const limits = vplan?.limits;

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-8 lg:space-y-10">
        {/* Header + billing toggle */}
        <motion.div variants={section} className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 border-accent/30 bg-accent/10 text-accent">
              <Sparkles className="mr-1 h-3 w-3" /> Upgrade &amp; Save
            </Badge>
            <h1 className="font-display text-3xl font-bold text-foreground lg:text-4xl">Choose Your Growth Plan</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Unlock premium features and accelerate your business growth. Yearly billing = 2 months free.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <span className={`text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <span className={`text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>Yearly</span>
            {isYearly && (
              <Badge className="ml-1 bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <Percent className="mr-1 h-3 w-3" /> Save ~{savingsPct}%
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Current plan + live usage */}
        <motion.div variants={section}>
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
                      <CardTitle className="text-2xl">{currentPlan?.name ?? "Free"} Plan</CardTitle>
                      <Badge className={tierStyle(currentPlanId).chip}>
                        {currentPlanId === "free" ? "Default" : "Active"}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      {daysRemaining != null ? `${daysRemaining} days until renewal` : "No renewal — free forever"}
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Current billing</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatINR(vplan ? (vplan.billing_cycle === "yearly" ? currentPlan?.yearly_price ?? 0 : currentPlan?.monthly_price ?? 0) : 0)}
                    <span className="text-sm font-normal text-muted-foreground">/{vplan?.billing_cycle === "yearly" ? "year" : "month"}</span>
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Products */}
                <UsageTile
                  icon={Package} label="Products"
                  used={usage?.products_used ?? 0} cap={limits?.product_cap ?? -1}
                />
                {/* Leads */}
                <UsageTile
                  icon={Users} label="Monthly Leads"
                  used={usage?.leads_used ?? 0} cap={limits?.leads_per_month ?? -1}
                />
                {/* Renewal / status */}
                <div className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" /> Plan status
                  </div>
                  <p className="mt-3 text-lg font-bold text-foreground capitalize">{vplan?.status ?? "free"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {daysRemaining != null ? `Renews in ${daysRemaining} days` : "Upgrade for more leads & products"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Plan cards — all five tiers, live */}
        {plansLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : (
          <motion.div variants={listContainer} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {plans.map((plan) => {
              const price = isYearly ? plan.yearly_price : plan.monthly_price;
              const isCurrent = plan.id === currentPlanId;
              const style = tierStyle(plan.id);
              const popular = plan.id === "gold";
              const busy = busyPlan === plan.id;
              return (
                <motion.div key={plan.id} variants={listItem} className="relative">
                  {popular && (
                    <div className="absolute -top-3 left-0 right-0 z-10 flex justify-center">
                      <Badge className="bg-accent px-4 py-1 text-accent-foreground shadow-gold">
                        <Star className="mr-1 h-3 w-3 fill-current" /> Most Popular
                      </Badge>
                    </div>
                  )}
                  <Card className={`relative flex h-full flex-col overflow-hidden transition-all duration-300 hover:shadow-lg ${popular ? "border-2 border-accent shadow-gold" : `border-2 ${style.ring}`} ${isCurrent ? "ring-2 ring-accent/20" : ""}`}>
                    <CardHeader className="relative pb-3 pt-7 text-center">
                      <div className="mx-auto mb-2">
                        <Badge className={style.chip}>{plan.name}</Badge>
                      </div>
                      {plan.is_invite_only && (
                        <div className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
                          <Lock className="h-3 w-3" /> Invite-only
                        </div>
                      )}
                      <div className="mt-1">
                        <span className="text-3xl font-bold text-foreground">{formatINR(price)}</span>
                        <span className="text-sm text-muted-foreground">/{isYearly ? "yr" : "mo"}</span>
                      </div>
                      {isYearly && plan.monthly_price > 0 && (
                        <p className="mt-1 text-xs text-green-600">Save {formatINR(yearlySavingsAmount(plan.monthly_price, plan.yearly_price))}/yr</p>
                      )}
                      {!isYearly && plan.monthly_price > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">+ 18% GST</p>
                      )}
                    </CardHeader>
                    <CardContent className="relative flex flex-1 flex-col gap-4">
                      <ul className="space-y-2 text-left">
                        {[
                          `${plan.display.leads} leads / month`,
                          `${plan.display.products} products`,
                          plan.display.ad === "None" ? "No ad targeting" : `Ads: ${plan.display.ad}`,
                          plan.display.trust === "None" ? null : plan.display.trust,
                          plan.display.search,
                        ].filter(Boolean).map((line, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                            <span className="text-foreground">{line}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto pt-2">
                        <Button
                          variant={popular ? "gold" : "outline"}
                          className="w-full"
                          disabled={isCurrent || busy || plan.id === "free"}
                          onClick={() => buy(plan)}
                        >
                          {busy ? (
                            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing…</>
                          ) : isCurrent ? "Current Plan"
                            : plan.id === "free" ? "Default"
                            : plan.is_invite_only ? (<><Lock className="mr-1 h-3.5 w-3.5" /> Request access</>)
                            : (<>Choose {plan.name}<ArrowRight className="ml-1 h-4 w-4" /></>)}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Feature comparison — data-driven from each plan's `display` */}
        {!plansLoading && plans.length > 0 && (
          <motion.div variants={section}>
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border bg-gradient-to-r from-secondary/50 to-transparent">
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-accent" /> Detailed Feature Comparison</CardTitle>
                <CardDescription>Every plan feature, side by side</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className="grid border-b border-border bg-muted/30" style={{ gridTemplateColumns: `1.4fr repeat(${plans.length}, 1fr)` }}>
                      <div className="p-4 text-sm font-semibold text-muted-foreground">FEATURES</div>
                      {plans.map((p) => (
                        <div key={p.id} className={`p-4 text-center ${p.id === currentPlanId ? "bg-accent/10" : ""}`}>
                          <p className={`text-sm font-bold ${p.id === "gold" ? "text-accent" : "text-foreground"}`}>{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{formatINR(p.monthly_price)}/mo</p>
                        </div>
                      ))}
                    </div>
                    <AnimatePresence initial={false}>
                      {(showAllFeatures ? FEATURE_ROWS : FEATURE_ROWS.slice(0, 6)).map((row, index) => (
                        <motion.div
                          key={row.key}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className={`grid border-b border-border ${index % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                          style={{ gridTemplateColumns: `1.4fr repeat(${plans.length}, 1fr)` }}
                        >
                          <div className="flex items-center p-4 text-sm text-foreground">{row.label}</div>
                          {plans.map((p) => (
                            <div key={p.id} className={`flex items-center justify-center p-4 text-center ${p.id === currentPlanId ? "bg-accent/5" : ""}`}>
                              {renderCell(p.display[row.key] ?? "", p.id === "gold" || p.id === "vip")}
                            </div>
                          ))}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div className="flex justify-center border-b border-border p-3">
                      <Button variant="ghost" onClick={() => setShowAllFeatures(!showAllFeatures)} className="text-muted-foreground hover:text-foreground">
                        {showAllFeatures ? (<>Show Less <ChevronUp className="ml-1 h-4 w-4" /></>) : (<>View all {FEATURE_ROWS.length} features <ChevronDown className="ml-1 h-4 w-4" /></>)}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Tax details — persisted to the vendor profile + every invoice */}
        <motion.div variants={section}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-accent" /> Tax details</CardTitle>
              <CardDescription>Saved to your profile and printed on every invoice for input tax credit.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input id="gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    onBlur={() => saveTax({ gstin: gstin || null } as { gstin: string })} placeholder="22AAAAA0000A1Z5" maxLength={15} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pan">PAN (for TDS)</Label>
                  <Input id="pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())}
                    onBlur={() => saveTax({ pan: pan || null } as { pan: string })} placeholder="AAAAA0000A" maxLength={10} />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Plan prices are exclusive of GST; 18% GST is added at checkout.</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* FAQ */}
        <motion.div variants={section}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-accent" /><CardTitle>Frequently Asked Questions</CardTitle></div>
              <CardDescription>Everything you need to know about our plans</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((faq, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="text-left text-foreground hover:text-accent">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        {/* Billing history — live invoices */}
        <motion.div variants={section}>
          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>Your past subscription invoices</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet. Your first invoice appears here after you subscribe.</p>
              ) : (
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
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="group transition-colors hover:bg-muted/30">
                          <td className="py-4 text-sm text-foreground">
                            {new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-4 text-sm font-medium text-muted-foreground">{inv.invoiceNumber ?? `#${inv.id.slice(0, 8)}`}</td>
                          <td className="py-4 text-sm font-semibold text-foreground">
                            {formatINR(inv.amount + (inv.gstAmount ?? 0))}
                          </td>
                          <td className="py-4">
                            <Badge className={inv.status === "paid" ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" : "bg-amber-500/10 text-amber-600"}>
                              {inv.status === "paid" && <Check className="mr-1 h-3 w-3" />}{inv.status}
                            </Badge>
                          </td>
                          <td className="py-4 text-right">
                            <Link to={`/subscription/invoice/${inv.id}`}>
                              <Button variant="ghost" size="sm">
                                <Download className="mr-1 h-4 w-4" /> Invoice
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}

// Live usage tile with a progress bar (unlimited caps show no bar).
function UsageTile({ icon: Icon, label, used, cap }: { icon: typeof Package; label: string; used: number; cap: number }) {
  const unlimited = isUnlimited(cap);
  const pct = usagePct(used, cap);
  const color = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-accent";
  return (
    <div className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
        <span className={`text-sm font-semibold ${pct >= 90 ? "text-destructive" : pct >= 70 ? "text-amber-600" : "text-foreground"}`}>
          {used}/{unlimited ? "∞" : cap}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div initial={{ width: 0 }} animate={{ width: unlimited ? "8%" : `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className={`h-full rounded-full ${unlimited ? "bg-accent/40" : color}`} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{unlimited ? "Unlimited" : `${pct}% used`}</p>
    </div>
  );
}
