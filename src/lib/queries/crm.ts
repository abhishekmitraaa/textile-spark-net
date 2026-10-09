import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatInrCompact } from "@/lib/queries/vendorAnalytics";

// ─────────────────────────────────────────────────────────────
// The CRM (subscriptions P8, 2026-10-09): the leads a vendor is working on.
//
// Silver and above (crm_pipeline), Gold and VIP add analytics (crm_analytics), all where the
// `crm` switch lists the vendor. The vendor reads their own rows straight from the tables
// (RLS: their own only). Every change goes through a crm_* function, which checks the plan,
// the owner, the requirement and the limits, and records stage moves in the lead's history;
// a browser can't write the tables at all.
//
// The database also moves leads itself: a quote sent makes a lead "quoted" (tracking the
// requirement if it wasn't), the buyer's answer makes it negotiating, won or lost, a chat
// the buyer opens makes a new lead "contacted", and a requirement sent to the vendor arrives
// as a new lead.
// ─────────────────────────────────────────────────────────────

export const CRM_STAGES = ["new", "contacted", "quoted", "negotiating", "won", "lost"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];
export const OPEN_STAGES: CrmStage[] = ["new", "contacted", "quoted", "negotiating"];

export const STAGE_LABEL: Record<CrmStage, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export type CrmSource = "lead" | "quote" | "direct" | "manual";
export const SOURCE_LABEL: Record<CrmSource, string> = {
  lead: "From Leads",
  quote: "Your quote",
  direct: "Sent to you",
  manual: "Added by you",
};

export interface CrmLead {
  id: string;
  rfqId: string | null;
  buyerId: string | null;
  title: string;
  buyerName: string | null;
  stage: CrmStage;
  valueInr: number | null;
  tags: string[];
  source: CrmSource;
  lostReason: string | null;
  nextFollowUpAt: string | null;
  stageChangedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawLead {
  id: string; rfq_id: string | null; buyer_id: string | null; title: string; buyer_name: string | null;
  stage: string; value_inr: number | string | null; tags: string[] | null; source: string; lost_reason: string | null;
  next_follow_up_at: string | null; stage_changed_at: string; closed_at: string | null; created_at: string; updated_at: string;
}

const LEAD_COLUMNS =
  "id, rfq_id, buyer_id, title, buyer_name, stage, value_inr, tags, source, lost_reason, next_follow_up_at, stage_changed_at, closed_at, created_at, updated_at" as const;

function mapLead(r: RawLead): CrmLead {
  return {
    id: r.id, rfqId: r.rfq_id, buyerId: r.buyer_id, title: r.title, buyerName: r.buyer_name,
    stage: (CRM_STAGES as readonly string[]).includes(r.stage) ? (r.stage as CrmStage) : "new",
    valueInr: r.value_inr == null ? null : Number(r.value_inr),
    tags: r.tags ?? [], source: (r.source as CrmSource) ?? "manual", lostReason: r.lost_reason,
    nextFollowUpAt: r.next_follow_up_at, stageChangedAt: r.stage_changed_at, closedAt: r.closed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** How many closed (won or lost) leads the board loads; open ones all load. */
const CLOSED_SHOWN = 100;

async function fetchLeads(): Promise<CrmLead[]> {
  const [open, closed] = await Promise.all([
    supabase.from("vendor_lead_pipeline").select(LEAD_COLUMNS).in("stage", OPEN_STAGES).order("updated_at", { ascending: false }).limit(5000),
    supabase.from("vendor_lead_pipeline").select(LEAD_COLUMNS).in("stage", ["won", "lost"]).order("closed_at", { ascending: false }).limit(CLOSED_SHOWN),
  ]);
  if (open.error) throw open.error;
  if (closed.error) throw closed.error;
  return [...(open.data ?? []), ...(closed.data ?? [])].map((r) => mapLead(r as RawLead));
}

export function useCrmLeads(vendorId: string | undefined) {
  return useQuery({ queryKey: ["crm", "leads", vendorId], queryFn: fetchLeads, enabled: Boolean(vendorId) });
}

/** The requirements this vendor already tracks (to mark them on Leads). */
export function useTrackedRfqIds(vendorId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["crm", "tracked", vendorId],
    enabled: Boolean(vendorId) && enabled,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("vendor_lead_pipeline").select("rfq_id").not("rfq_id", "is", null).limit(5000);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.rfq_id as string));
    },
  });
}

export interface CrmNote {
  id: string;
  kind: "note" | "stage" | "follow_up";
  body: string;
  meta: { from?: string | null; to?: string; by?: "vendor" | "system"; reason?: string; on_time?: boolean; source?: string };
  createdAt: string;
}
export interface CrmFollowUp {
  id: string;
  pipelineId: string;
  dueAt: string;
  note: string | null;
  doneAt: string | null;
}

export function useCrmLeadDetail(leadId: string | null) {
  return useQuery({
    queryKey: ["crm", "lead", leadId],
    enabled: Boolean(leadId),
    queryFn: async () => {
      const [notes, followUps] = await Promise.all([
        supabase.from("vendor_lead_notes").select("id, kind, body, meta, created_at").eq("pipeline_id", leadId as string)
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("vendor_lead_followups").select("id, pipeline_id, due_at, note, done_at").eq("pipeline_id", leadId as string)
          .order("due_at", { ascending: true }).limit(100),
      ]);
      if (notes.error) throw notes.error;
      if (followUps.error) throw followUps.error;
      return {
        notes: (notes.data ?? []).map((n): CrmNote => ({
          id: n.id, kind: n.kind as CrmNote["kind"], body: n.body, meta: (n.meta ?? {}) as CrmNote["meta"], createdAt: n.created_at,
        })),
        followUps: (followUps.data ?? []).map((f): CrmFollowUp => ({
          id: f.id, pipelineId: f.pipeline_id, dueAt: f.due_at, note: f.note, doneAt: f.done_at,
        })),
      };
    },
  });
}

