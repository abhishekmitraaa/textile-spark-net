import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarClock, Mail, MessageCircle, Moon, Smartphone, ArrowRight, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLeadAlerts, saveLeadAlertSettings,
  type LeadAlertChannel, type LeadAlertRow, type LeadAlertSettings,
} from "@/lib/queries/leadAlerts";

// Lead alerts (subscriptions P6): how this vendor is told when a buyer posts a requirement
// that suits what they sell. The plan decides the channels; this page shows them, lets the
// vendor pace them (instant on or off, the daily summary, categories, quiet hours) and
// lists what they have been told. It never promises a channel that isn't being sent yet.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };

const CHANNEL: Record<LeadAlertChannel, { icon: typeof Bell; label: string; short: string }> = {
  app:      { icon: Bell,          label: "In the app, as it happens",  short: "Bell" },
  email:    { icon: Mail,          label: "By email, as it happens",    short: "Email" },
  whatsapp: { icon: MessageCircle, label: "On WhatsApp, as it happens", short: "WhatsApp" },
  sms:      { icon: Smartphone,    label: "By SMS, as it happens",      short: "SMS" },
  digest:   { icon: CalendarClock, label: "A daily email summary",      short: "Daily summary" },
};

const HELD: Record<NonNullable<LeadAlertRow["held"]>, string> = {
  off: "Instant alerts were off",
  digest_only: "For your daily summary",
  rate_limit: "Held: many alerts that hour",
  quiet_hours: "Held: your quiet hours",
};

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function LeadAlerts() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useLeadAlerts(user?.id);

  // The vendor's choices, edited here and saved as they change.
  const [settings, setSettings] = useState<LeadAlertSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setSettings(data.settings); }, [data]);

  const save = async (next: LeadAlertSettings) => {
    const before = settings;
    setSettings(next);
    setSaving(true);
    try {
      await saveLeadAlertSettings(next);
      qc.invalidateQueries({ queryKey: ["lead_alerts"] });
    } catch (e) {
      setSettings(before);
      toast.error("Couldn't save your choice", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const channels = data?.channels ?? [];
  const live = new Set(data?.liveChannels ?? []);
  const instantChannels = channels.filter((c) => c !== "digest");
  const chosen = settings?.categoryIds ?? null;

  const toggleCategory = (id: string) => {
    if (!settings || !data) return;
    // Nothing chosen means every category; choosing the last one back returns to that.
    const current = chosen ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    void save({ ...settings, categoryIds: next.length === 0 || next.length === data.categories.length ? null : next });
  };

  const setQuiet = (start: string | null, end: string | null) => {
    if (!settings) return;
    // Both or neither: a half-set pair is kept on the page until its other half is given.
    if ((start === null) !== (end === null)) { setSettings({ ...settings, quietStart: start, quietEnd: end }); return; }
    if (start !== null && start === end) { toast.error("Quiet hours need a different start and end"); return; }
    void save({ ...settings, quietStart: start, quietEnd: end });
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section}>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Lead alerts</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Be told when a buyer posts a requirement that suits what you sell. Every requirement is on your Leads page either way.
          </p>
        </motion.div>

        {isLoading || !data || !settings ? (
          <div className="flex justify-center py-16" role="status" aria-label="Loading">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* What the plan includes, and what is being sent today */}
            <motion.div variants={section}>
              <Card data-testid="lead-alert-channels">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">How you're told</CardTitle>
                  <CardDescription>{`Your ${data.planName} plan includes:`}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {channels.map((c) => {
                      const Icon = CHANNEL[c].icon;
                      return (
                        <li key={c} className="flex items-center gap-3 text-sm" data-testid={`lead-channel-${c}`} data-live={live.has(c)}>
                          <Icon className="h-4 w-4 shrink-0 text-brand-vendor" />
                          <span className="text-foreground">{CHANNEL[c].label}</span>
                          {!live.has(c) && <Badge variant="outline" className="text-muted-foreground">Starting soon</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                  {channels.includes("whatsapp") && live.has("whatsapp") && !data.whatsappConsent && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      WhatsApp alerts need your say-so. <Link to="/settings" className="font-medium text-brand-vendor hover:underline">Turn them on in Settings</Link>.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    <Link to="/subscription" className="font-medium text-brand-vendor hover:underline">See what other plans include</Link>
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* The vendor's own pacing */}
            <motion.div variants={section}>
              <Card data-testid="lead-alert-settings">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Your choices</CardTitle>
                  <CardDescription>Saved as you change them.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {instantChannels.length > 0 && (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Alerts as they happen</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Off, new requirements wait for your daily summary.</p>
                      </div>
                      <Switch checked={settings.instant} disabled={saving} aria-label="Alerts as they happen"
                        onCheckedChange={(v) => void save({ ...settings, instant: v })} />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Daily summary by email</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {channels.includes("digest")
                          ? "One email each morning with the requirements that matched since the last one."
                          : "One email each morning, only when alerts were held back the day before."}
                      </p>
                    </div>
                    <Switch checked={settings.digest} disabled={saving} aria-label="Daily summary by email"
                      onCheckedChange={(v) => void save({ ...settings, digest: v })} />
                  </div>

                  {data.categories.length > 1 && (
                    <div>
                      <p className="text-sm font-medium text-foreground">Categories</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {chosen === null ? "You're told about every category you list in. Choose some to narrow it." : "You're told only about the categories chosen."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {data.categories.map((c) => {
                          const on = chosen !== null && chosen.includes(c.id);
                          return (
                            <button key={c.id} type="button" onClick={() => toggleCategory(c.id)} disabled={saving} aria-pressed={on}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-brand-vendor bg-brand-vendor text-white" : "border-border bg-background text-foreground hover:bg-muted"}`}>
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {instantChannels.length > 0 && (
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground"><Moon className="h-4 w-4 text-muted-foreground" />Quiet hours</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Between these times only the bell rings. Emails and messages wait for your daily summary. Times are in IST.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor="quiet-start">Quiet hours start</label>
                        <input id="quiet-start" type="time" value={settings.quietStart ?? ""} disabled={saving}
                          onChange={(e) => setQuiet(e.target.value || null, settings.quietEnd)}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <label className="sr-only" htmlFor="quiet-end">Quiet hours end</label>
                        <input id="quiet-end" type="time" value={settings.quietEnd ?? ""} disabled={saving}
                          onChange={(e) => setQuiet(settings.quietStart, e.target.value || null)}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
                        {(settings.quietStart || settings.quietEnd) && (
                          <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save({ ...settings, quietStart: null, quietEnd: null })}>
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* What they have been told */}
            <motion.div variants={section}>
              <Card data-testid="lead-alert-history">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">What you've been told</CardTitle>
                      <CardDescription>The latest requirements matched to you.</CardDescription>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/leads">Open my leads<ArrowRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {data.alerts.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nothing yet. When a buyer posts a requirement that suits what you sell, it shows here.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {data.alerts.map((a) => (
                        <li key={a.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground" data-no-translate>{a.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              <span data-no-translate>{[a.category, a.quantity ? `Qty ${a.quantity}` : null, WHEN.format(new Date(a.at))].filter(Boolean).join(" · ")}</span>
                              {!a.open && <span className="ml-2">No longer open</span>}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {a.channels.map((c) => <Badge key={c} variant="secondary">{CHANNEL[c].short}</Badge>)}
                            {a.held && <Badge variant="outline" className="text-muted-foreground">{HELD[a.held]}</Badge>}
                            {a.inDigest && <Badge variant="outline" className="text-muted-foreground">In a daily summary</Badge>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
