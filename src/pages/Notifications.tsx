import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  FileText,
  ClipboardCheck,
  UserPlus,
  MessageCircle,
  Megaphone,
  Star,
  IndianRupee,
  ShieldCheck,
  CheckCheck,
  Check,
  X,
  ArrowRight,
  MapPin,
  Boxes,
  Wallet,
  Clock,
  Sparkles,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import {
  devOnlySampleNotifications,
  toVendorNotification,
  type VendorNotification,
  type NotifType,
  type NotifTone,
  type NotifGroup,
} from "@/lib/notificationsStore";
import {
  useNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/lib/queries/notifications";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

// Icon is chosen by type (what happened); colour by tone (how much it matters).
const TYPE_ICON: Record<NotifType, typeof Bell> = {
  requirement: FileText,
  quote: ClipboardCheck,
  lead: UserPlus,
  message: MessageCircle,
  ad: Megaphone,
  review: Star,
  payment: IndianRupee,
  system: ShieldCheck,
};

// Restrained, meaning-first palette. Brand blue leads; the rest fire only when
// they carry real state (money won, needs attention), so the eye lands right.
const TONE_STYLE: Record<NotifTone, { fg: string; bg: string }> = {
  brand: { fg: "text-[#256fef]", bg: "bg-[#256fef]/10" },
  positive: { fg: "text-emerald-600", bg: "bg-emerald-500/10" },
  warning: { fg: "text-amber-600", bg: "bg-amber-500/10" },
  neutral: { fg: "text-slate-500", bg: "bg-slate-500/10" },
};

type TabKey = "all" | NotifGroup;
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "requirements", label: "Requirements" },
  { key: "quotes", label: "Quotes & Leads" },
  { key: "payments", label: "Payments" },
  { key: "updates", label: "Updates" },
];

// Today / Earlier this week / Earlier buckets.
function bucketOf(iso: string): "Today" | "Earlier this week" | "Earlier" {
  const t = new Date(iso).getTime();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 6 * 24 * 60 * 60 * 1000) return "Earlier this week";
  return "Earlier";
}
const BUCKET_ORDER = ["Today", "Earlier this week", "Earlier"] as const;

function RequirementChips({ meta }: { meta: NonNullable<VendorNotification["requirement"]> }) {
  const chips = [
    { icon: Boxes, text: meta.category },
    { icon: MapPin, text: meta.location },
    { icon: Boxes, text: meta.quantity },
    { icon: Wallet, text: meta.budget },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-600 ring-1 ring-inset ring-gray-200/80"
        >
          <c.icon className="h-3 w-3 text-gray-400" strokeWidth={2} />
          {c.text}
        </span>
      ))}
      <span className="inline-flex items-center gap-1 rounded-full bg-[#256fef]/10 px-2.5 py-1 text-[11px] font-bold text-[#256fef]">
        <Clock className="h-3 w-3" strokeWidth={2} />
        {meta.deadline}
      </span>
    </div>
  );
}

