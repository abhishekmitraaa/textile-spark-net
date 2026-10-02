import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { getLang, type Lang } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import {
  SUPPORT_EMAIL, SUPPORT_HOURS_LABEL, SUPPORT_PHONE, SUPPORT_PHONE_LABEL,
} from "@/lib/supportContact";

// ─────────────────────────────────────────────────────────────
// Help & Support, the requester side (plan P3, documentation/help-feature-plan.md).
//
// Every write goes through a support_* function (migration
// 20260930213143_support_requester_rpcs.sql); the tables are read-only to the app.
// What the database guarantees, so this file doesn't have to:
//   * the person only ever sees "Cosora Support", never a staff name (D-06);
//   * internal notes never reach them; fraud evidence is write-only for them;
//   * support_settings.rollout decides who may open or add to a request. When it
//     says no, support_status().available is false and Help shows the phone and
//     email (lib/supportContact.ts), which is the plan's fallback.
// ─────────────────────────────────────────────────────────────

export type SupportChannel = "chat" | "callback" | "fraud_report" | "feedback";
export type RequestStatus = "new" | "open" | "resolved" | "closed";
export type Side = "buyer" | "vendor";
type LangText = Partial<Record<Lang, string>>;

/** A label stored as {en, hi, gu}, in the current language, falling back to English. */
export function labelIn(label: Json | LangText | null | undefined, lang: Lang = getLang()): string {
  if (!label || typeof label !== "object" || Array.isArray(label)) return "";
  const l = label as Record<string, unknown>;
  return String(l[lang] ?? l.en ?? "");
}

// ── Errors ───────────────────────────────────────────────────
// The functions raise with a HINT; these are the words the app shows for each.
const HINT_MESSAGES: Record<string, string> = {
  not_signed_in: "Sign in to contact support.",
  account_deleted: "This account has been deleted.",
  support_unavailable: "Chat support isn't available for your account yet. Call or email us instead.",
  rate_limited: "Too many requests. Please wait a while and try again.",
  too_many_open: "You already have several open requests. Please continue one of those.",
  closed: "This request is closed. Start a new one if you need more help.",
  callback_exists: "You already have a callback booked.",
  slot_unavailable: "That time isn't available. Pick another slot.",
  file_type: "Send a photo (JPG, PNG or WebP), a PDF or a voice note.",
  file_size: "That file is too large.",
  too_many_files: "Too many files for this request.",
  upload_incomplete: "A file hasn't finished uploading. Try again.",
  file_unchecked: "A file is still being checked. Try again in a moment.",
};

/** The message to show for a failed support call. */
export function supportError(e: unknown): string {
  const hint = typeof e === "object" && e !== null && "hint" in e ? (e as { hint?: unknown }).hint : null;
  if (typeof hint === "string" && HINT_MESSAGES[hint]) return HINT_MESSAGES[hint];
  return errorMessage(e);
}

function check<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

// ── Status: open now, next opening, who may use support ──────
export interface SupportStatus {
  available: boolean;
  open_now: boolean;
  next_open_at: string | null;
  phone: string;
  email: string;
  hours: { weekday: number; is_open: boolean; open: string | null; close: string | null }[];
  holidays: { day: string; label: string }[];
}

/** What Help shows before support_status() answers, or if it fails. */
export const FALLBACK_STATUS: SupportStatus = {
  available: false,
  open_now: false,
  next_open_at: null,
  phone: SUPPORT_PHONE,
  email: SUPPORT_EMAIL,
  hours: [],
  holidays: [],
};

/** support_status() answers signed out too. `available` is per caller (rollout). */
export function useSupportStatus(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["support", "status", userId ?? "anon"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SupportStatus> =>
      check(await supabase.rpc("support_status")) as unknown as SupportStatus,
  });
}

// Dates on India time, in the reader's language: the sentences around them are
// translated as templates ("We'll reply from {0}."), so the date that fills {0} has to
// be in the same language. Formatters are cached per language and shape.
const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };
const FORMATS = new Map<string, Intl.DateTimeFormat>();