export interface CrmOpenFollowUp extends CrmFollowUp {
  leadTitle: string;
  leadStage: CrmStage;
}

/** Every open follow-up, earliest first, with its lead's title. */
export function useCrmFollowUps(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["crm", "follow-ups", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<CrmOpenFollowUp[]> => {
      const { data, error } = await supabase
        .from("vendor_lead_followups")
        .select("id, pipeline_id, due_at, note, done_at, vendor_lead_pipeline(title, stage)")
        .is("done_at", null)
        .order("due_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((f) => {
        const lead = (Array.isArray(f.vendor_lead_pipeline) ? f.vendor_lead_pipeline[0] : f.vendor_lead_pipeline) as { title: string; stage: string } | null;
        return {
          id: f.id, pipelineId: f.pipeline_id, dueAt: f.due_at, note: f.note, doneAt: f.done_at,
          leadTitle: lead?.title ?? "", leadStage: (lead?.stage as CrmStage) ?? "new",
        };
      });
    },
  });
}

export interface CrmAnalytics {
  days: number;
  open: Partial<Record<CrmStage, { count: number; value: number }>>;
  openValue: number;
  created: number;
  funnel: { new: number; contacted: number; quoted: number; negotiating: number; won: number };
  won: number;
  wonValue: number;
  lost: number;
  winRate: number | null;
  avgDaysToWin: number | null;
  lostReasons: { reason: string; count: number }[];
  bySource: Partial<Record<CrmSource, number>>;
  followUps: { due: number; done: number; onTime: number; overdueOpen: number };
}

export function useCrmAnalytics(vendorId: string | undefined, days: number) {
  return useQuery({
    queryKey: ["crm", "analytics", vendorId, days],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<CrmAnalytics> => {
      const { data, error } = await supabase.rpc("crm_analytics", { p_days: days });
      if (error) throw error;
      const j = (data ?? {}) as Record<string, unknown> & {
        open?: Record<string, { count: number; value: number | string }>;
        funnel?: CrmAnalytics["funnel"];
        lost_reasons?: { reason: string; count: number }[];
        by_source?: Record<string, number>;
        follow_ups?: { due: number; done: number; on_time: number; overdue_open: number };
      };
      const open: CrmAnalytics["open"] = {};
      for (const [k, v] of Object.entries(j.open ?? {})) open[k as CrmStage] = { count: Number(v.count), value: Number(v.value) };
      return {
        days: Number(j.days ?? days), open, openValue: Number(j.open_value ?? 0), created: Number(j.created ?? 0),
        funnel: j.funnel ?? { new: 0, contacted: 0, quoted: 0, negotiating: 0, won: 0 },
        won: Number(j.won ?? 0), wonValue: Number(j.won_value ?? 0), lost: Number(j.lost ?? 0),
        winRate: j.win_rate == null ? null : Number(j.win_rate),
        avgDaysToWin: j.avg_days_to_win == null ? null : Number(j.avg_days_to_win),
        lostReasons: j.lost_reasons ?? [], bySource: (j.by_source ?? {}) as CrmAnalytics["bySource"],
        followUps: {
          due: Number(j.follow_ups?.due ?? 0), done: Number(j.follow_ups?.done ?? 0),
          onTime: Number(j.follow_ups?.on_time ?? 0), overdueOpen: Number(j.follow_ups?.overdue_open ?? 0),
        },
      };
    },
  });
}

// ── Changes (each one a crm_* function) ─────────────────────────────────────────────
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

export const trackRequirement = (rfqId: string) => call<string>("crm_track", { p_rfq: rfqId });
export const addLead = (input: { title: string; buyerName?: string; valueInr?: number | null; tags?: string[] }) =>
  call<string>("crm_add_lead", {
    p_title: input.title, p_buyer_name: input.buyerName || null, p_value: input.valueInr ?? null, p_tags: input.tags ?? [],
  });
/** Only the keys given change; null clears a value, the buyer's name or the tags. */
export const updateLead = (id: string, patch: {
  title?: string; buyer_name?: string | null; value_inr?: number | null; tags?: string[]; stage?: CrmStage; lost_reason?: string | null;
}) => call<void>("crm_update_lead", { p_id: id, p_patch: patch });
export const deleteLead = (id: string) => call<void>("crm_delete_lead", { p_id: id });
export const addNote = (id: string, body: string) => call<string>("crm_add_note", { p_id: id, p_body: body });
export const addFollowUp = (id: string, dueAt: Date, note?: string) =>
  call<string>("crm_add_follow_up", { p_id: id, p_due: dueAt.toISOString(), p_note: note || null });
export const setFollowUpDone = (id: string, done: boolean) => call<void>("crm_update_follow_up", { p_follow_up: id, p_done: done });
export const moveFollowUp = (id: string, dueAt: Date) => call<void>("crm_update_follow_up", { p_follow_up: id, p_due: dueAt.toISOString() });
export const deleteFollowUp = (id: string) => call<void>("crm_delete_follow_up", { p_follow_up: id });

/** Refresh everything the CRM shows after a change. */
export function useCrmRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["crm"] });
}


/** A lead's value, short ("₹4.5L"); "—" when none is given. The same formatter as Analytics. */
export function formatLeadValue(n: number | null | undefined): string {
  return n == null ? "—" : formatInrCompact(n);
}
