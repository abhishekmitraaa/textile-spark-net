import { errorMessage } from "@/lib/errorMessage";
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
import { FaqSection } from "@/components/FaqSection";
import {
  Check, X, Crown, Package, Download, ChevronDown, ChevronUp, Sparkles,
  Shield, Star, Clock, Percent, ArrowRight, Loader2, Lock, FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  useSubscriptionPlans, useVendorPlan, useVendorInvoices, purchaseSubscription, isCheckoutRefusal,
  useAutopay, startAutopay, cancelAutopay,
  type ChangeKind, type CheckoutRefusal,
} from "@/lib/queries/subscriptions";
import { AutopayCard } from "@/components/vendor/AutopayCard";
import { RefundGuaranteeCard } from "@/components/vendor/RefundGuaranteeCard";
import { discountRefusal } from "@/lib/queries/discounts";
import { fetchMyVendorPrivate, writeOwnVendorRow } from "@/lib/queries/vendorStore";
import { useFeatureFlag } from "@/lib/queries/featureFlags";
import { isValidGstin, isValidPan, normaliseTaxId } from "@/lib/taxIds";
import { PlanCheckoutDialog } from "@/components/vendor/PlanCheckoutDialog";
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

// What a vendor reads when the checkout gate refuses them (subscriptions P0).
const CHECKOUT_REFUSAL_TEXT: Record<CheckoutRefusal, { title: string; description: string }> = {
  payments_not_open: { title: "Plan purchases open soon", description: "Buying, renewing and changing plans isn't open yet. Your current plan stays as it is." },
  not_vendor: { title: "Finish your seller registration first", description: "Plans are for registered sellers. Complete onboarding, then choose a plan." },
  suspended: { title: "Your account is suspended", description: "You can't buy or change a plan while it's suspended. Contact Cosora Support." },
  deleted: { title: "This account can't buy a plan", description: "It has been deleted." },
  unavailable: { title: "Couldn't start the checkout", description: "Nothing was charged. Please try again in a minute." },
};

