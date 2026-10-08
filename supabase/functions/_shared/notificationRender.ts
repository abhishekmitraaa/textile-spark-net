// ─────────────────────────────────────────────────────────────
// Turning an outbox row and its template into what each channel sends (subscriptions P2,
// 2026-10-08). Pure: no Deno APIs and no imports, so Node can check it
// (scripts/subscriptions/notification-dispatch-check.mjs).
//
// Templates use {{payload_key}}. A missing key renders as nothing, never as "undefined".
// In email HTML every value is escaped; in a link path every value is URL-encoded, so a
// payload can't add markup or change where a link goes.
// ─────────────────────────────────────────────────────────────

export interface OutboxRow {
  id: string;
  channel: "email" | "whatsapp" | "sms";
  to_address: string;
  payload: Record<string, unknown>;
  template_key: string;
  attempts: number;
  subject: string | null;
  body: string;
  cta_label: string | null;
  cta_path: string | null;
  wa_template: string | null;
  wa_language: string | null;
  wa_params: string[] | null;
  sms_dlt_template_id: string | null;
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

function value(payload: Record<string, unknown>, key: string): string {
  const v = payload?.[key];
  return v === null || v === undefined ? "" : String(v);
}

export function fill(template: string, payload: Record<string, unknown>, encode: (s: string) => string = (s) => s): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => encode(value(payload, key)));
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Subject, plain text and HTML, with the template's button linking into Cosora. */
export function renderEmail(row: OutboxRow, siteUrl: string): RenderedEmail {
  const subject = fill(row.subject ?? "Cosora", row.payload).replace(/\s+/g, " ").trim();
  const text = fill(row.body, row.payload);
  const base = siteUrl.replace(/\/+$/, "");
  const link = row.cta_path ? `${base}${fill(row.cta_path, row.payload, encodeURIComponent)}` : null;
  const paragraphs = fill(row.body, row.payload, escapeHtml)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#363636">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = link && row.cta_label
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#256fef;color:#ffffff;` +
      `text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px">${escapeHtml(row.cta_label)}</a></p>`
    : "";
  const html =
    `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6fa;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d0d4dc;border-radius:12px">` +
    `<tr><td style="padding:22px 26px 6px;font-size:20px;font-weight:700;color:#256fef">Cosora</td></tr>` +
    `<tr><td style="padding:10px 26px 22px">${paragraphs}${button}</td></tr>` +
    `<tr><td style="padding:14px 26px;border-top:1px solid #e8ebf0;font-size:12px;line-height:1.5;color:#6b7280">` +
    `You're getting this because of your Cosora account. Questions? Reply through Help &amp; Support in the app.</td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject, text: link && row.cta_label ? `${text}\n\n${row.cta_label}: ${link}` : text, html };
}

/** The template's body parameters, in order. */
export function whatsappParams(row: OutboxRow): string[] {
  return (row.wa_params ?? []).map((k) => value(row.payload, k));
}

export function renderSms(row: OutboxRow): string {
  return fill(row.body, row.payload).replace(/\s+/g, " ").trim();
}
