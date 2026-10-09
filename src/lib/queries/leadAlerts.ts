import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Lead alerts (subscriptions P6): being told when a buyer's requirement suits the vendor.
//
// The database matches each new requirement to vendors and tells them by the channels
// their plan includes (admin.lead_alert_fanout). This is the vendor's side of it: what
// their plan includes, their own choices, and what they have been told.
// ─────────────────────────────────────────────────────────────

/** app: the bell. email, whatsapp, sms: as it happens. digest: the daily email summary. */
export type LeadAlertChannel = "app" | "email" | "whatsapp" | "sms" | "digest";

export interface LeadAlertSettings {
  instant: boolean;
  digest: boolean;
  /** Only these categories; null means every category the vendor lists in. */
  categoryIds: string[] | null;
  /** "HH:MM" in IST, both or neither. Inside them only the bell rings. */
  quietStart: string | null;
  quietEnd: string | null;
}

export interface LeadAlertRow {
  id: string;
  rfqId: string;
  at: string;
  title: string;
  category: string | null;
  quantity: number | null;
  /** The requirement can still be quoted on. */
  open: boolean;
  /** How it went out as it happened; empty when it was held. */
  channels: LeadAlertChannel[];
  held: "off" | "digest_only" | "rate_limit" | "quiet_hours" | null;
  inDigest: boolean;
}

export interface LeadAlerts {
  available: boolean;
  planId: string;
  planName: string;
  /** What the plan includes. */
  channels: LeadAlertChannel[];
  /** What is actually being sent today (a channel can be waiting for an approval or a schedule). */
  liveChannels: LeadAlertChannel[];
  settings: LeadAlertSettings;
  whatsappConsent: boolean;
  categories: { id: string; name: string }[];
  alerts: LeadAlertRow[];
}

interface Raw {
  available?: boolean; plan_id?: string; plan_name?: string;
  channels?: LeadAlertChannel[]; live_channels?: LeadAlertChannel[];
  settings?: { instant?: boolean; digest?: boolean; category_ids?: string[] | null; quiet_start?: string | null; quiet_end?: string | null };
  whatsapp_consent?: boolean;
  categories?: { id: string; name: string }[];
  alerts?: {
    id: string; rfq_id: string; at: string; title: string; category: string | null; quantity: number | null; open: boolean;
    channels: LeadAlertChannel[]; held: LeadAlertRow["held"]; in_digest: boolean;
  }[];
}

async function fetchLeadAlerts(): Promise<LeadAlerts> {
  const { data, error } = await supabase.rpc("my_lead_alerts", { p_limit: 30 });
  if (error) throw error;
  const r = (data ?? {}) as unknown as Raw;
  return {
    available: Boolean(r.available), planId: r.plan_id ?? "free", planName: r.plan_name ?? "Free",
    channels: r.channels ?? [], liveChannels: r.live_channels ?? [],
    settings: {
      instant: r.settings?.instant ?? true, digest: r.settings?.digest ?? true,
      categoryIds: r.settings?.category_ids ?? null,
      quietStart: r.settings?.quiet_start ?? null, quietEnd: r.settings?.quiet_end ?? null,
    },
    whatsappConsent: Boolean(r.whatsapp_consent),
    categories: r.categories ?? [],
    alerts: (r.alerts ?? []).map((a) => ({
      id: a.id, rfqId: a.rfq_id, at: a.at, title: a.title, category: a.category, quantity: a.quantity, open: a.open,
      channels: a.channels ?? [], held: a.held ?? null, inDigest: Boolean(a.in_digest),
    })),
  };
}

export function useLeadAlerts(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["lead_alerts", vendorId],
    queryFn: fetchLeadAlerts,
    enabled: Boolean(vendorId),
    staleTime: 30 * 1000,
  });
}

export async function saveLeadAlertSettings(s: LeadAlertSettings): Promise<void> {
  const { error } = await supabase.rpc("set_lead_alert_settings", {
    p_instant: s.instant, p_digest: s.digest,
    p_category_ids: s.categoryIds && s.categoryIds.length ? s.categoryIds : null,
    p_quiet_start: s.quietStart, p_quiet_end: s.quietEnd,
  });
  if (error) throw error;
}