export function istFormat(value: Date, opts: Intl.DateTimeFormatOptions): string {
  const lang = getLang();
  const key = `${lang}|${JSON.stringify(opts)}`;
  let f = FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang] ?? "en-IN", { timeZone: "Asia/Kolkata", ...opts });
    FORMATS.set(key, f);
  }
  return f.format(value);
}

/** "Mon, 5 Oct, 10:00 IST" (सोम, 5 अक्टू॰, 10:00 IST in Hindi) */
export function istLabel(iso: string | null | undefined): string {
  return iso
    ? `${istFormat(new Date(iso), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST`
    : "";
}

/** A calendar day the database gives as "2026-10-02": "Fri, 2 Oct". */
export function istDayLabel(day: string): string {
  return istFormat(new Date(`${day}T00:00:00+05:30`), { weekday: "short", day: "numeric", month: "short" });
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The opening hours as one line, from support_hours. The seeded week (D-18) reads as
 * the same sentence lib/supportContact.ts holds; any other week is spelled out by day.
 */
export function hoursLabel(status: SupportStatus | undefined): string {
  const open = (status?.hours ?? []).filter((h) => h.is_open && h.open && h.close);
  if (!open.length) return SUPPORT_HOURS_LABEL;
  const seeded = open.length === 5 && open.every((h) => h.weekday >= 1 && h.weekday <= 5 && h.open === "10:00" && h.close === "19:00");
  if (seeded) return SUPPORT_HOURS_LABEL;
  // Monday first; runs of days with the same times share one range.
  const week = [1, 2, 3, 4, 5, 6, 0].map((d) => open.find((h) => h.weekday === d) ?? null);
  const parts: string[] = [];
  let i = 0;
  while (i < week.length) {
    const h = week[i];
    if (!h) { i++; continue; }
    let j = i;
    while (j + 1 < week.length && week[j + 1]?.open === h.open && week[j + 1]?.close === h.close) j++;
    const days = i === j ? DAY_SHORT[week[i]!.weekday] : `${DAY_SHORT[week[i]!.weekday]}–${DAY_SHORT[week[j]!.weekday]}`;
    parts.push(`${days} ${h.open}–${h.close}`);
    i = j + 1;
  }
  return `${parts.join(", ")} IST. Closed on holidays.`;
}

export function phoneLabel(phone: string): string {
  return phone === SUPPORT_PHONE ? SUPPORT_PHONE_LABEL : phone;
}
export { SUPPORT_HOURS_LABEL };

// ── Topics ───────────────────────────────────────────────────
export interface SupportTopic {
  code: string;
  audience: "buyer" | "vendor" | "both";
  channels: SupportChannel[];
  label: LangText;
  position: number;
}

/** Active topics (RLS shows only active ones), for a side and a channel. */
export function useSupportTopics(side: Side, channel: SupportChannel) {
  return useQuery({
    queryKey: ["support", "topics"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<SupportTopic[]> =>
      check(await supabase.from("support_categories").select("code, audience, channels, label, position").order("position")) as SupportTopic[],
    select: (rows) => rows.filter((t) => (t.audience === "both" || t.audience === side) && t.channels.includes(channel)),
  });
}

/**
 * The topic a link asks for, if this person can use it. "account" means their own
 * side's account topic, so one link (the suspension notice) works for both sides.
 */
export function resolveTopic(asked: string | null, side: Side, topics: SupportTopic[]): string | null {
  if (!asked) return null;
  const code = asked === "account" ? (side === "vendor" ? "vendor_account" : "buyer_account") : asked;
  return topics.some((t) => t.code === code) ? code : null;
}

// ── My requests ──────────────────────────────────────────────
export interface MyRequest {
  id: string;
  ticket_no: string;
  channel: SupportChannel;
  category: string;
  category_label: LangText;
  status: RequestStatus;
  subject: string;
  created_at: string;
  last_message_at: string;
  resolved_at: string | null;
  unread: boolean;
  callback: { date: string; start: string; end: string; outcome: string } | null;
}

export function useMyRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["support", "mine"],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<MyRequest[]> =>
      (check(await supabase.rpc("support_my_requests", { p_limit: 100 })) ?? []) as unknown as MyRequest[],
  });
}