function NotificationCard({
  n,
  onRead,
  onDismiss,
}: {
  n: VendorNotification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const Icon = TYPE_ICON[n.type];
  const tone = TONE_STYLE[n.tone];
  const primary = n.type === "requirement";

  const open = () => {
    if (!n.read) onRead(n.id);
    navigate(n.href);
  };

  return (
    <motion.div
      variants={reduced ? {} : listItem}
      className={cn(
        "group relative rounded-2xl border transition-all duration-200",
        "hover:border-gray-300 hover:shadow-[0_4px_16px_-6px_rgba(16,24,40,0.12)]",
        n.read ? "border-gray-200 bg-white" : "border-[#256fef]/25 bg-[#256fef]/[0.035]",
      )}
    >
      {/* Full-card click target (stretched-link pattern). */}
      <button
        onClick={open}
        aria-label={`Open notification: ${n.title}`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#256fef]/45 focus-visible:ring-offset-1"
      />

      {/* Hover controls (above the stretched target). */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 z-20 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {!n.read && (
          <button
            onClick={() => onRead(n.id)}
            aria-label="Mark as read"
            title="Mark as read"
            className="pointer-events-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#256fef]"
          >
            <Check className="h-4 w-4" strokeWidth={2.2} />
          </button>
        )}
        <button
          onClick={() => onDismiss(n.id)}
          aria-label="Dismiss notification"
          title="Dismiss"
          className="pointer-events-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>

      <div className="pointer-events-none relative z-10 flex gap-3.5 p-4">
        {/* Unread marker + icon tile */}
        <div className="relative shrink-0">
          {!n.read && (
            <span className="absolute -left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#256fef]" />
          )}
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone.bg)}>
            <Icon className={cn("h-[18px] w-[18px]", tone.fg)} strokeWidth={2} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={cn(
                "min-w-0 pr-10 text-sm leading-snug",
                n.read ? "font-semibold text-gray-800" : "font-bold text-gray-900",
              )}
            >
              {n.title}
            </h3>
            <time className="mt-0.5 shrink-0 text-xs font-medium text-gray-400">
              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
            </time>
          </div>

          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600">{n.body}</p>

          {n.requirement && <RequirementChips meta={n.requirement} />}

          <div className="mt-3.5">
            <motion.button
              whileTap={reduced ? undefined : TAP}
              transition={TAP_T}
              onClick={open}
              className={cn(
                "pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all active:translate-y-px",
                primary
                  ? "bg-[#256fef] text-white shadow-sm hover:bg-[#256fef]/90"
                  : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
              )}
            >
              {n.actionLabel}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const Notifications = () => {
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const { data: rows, isPending, error } = useNotifications();
  const [tab, setTab] = useState<TabKey>("all");

  // Real rows first, then the dev-only samples beneath them. In a production
  // build devOnlySampleNotifications() returns [] and is tree-shaken, so what
  // renders is exactly what the database holds — see notificationsStore.ts.
  const all = useMemo(
    () => [...(rows ?? []).map(toVendorNotification), ...devOnlySampleNotifications()],
    [rows],
  );
  const unread = useMemo(() => all.filter((n) => !n.read).length, [all]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["notifications"] });

  // Writes go to the database and the list re-reads. A sample row (dev only)
  // has no database row, so its write matches nothing and returns false — the
  // refresh is harmless and the card simply stays as it was.
  const onRead = (id: string) => void markNotificationRead(id).then(refresh);
  const onDismiss = (id: string) => void dismissNotification(id).then(refresh);
  const onReadAll = () => void markAllNotificationsRead().then(refresh);

  // Unread counts per tab (drive the little count pills).
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, requirements: 0, quotes: 0, payments: 0, updates: 0 };
    for (const n of all) {
      if (n.read) continue;
      c.all += 1;
      c[n.group] += 1;
    }
    return c;
  }, [all]);

  const filtered = useMemo(
    () =>
      (tab === "all" ? all : all.filter((n) => n.group === tab))
        .slice()
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [all, tab],
  );

  // Group the filtered list into Today / Earlier this week / Earlier.
  const grouped = useMemo(() => {
    const map = new Map<string, VendorNotification[]>();
    for (const n of filtered) {
      const b = bucketOf(n.createdAt);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(n);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [filtered]);

  return (
    <DashboardLayout>
      <motion.div
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-3xl pb-10"
      >
        {/* Header */}
        <motion.div variants={section} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-xl font-semibold text-foreground lg:text-2xl">
              Notifications
              {unread > 0 && (
                <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#256fef] px-1.5 text-xs font-bold text-white">
                  {unread}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              New buyer requirements in your domains, plus quote, lead, payment and account updates.
            </p>
          </div>
          <motion.button
            whileTap={reduced || unread === 0 ? undefined : TAP}
            transition={TAP_T}
            onClick={onReadAll}
            disabled={unread === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <CheckCheck className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">Mark all read</span>
            <span className="sm:hidden">Read all</span>
          </motion.button>
        </motion.div>

        {/* Requirements spotlight — the headline event, only when there are unread ones */}
        {counts.requirements > 0 && (
          <motion.button
            variants={section}
            onClick={() => setTab("requirements")}
            whileTap={reduced ? undefined : { scale: 0.995 }}
            className="group mt-4 flex w-full items-center gap-3.5 rounded-2xl border border-[#256fef]/25 bg-gradient-to-r from-[#256fef]/[0.08] to-[#256fef]/[0.02] p-4 text-left transition-colors hover:border-[#256fef]/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#256fef] text-white">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900">
                {counts.requirements} new {counts.requirements === 1 ? "requirement" : "requirements"} match your domains
              </p>
              <p className="mt-0.5 text-xs text-gray-500">Quote early to get ahead of other vendors.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#256fef]">
              Review
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
            </span>
          </motion.button>
        )}

        {/* Sticky filter tabs */}
        <motion.div
          variants={section}
          className="sticky top-14 z-20 -mx-4 mt-4 border-b border-gray-100 bg-background/90 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:top-16 lg:-mx-6 lg:px-6"
        >
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {TABS.map((t) => {
              const active = tab === t.key;
              const badge = counts[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-[#256fef] text-white"
                      : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  {t.label}
                  {badge > 0 && (
                    <span
                      className={cn(
                        "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        active ? "bg-white/25 text-white" : "bg-[#256fef]/10 text-[#256fef]",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* List. Loading, error and empty are three DISTINCT states: collapsing
            them is how a broken feed reads as an empty one, which is exactly the
            failure CLAUDE.md records for My Reviews. */}
        {isPending ? (
          <div className="mt-5 space-y-2.5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="text-sm font-bold text-amber-900">Notifications could not be loaded</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-amber-800">
              {(error as Error).message}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            variants={section}
            className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#256fef]/10">
              <Bell className="h-6 w-6 text-[#256fef]" strokeWidth={2} />
            </div>
            <p className="text-base font-bold text-gray-900">You're all caught up</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500">
              Nothing here right now. When buyers post requirements in your domains, they'll show up so you can quote
              first.
            </p>
          </motion.div>
        ) : (
          <div className="mt-5 space-y-6">
            {grouped.map(({ bucket, items }) => (
              <motion.div key={bucket} variants={section}>
                <p className="mb-2.5 px-1 text-xs font-semibold text-gray-400">{bucket}</p>
                <motion.div
                  variants={reduced ? {} : listContainer}
                  initial="hidden"
                  animate="show"
                  className="space-y-2.5"
                >
                  {items.map((n) => (
                    <NotificationCard key={n.id} n={n} onRead={onRead} onDismiss={onDismiss} />
                  ))}
                </motion.div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default Notifications;