// What a vendor reads when autopay can't go ahead (subscriptions P3). Nothing was charged for any of them.
const AUTOPAY_REFUSAL_TEXT: Record<string, { title: string; description: string }> = {
  autopay_active: { title: "Autopay is on", description: "Keep \"Renew automatically\" ticked to change plans, or turn autopay off first." },
  too_close_to_renewal: { title: "Too close to your renewal", description: "Your plan ends within the hour, so autopay can't start now. Renew once, then turn autopay on." },
  no_paid_plan: { title: "Choose a plan first", description: "Autopay renews a paid plan. Pick one below to set it up." },
  subscription_failed: { title: "Couldn't set up autopay", description: "Nothing was charged. Please try again in a minute." },
  plan_failed: { title: "Couldn't set up autopay", description: "Nothing was charged. Please try again in a minute." },
  mandate_failed: { title: "Couldn't set up autopay", description: "Nothing was charged. Please try again in a minute." },
};

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
  // The plan in the checkout dialog (price, discount code, GST, total), if open.
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);

  // Tax details — persisted to vendor_profiles (and sent with each checkout, so
  // they land on the invoice for input credit). Loaded once on mount.
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  // What was last loaded or saved, so leaving a field unchanged saves nothing.
  const [savedTax, setSavedTax] = useState<{ gstin: string; pan: string }>({ gstin: "", pan: "" });
  const [taxError, setTaxError] = useState<{ gstin?: string; pan?: string }>({});
  useEffect(() => {
    if (!user) return;
    // GSTIN is a public column; PAN is private (admin completion Phase 4) and
    // comes from my_vendor_private(), the vendor's own row only.
    supabase.from("vendor_profiles").select("gstin").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setGstin(data.gstin ?? ""); setSavedTax((s) => ({ ...s, gstin: data.gstin ?? "" })); }
      });
    fetchMyVendorPrivate(user.id)
      .then((priv) => { if (priv) { setPan(priv.pan ?? ""); setSavedTax((s) => ({ ...s, pan: priv.pan ?? "" })); } })
      .catch(() => { /* the field stays empty; saving still works */ });
  }, [user]);

  // A GSTIN or PAN is printed on every invoice, so a malformed one is refused here
  // (subscriptions P0, S-6). Saved through writeOwnVendorRow(), as every vendor_profiles
  // write must be, and only when the value changed.
  const saveTax = async (field: "gstin" | "pan") => {
    if (!user) return;
    const value = normaliseTaxId(field === "gstin" ? gstin : pan);
    if (field === "gstin") setGstin(value); else setPan(value);
    if (value === savedTax[field]) { setTaxError((e) => ({ ...e, [field]: undefined })); return; }
    if (value && field === "gstin" && !isValidGstin(value)) {
      setTaxError((e) => ({ ...e, gstin: "Enter a valid 15-character GSTIN, for example 27AAPFU0939F1ZV." }));
      return;
    }
    if (value && field === "pan" && !isValidPan(value)) {
      setTaxError((e) => ({ ...e, pan: "Enter a valid 10-character PAN, for example AAPFU0939F." }));
      return;
    }
    setTaxError((e) => ({ ...e, [field]: undefined }));
    try {
      await writeOwnVendorRow(field === "gstin" ? { id: user.id, gstin: value || null } : { id: user.id, pan: value || null });
      setSavedTax((s) => ({ ...s, [field]: value }));
      toast.success("Tax details saved");
    } catch (e) {
      toast.error("Couldn't save tax details", { description: errorMessage(e) });
    }
  };

  // Plan checkouts can be closed while payments are tested (the subscription_checkout
  // switch). The payment functions refuse anyway; this only says so up front.
  const checkoutOpen = useFeatureFlag("subscription_checkout");
  const checkoutClosed = checkoutOpen === false;

  const currentPlanId = vplan?.effective_plan_id ?? "free";
  const currentPlan = vplan?.plan;
  const billingCycle: "monthly" | "yearly" = isYearly ? "yearly" : "monthly";

  const daysRemaining = vplan?.subscription_end
    ? Math.max(0, Math.ceil((new Date(vplan.subscription_end).getTime() - Date.now()) / 86_400_000))
    : null;

  // The plan's last days (subscriptions P4). In the grace days the period is over and the
  // plan still in force; before them, a plan without autopay is about to end. With the
  // subscription_lifecycle switch off there are no grace days and no listings are paused.
  const lifecycleOn = useFeatureFlag("subscription_lifecycle") === true;
  const inGrace = vplan?.status === "grace";
  const day = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  const endsOn = day(vplan?.subscription_end);
  const graceUntil = day(vplan?.grace_until);
  const graceDays = vplan?.grace_days ?? 0;
  const endingSoon = !inGrace && currentPlanId !== "free" && vplan?.status === "active" && !vplan.auto_renew
    && !vplan.scheduled_plan_id && daysRemaining != null && daysRemaining <= 7;

  // "Choose <plan>": the checks that need no server, then the checkout dialog.
  const buy = (plan: Plan) => {
    if (!user) { toast.error("Sign in as a vendor to subscribe"); return; }
    if (plan.id === "free") { toast.info("Free is the default plan — no purchase needed."); return; }
    if (checkoutClosed) { toast(CHECKOUT_REFUSAL_TEXT.payments_not_open.title, { description: CHECKOUT_REFUSAL_TEXT.payments_not_open.description }); return; }
    if (plan.is_invite_only) {
      toast("This plan is by invitation", { description: "Contact Cosora to ask about it." });
      return;
    }
    setCheckoutPlan(plan);
  };

  // "Renew" on the ending and grace notices: the plan and cycle the vendor has now.
  const renewNow = () => {
    const plan = plans.find((p) => p.id === currentPlanId);
    if (!plan) return;
    setIsYearly(vplan?.billing_cycle === "yearly");
    buy(plan);
  };

  // The dialog's Pay. Resolves to why a discount code was refused (the dialog
  // shows it and drops the code), or null. `kind` is what the database said this
  // purchase is (new, renewal, upgrade, downgrade), so the toast says what happened.
  const completePurchase = async (plan: Plan, discountCode?: string, kind?: ChangeKind, withAutopay?: boolean): Promise<string | null> => {
    setBusyPlan(plan.id);
    try {
      const res = await purchaseSubscription({
        planId: plan.id, billingCycle, gstNumber: gstin || undefined, planName: plan.name, discountCode, autopay: withAutopay,
        prefill: { name: profile?.full_name ?? undefined, email: profile?.email ?? undefined },
        // Razorpay's window can't be clicked while the dialog is open.
        onGatewayOpen: () => setCheckoutPlan(null),
      });
      if (res.discountReason) return discountRefusal(res.discountReason);
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["vendor_plan"] });
        qc.invalidateQueries({ queryKey: ["subscription_invoices"] });
        qc.invalidateQueries({ queryKey: ["plan_change_preview"] });
        qc.invalidateQueries({ queryKey: ["refund_guarantee"] });
        qc.invalidateQueries({ queryKey: ["autopay"] });
        setCheckoutPlan(null);
        if (res.autopay) toast.success("Autopay is on", { description: "Your plan will renew automatically. You can turn it off any time." });
        const demoNote = "Simulated checkout — add Razorpay keys for live payments.";
        if (kind === "downgrade") {
          toast.success(res.demo ? `${plan.name} is paid for (demo mode)` : `${plan.name} is paid for`, {
            description: res.demo ? demoNote : "It starts when your current plan ends.",
          });
        } else if (kind === "renewal") {
          toast.success(res.demo ? `${plan.name} renewed (demo mode)` : `${plan.name} renewed`, {
            description: res.demo ? demoNote : "Your plan now runs for another period.",
          });
        } else {
          toast.success(res.demo ? `${plan.name} activated (demo mode)` : `You're now on ${plan.name}!`, {
            description: res.demo ? demoNote : "Your new plan is active.",
          });
        }
      } else if (res.error === "already_scheduled") {
        toast("You've already paid for your next plan period", {
          description: "You can change plans again once it starts.",
        });
      } else if (res.error === "invite_only") {
        toast("This plan is by invitation");
      } else if (res.error && res.error in AUTOPAY_REFUSAL_TEXT) {
        toast(AUTOPAY_REFUSAL_TEXT[res.error].title, { description: AUTOPAY_REFUSAL_TEXT[res.error].description });
      } else if (isCheckoutRefusal(res.error)) {
        setCheckoutPlan(null);
        toast(CHECKOUT_REFUSAL_TEXT[res.error].title, { description: CHECKOUT_REFUSAL_TEXT[res.error].description });
      } else if (res.paid) {
        // Razorpay has the money; the webhook or the reconciler finishes the order (P1).
        qc.invalidateQueries({ queryKey: ["vendor_plan"] });
        qc.invalidateQueries({ queryKey: ["subscription_invoices"] });
        if (res.error === "activation_failed") {
          toast.warning("Payment received, but your plan didn't switch", {
            description: "Our billing team has been alerted and will sort it out. You won't be charged again.",
            duration: 15000,
          });
        } else {
          toast("Payment received. Your plan will update shortly", {
            description: "If it hasn't changed in a few minutes, contact Cosora Support. You won't be charged again.",
            duration: 15000,
          });
        }
      } else if (res.demo && res.error === "activation_failed") {
        toast.error("Couldn't complete purchase", { description: "Nothing was charged. Please try again in a minute." });
      } else {
        toast.error("Couldn't complete purchase", { description: res.error });
      }
    } catch (e) {
      if (e instanceof Error && e.message === "dismissed") toast.info("Checkout cancelled");
      else toast.error("Checkout failed", { description: errorMessage(e) });
    } finally {
      setBusyPlan(null);
    }
    return null;
  };

  // Autopay (subscriptions P3): on for the plan already paid for (also how the payment
  // method is changed), and off.
  const { data: autopay } = useAutopay(user?.id);
  const [autopayBusy, setAutopayBusy] = useState(false);
  const hasPaidPlan = currentPlanId !== "free" && (vplan?.status === "active" || inGrace);
  const turnOnAutopay = async () => {
    setAutopayBusy(true);
    try {
      const res = await startAutopay({
        existing: true, planName: currentPlan?.name,
        prefill: { name: profile?.full_name ?? undefined, email: profile?.email ?? undefined },
      });
      if (res.ok) {
        toast.success("Autopay is on", { description: "Your plan will renew automatically when this period ends." });
      } else if (res.error && res.error in AUTOPAY_REFUSAL_TEXT) {
        toast(AUTOPAY_REFUSAL_TEXT[res.error].title, { description: AUTOPAY_REFUSAL_TEXT[res.error].description });
      } else if (isCheckoutRefusal(res.error)) {
        toast(CHECKOUT_REFUSAL_TEXT[res.error].title, { description: CHECKOUT_REFUSAL_TEXT[res.error].description });
      } else if (res.paid) {
        toast("Autopay is being set up", { description: "It will show here in a few minutes. If it doesn't, contact Cosora Support." });
      } else {
        toast.error("Couldn't turn autopay on", { description: "Nothing was charged. Please try again in a minute." });
      }
    } catch (e) {
      if (e instanceof Error && e.message === "dismissed") toast.info("Autopay wasn't set up");
      else toast.error("Couldn't turn autopay on", { description: errorMessage(e) });
    } finally {
      setAutopayBusy(false);
      qc.invalidateQueries({ queryKey: ["autopay"] });
    }
  };
  const turnOffAutopay = async () => {
    setAutopayBusy(true);
    try {
      const res = await cancelAutopay();
      if (res.ok) toast.success("Autopay is off", { description: "Your plan runs to the end of the period you've paid for." });
      else toast.error("Couldn't turn autopay off", { description: "Please try again in a minute, or contact Cosora Support." });
    } catch (e) {
      toast.error("Couldn't turn autopay off", { description: errorMessage(e) });
    } finally {
      setAutopayBusy(false);
      qc.invalidateQueries({ queryKey: ["autopay"] });
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
            <h1 className="text-3xl font-bold text-foreground lg:text-4xl">Choose Your Growth Plan</h1>
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
          {/* `relative` keeps the decorative gradient inside this card. Without it the layer
              was positioned against the page once the entrance animation ended, and sat over
              whatever followed (it swallowed the Autopay card's clicks). */}
          <Card className="relative overflow-hidden border-accent/20">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10" />
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
                        {currentPlanId === "free" ? "Default" : inGrace ? "Ended" : "Active"}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      {inGrace
                        ? `Ended on ${endsOn}. Renew by ${graceUntil} to keep it.`
                        : daysRemaining == null ? "No renewal — free forever"
                        : vplan?.auto_renew ? `${daysRemaining} days until renewal`
                        : daysRemaining === 0 ? "Ends today" : `Ends in ${daysRemaining} days`}
                    </CardDescription>
                    {/* A paid downgrade waiting for this period to end (Subscription
                        FAQ: "Downgrades will take effect from your next billing cycle"). */}
                    {vplan?.scheduled_plan_id && vplan.scheduled_from && (
                      <p className="mt-1 text-xs font-medium text-foreground">
                        {`Switching to ${vplan.scheduled_plan_name ?? vplan.scheduled_plan_id} on ${new Date(vplan.scheduled_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. It's paid for.`}
                      </p>
                    )}
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
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Products */}
                <UsageTile
                  icon={Package} label="Products"
                  used={usage?.products_used ?? 0} cap={limits?.product_cap ?? -1}
                />
                {/* Renewal / status */}
                <div className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" /> Plan status
                  </div>
                  <p className="mt-3 text-lg font-bold text-foreground capitalize" data-testid="plan-status">{inGrace ? "Grace period" : vplan?.status ?? "free"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {inGrace ? `Renew by ${graceUntil}`
                      : daysRemaining == null ? "Upgrade for more products"
                      : vplan?.auto_renew ? `Renews in ${daysRemaining} days`
                      : daysRemaining === 0 ? "Ends today" : `Ends in ${daysRemaining} days`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* The plan's last days: about to end without autopay, or ended and in its grace days. */}
        {(inGrace || endingSoon) && (
          <motion.div variants={section} role="status" data-testid="plan-ending" data-state={inGrace ? "grace" : "ending"}
            className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {inGrace
                    ? `Your ${currentPlan?.name ?? ""} plan ended on ${endsOn}`
                    : daysRemaining === 0 ? `Your ${currentPlan?.name ?? ""} plan ends today`
                    : daysRemaining === 1 ? `Your ${currentPlan?.name ?? ""} plan ends tomorrow`
                    : `Your ${currentPlan?.name ?? ""} plan ends in ${daysRemaining} days`}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {inGrace
                    ? `Nothing has changed yet. Renew by ${graceUntil} to keep your listings, seal and place in search. After that your account moves to the Free plan and listings over its limit are paused.`
                    : graceDays > 0
                      ? `Renew by ${endsOn} to keep it. After that you have ${graceDays} more days before your account moves to the Free plan.`
                      : `Renew by ${endsOn} to keep it. After that your account moves to the Free plan.`}
                </p>
              </div>
            </div>
            <Button className="shrink-0" onClick={renewNow} disabled={checkoutClosed || busyPlan !== null}>
              {`Renew ${currentPlan?.name ?? ""}`}
            </Button>
          </motion.div>
        )}

        {/* Autopay: on, retrying, stopped or off (shows nothing where it isn't offered). */}
        <AutopayCard
          autopay={autopay}
          hasPaidPlan={hasPaidPlan}
          periodEnd={vplan?.subscription_end ?? null}
          busy={autopayBusy}
          onTurnOn={turnOnAutopay}
          onTurnOff={turnOffAutopay}
        />

        {/* The 7-day money-back guarantee, while it applies (shows nothing otherwise). */}
        <RefundGuaranteeCard vendorId={user?.id} />

        {/* Plan checkouts closed while payments are tested (subscription_checkout switch). */}
        {checkoutClosed && (
          <motion.div variants={section} role="status"
            className="flex items-start gap-3 rounded-xl border border-brand-vendor/30 bg-brand-vendor/5 p-4">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand-vendor" />
            <div>
              <p className="text-sm font-semibold text-foreground">{CHECKOUT_REFUSAL_TEXT.payments_not_open.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{CHECKOUT_REFUSAL_TEXT.payments_not_open.description}</p>
            </div>
          </motion.div>
        )}

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
              // What choosing this card does, in the database's terms (plan changes,
              // 2026-10-02): the current plan renews; a higher one is an upgrade
              // that starts now; a lower one starts when this period ends.
              const paidActive = currentPlanId !== "free";
              const sameCycle = (vplan?.billing_cycle ?? "monthly") === billingCycle;
              const nextPaid = Boolean(vplan?.scheduled_plan_id);
              const renewBlocked = isCurrent && sameCycle && nextPaid;
              const action = !paidActive || plan.is_invite_only
                ? `Choose ${plan.name}`
                : isCurrent
                  ? (sameCycle ? `Renew ${plan.name}` : billingCycle === "yearly" ? "Switch to yearly" : "Switch to monthly")
                  : plan.sort_order > (currentPlan?.sort_order ?? 0)
                    ? `Upgrade to ${plan.name}`
                    : `Switch to ${plan.name}`;
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
                          <Lock className="h-3 w-3" /> By invitation
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
                          disabled={busy || plan.id === "free" || renewBlocked || (isCurrent && plan.is_invite_only) || checkoutClosed}
                          onClick={() => buy(plan)}
                        >
                          {busy ? (
                            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing…</>
                          ) : plan.id === "free" ? (isCurrent ? "Current Plan" : "Default")
                            : renewBlocked || (isCurrent && plan.is_invite_only) ? "Current Plan"
                            : plan.is_invite_only ? (<><Lock className="mr-1 h-3.5 w-3.5" /> By invitation</>)
                            : (<>{action}<ArrowRight className="ml-1 h-4 w-4" /></>)}
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
                    onBlur={() => saveTax("gstin")} placeholder="22AAAAA0000A1Z5" maxLength={15}
                    aria-invalid={Boolean(taxError.gstin)} aria-describedby={taxError.gstin ? "gstin-error" : undefined} />
                  {taxError.gstin && <p id="gstin-error" className="text-xs text-destructive">{taxError.gstin}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pan">PAN</Label>
                  <Input id="pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())}
                    onBlur={() => saveTax("pan")} placeholder="AAAAA0000A" maxLength={10}
                    aria-invalid={Boolean(taxError.pan)} aria-describedby={taxError.pan ? "pan-error" : undefined} />
                  {taxError.pan && <p id="pan-error" className="text-xs text-destructive">{taxError.pan}</p>}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Plan prices are exclusive of GST; 18% GST is added at checkout.</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* FAQ: admin-editable (surface "subscription"), 2026-09-23.
            "Contact us" writes to hello@cosora.in (Mitra, 2026-09-25, Phase 24). It
            used to open /help, as Andy's FAQ content asked, but that is the buyer Help
            page, whose chat gives canned replies: vendors have no support page
            (myprofileflags.md, MPF-15). */}
        <motion.div variants={section}>
          <FaqSection
            surface="subscription"
            description="Everything you need to know about our plans"
            contact={{
              label: "Contact us",
              href: "mailto:hello@cosora.in?subject=Subscription%20question",
              hint: "Still have a question about plans or billing?",
            }}
          />
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

      <PlanCheckoutDialog
        plan={checkoutPlan}
        billingCycle={billingCycle}
        onClose={() => setCheckoutPlan(null)}
        onConfirm={completePurchase}
        autopay={autopay ? { available: autopay.available, on: autopay.on } : undefined}
        listingsUsed={lifecycleOn ? usage?.products_used ?? 0 : undefined}
      />
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