// ── One request, live ────────────────────────────────────────
export interface ThreadMessage {
  id: string;
  author_kind: "requester" | "staff" | "system";
  kind: "text" | "attachment" | "event";
  body: string | null;
  event: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  mine: boolean;
}

export interface ThreadAttachment {
  id: string;
  message_id: string;
  kind: "image" | "pdf" | "audio";
  mime: string;
  bytes: number;
  duration_ms: number | null;
  path: string;
}

export interface RequestDetail {
  ticket: {
    id: string;
    ticket_no: string;
    channel: SupportChannel;
    category: string;
    category_label: LangText;
    status: RequestStatus;
    subject: string;
    language: Lang;
    created_at: string;
    last_message_at: string;
    resolved_at: string | null;
    closed_at: string | null;
    can_reply: boolean;
  };
  callback: { date: string; start: string; end: string; outcome: string } | null;
  files_received: number;
  messages: ThreadMessage[];
  attachments: ThreadAttachment[];
}

/**
 * A request and its thread, kept live. New messages and status changes arrive over
 * Realtime as "refetch" signals (RLS decides what reaches this person; the columns
 * naming staff aren't granted to them). The topic carries a per-instance suffix:
 * `supabase.channel(name)` returns an already-open channel for a name, and calling
 * .on() on that throws (see lib/queries/notifications.ts).
 */
export function useSupportThread(ticketNo: string | undefined) {
  const qc = useQueryClient();
  const topic = useRef(`support-thread:${Math.random().toString(36).slice(2)}`);
  const query = useQuery({
    queryKey: ["support", "request", ticketNo],
    enabled: Boolean(ticketNo),
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<RequestDetail> =>
      check(await supabase.rpc("support_request_detail", { p_ticket_no: ticketNo! })) as unknown as RequestDetail,
  });
  const ticketId = query.data?.ticket.id;

  useEffect(() => {
    if (!ticketId) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["support", "request", ticketNo] });
      void qc.invalidateQueries({ queryKey: ["support", "mine"] });
    };
    const channel = supabase
      .channel(topic.current)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ticketId, ticketNo, qc]);

  return query;
}

// ── Actions ──────────────────────────────────────────────────
export async function startChat(input: {
  category: string; body: string; entityType?: string | null; entityId?: string | null;
}): Promise<{ ticket_id: string; ticket_no: string; continued: boolean; open_now: boolean; next_open_at: string | null }> {
  const data = check(await supabase.rpc("support_start_chat", {
    p_category: input.category,
    p_body: input.body,
    p_language: getLang(),
    p_entity_type: input.entityType ?? undefined,
    p_entity_id: input.entityId ?? undefined,
  }));
  return data as unknown as { ticket_id: string; ticket_no: string; continued: boolean; open_now: boolean; next_open_at: string | null };
}

export async function postMessage(ticketId: string, body: string | null, attachmentIds: string[]): Promise<void> {
  check(await supabase.rpc("support_post_message", {
    p_ticket_id: ticketId,
    p_body: body?.trim() || undefined,
    p_attachment_ids: attachmentIds.length ? attachmentIds : undefined,
  }));
}

export async function endChat(ticketId: string): Promise<void> {
  check(await supabase.rpc("support_end_chat", { p_ticket_id: ticketId }));
}

export async function reopenRequest(ticketId: string): Promise<void> {
  check(await supabase.rpc("support_reopen", { p_ticket_id: ticketId }));
}

export async function markRead(ticketId: string): Promise<void> {
  // Best effort: an unread dot that stays is not worth an error toast.
  await supabase.rpc("support_mark_read", { p_ticket_id: ticketId });
}

export interface CallbackSlot { date: string; start: string; end: string }

export function useCallbackSlots(enabled: boolean) {
  return useQuery({
    queryKey: ["support", "slots"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CallbackSlot[]> =>
      (check(await supabase.rpc("support_callback_slots", { p_days: 7 })) ?? []) as unknown as CallbackSlot[],
  });
}

export async function requestCallback(input: {
  category: string; phone: string; date: string; start: string; note?: string;
}): Promise<{ ticket_no: string; date: string; start: string; end: string }> {
  const data = check(await supabase.rpc("support_request_callback", {
    p_category: input.category,
    p_phone: input.phone,
    p_date: input.date,
    p_window_start: input.start,
    p_note: input.note?.trim() || undefined,
    p_language: getLang(),
  }));
  return data as unknown as { ticket_no: string; date: string; start: string; end: string };
}

/**
 * What a fraud report is about, when it's something on Cosora: a seller or a listing.
 * support_report_fraud checks it exists; the confirmed-fraud record then names the
 * account and its status (admin.fraud_findings). Without it, a report only carries
 * the name and link the person typed, and the record says "Not linked to an account".
 */
export type FraudTarget = { type: "vendor" | "product"; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** From a "Report" link's ?entity_type=&entity_id=. */
export function fraudTargetFromParams(params: URLSearchParams): FraudTarget | null {
  const type = params.get("entity_type");
  const id = params.get("entity_id") ?? "";
  return (type === "vendor" || type === "product") && UUID_RE.test(id) ? { type, id } : null;
}

/** From a Cosora store or listing link the person pasted (/vendor/<id>, /product/<id>). */
export function fraudTargetFromLink(raw: string): FraudTarget | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), window.location.origin);
  } catch {
    return null;
  }
  const own = url.host === window.location.host || /(^|\.)cosora\.in$/i.test(url.hostname);
  const m = url.pathname.match(/^\/(vendor|product)\/([^/?#]+)\/?$/);
  return own && m && UUID_RE.test(m[2]) ? { type: m[1] as FraudTarget["type"], id: m[2] } : null;
}

export async function reportFraud(input: {
  description: string; reportedName?: string; reportedPhone?: string; reportedUrl?: string;
  amountInr?: number | null; incidentDate?: string | null; city?: string; target?: FraudTarget | null;
}): Promise<{ ticket_id: string; ticket_no: string }> {
  const data = check(await supabase.rpc("support_report_fraud", {
    p_description: input.description,
    p_reported_name: input.reportedName?.trim() || undefined,
    p_reported_phone: input.reportedPhone?.trim() || undefined,
    p_reported_url: input.reportedUrl?.trim() || undefined,
    p_amount_inr: input.amountInr ?? undefined,
    p_incident_date: input.incidentDate || undefined,
    p_city: input.city?.trim() || undefined,
    p_language: getLang(),
    p_reported_entity_type: input.target?.type,
    p_reported_entity_id: input.target?.id,
  }));
  return data as unknown as { ticket_id: string; ticket_no: string };
}

export async function submitFeedback(input: { kind: "bug" | "idea"; body: string; page?: string | null }): Promise<{ ticket_no: string }> {
  const data = check(await supabase.rpc("support_submit_feedback", {
    p_kind: input.kind,
    p_body: input.body,
    p_page: input.page || undefined,
    p_language: getLang(),
  }));
  return data as unknown as { ticket_no: string };
}

/**
 * The email receipt for feedback and fraud reports (P6; D-20, D-22), through the
 * support-receipt edge function. Never throws: a receipt is extra, the screen already shows
 * the request number. Say "we've emailed you" only when status is "sent".
 */
export type ReceiptStatus = "sent" | "not_configured" | "no_email" | "already_sent" | "send_failed" | "not_found" | "error";
export async function sendSupportReceipt(ticketNo: string): Promise<{ status: ReceiptStatus; to?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("support-receipt", { body: { ticket_no: ticketNo } });
    if (error || !data || typeof data.status !== "string") return { status: "error" };
    return { status: data.status as ReceiptStatus, to: typeof data.to === "string" ? data.to : undefined };
  } catch {
    return { status: "error" };
  }
}

/** Asks for the receipt once per request number (the function also refuses a second send). */
export function useSupportReceipt(ticketNo: string | null) {
  return useQuery({
    queryKey: ["support-receipt", ticketNo],
    enabled: Boolean(ticketNo),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: () => sendSupportReceipt(ticketNo!),
  });
}

// ── Quick Guides ─────────────────────────────────────────────
// Written in Cosora-Admin (FAQs → Quick Guides). Active ones are public
// (help_guides_select_active), so signed-out visitors read them too.
export interface HelpGuideRow {
  slug: string;
  audience: "buyer" | "vendor" | "both";
  title: LangText;
  body: LangText;
  position: number;
}

export function useHelpGuides() {
  return useQuery({
    queryKey: ["help-guides", "active"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<HelpGuideRow[]> =>
      (check(await supabase.from("help_guides").select("slug, audience, title, body, position").order("position")) ?? []) as unknown as HelpGuideRow[],
  });
}

// ── Files ────────────────────────────────────────────────────
export const SUPPORT_BUCKET = "support-attachments";
const MB = 1024 * 1024;
const KINDS: Record<string, "image" | "pdf" | "audio"> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image",
  "application/pdf": "pdf",
  "audio/webm": "audio", "audio/ogg": "audio", "audio/mp4": "audio", "audio/mpeg": "audio",
  "audio/aac": "audio", "audio/x-m4a": "audio", "audio/wav": "audio",
};
export const PHOTO_TYPES = "image/jpeg,image/png,image/webp";
export const AUDIO_TYPES = "audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/aac,audio/x-m4a,audio/wav";

/** "audio/webm;codecs=opus" → "audio/webm": the type is reserved and served exactly. */
export function baseMime(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/** The same limits admin.support_reserve_upload() enforces, checked early. Null when fine. */
export function fileProblem(file: File): string | null {
  const kind = KINDS[baseMime(file.type)];
  if (!kind) return "Send a photo (JPG, PNG or WebP), a PDF or a voice note.";
  if (file.size > (kind === "pdf" ? 10 : 5) * MB) return kind === "pdf" ? "A PDF can be up to 10 MB." : "A photo or voice note can be up to 5 MB.";
  return null;
}

/**
 * Reserve a path, upload, and have support-attachment-verify check the file. A
 * message can carry only a checked file, so this returns only once it's clean.
 */
export async function uploadSupportFile(ticketId: string, file: File, durationMs?: number): Promise<string> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  const mime = baseMime(file.type);
  const reserved = check(await supabase.rpc("support_prepare_upload", {
    p_ticket_id: ticketId, p_kind: KINDS[mime], p_mime: mime, p_bytes: file.size,
    p_duration_ms: durationMs ? Math.round(durationMs) : undefined,
  })) as unknown as { attachment_id: string; path: string };
  const up = await supabase.storage.from(SUPPORT_BUCKET).upload(reserved.path, file, { contentType: mime, upsert: false });
  if (up.error) throw new Error("The file didn't upload. Try again.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await supabase.functions.invoke("support-attachment-verify", { body: { attachmentId: reserved.attachment_id } });
    if (r.error) throw new Error("The file couldn't be checked. Try again.");
    const status = (r.data as { status?: string } | null)?.status;
    if (status === "clean") return reserved.attachment_id;
    if (status === "rejected") throw new Error("That file couldn't be accepted: its contents don't match its type.");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("The file couldn't be checked. Try again.");
}

/** A short-lived link to a file this person may open. PDFs download. */
export async function supportFileUrl(a: Pick<ThreadAttachment, "path" | "kind" | "id">): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrl(a.path, 300, a.kind === "pdf" ? { download: `cosora-support-${a.id.slice(0, 8)}.pdf` } : undefined);
  if (error || !data?.signedUrl) throw new Error("The file couldn't be opened.");
  return data.signedUrl;
}
