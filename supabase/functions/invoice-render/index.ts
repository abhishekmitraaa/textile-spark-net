// Supabase Edge Function: invoice-render  (verify_jwt = true)
//
// A subscription invoice as a PDF (subscriptions P1, 2026-10-08). POST { invoiceId }.
// The caller is confirmed by Auth (_shared/auth.ts) and must be the invoice's vendor, or a
// super, finance or support admin (the same people the invoice's read policy allows).
//
// An issued invoice never changes (corrections are credit notes), so it is drawn once:
// the PDF goes to the private `invoices` bucket at <vendor>/<number>.pdf and the path is
// kept in subscription_invoices.pdf_url. A later call finds it and draws nothing. The
// answer is { path, fileName }; the browser signs the path itself for 5 minutes (the
// bucket's read policy matches the invoice's), so the link always carries the browser's
// own Supabase host. RENDER_VERSION is in the path: raising it redraws every invoice on
// its next download.
//
// The text comes from document.ts; this file only lays it out (pdf-lib, standard fonts).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { verifiedUserId } from "../_shared/auth.ts";
import { invoiceModel, winAnsi, type DocModel, type InvoiceRow } from "./document.ts";

const RENDER_VERSION = 1;
const BUCKET = "invoices";
const ADMIN_ROLES = new Set(["super_admin", "finance_admin", "support"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

const INVOICE_COLUMNS = [
  "id", "vendor_id", "plan_id", "invoice_number", "created_at", "amount", "gst_amount", "gst_number", "discount_amount",
  "discount_code", "credit_rupees", "change_kind", "billing_period_start", "billing_period_end", "razorpay_payment_id",
  "razorpay_order_id", "payment_mode", "document_type", "supplier", "recipient", "place_of_supply", "supply_type", "sac_code",
  "cgst_paise", "sgst_paise", "igst_paise", "total_paise", "pdf_url", "status",
].join(",");

// ── Layout ─────────────────────────────────────────────────────────────────────────
const A4: [number, number] = [595.28, 841.89];
const M = 48;
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.4, 0.43, 0.48);
const BRAND = rgb(0.114, 0.369, 0.839); // vendor blue
const WARN = rgb(0.62, 0.22, 0.05);
const RULE = rgb(0.85, 0.87, 0.9);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = winAnsi(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

async function draw(model: DocModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${model.title} ${model.number}`);
  pdf.setAuthor("Cosora");
  pdf.setProducer("Cosora invoice-render");
  pdf.setCreationDate(new Date());
  const page: PDFPage = pdf.addPage(A4);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - 2 * M;
  let y = A4[1] - M;

  const text = (t: string, x: number, yy: number, size: number, font = regular, color = INK) =>
    page.drawText(winAnsi(t), { x, y: yy, size, font, color });
  const right = (t: string, xRight: number, yy: number, size: number, font = regular, color = INK) =>
    text(t, xRight - font.widthOfTextAtSize(winAnsi(t), size), yy, size, font, color);
  const rule = (yy: number, color = RULE, thickness = 0.75) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: M + width, y: yy }, thickness, color });

  // Title and number
  page.drawRectangle({ x: M, y: y - 4, width: 4, height: 22, color: BRAND });
  text(model.title, M + 12, y, 18, bold);
  right(model.number, M + width, y + 6, 11, bold);
  right(`Date: ${model.issuedOn}`, M + width, y - 8, 9, regular, MUTED);
  y -= 26;
  if (model.notice) {
    for (const l of wrap(model.notice, bold, 9, width)) { text(l, M, y, 9, bold, WARN); y -= 12; }
  }
  y -= 8;
  rule(y);
  y -= 18;

  // Parties
  const col = width / 2 - 8;
  text("FROM", M, y, 8, bold, MUTED);
  text("BILLED TO", M + width / 2 + 8, y, 8, bold, MUTED);
  y -= 14;
  let yl = y;
  let yr = y;
  model.supplier.forEach((l, i) => wrap(l, i === 0 ? bold : regular, 9.5, col).forEach((w) => {
    text(w, M, yl, 9.5, i === 0 ? bold : regular); yl -= 13;
  }));
  model.recipient.forEach((l, i) => wrap(l, i === 0 ? bold : regular, 9.5, col).forEach((w) => {
    text(w, M + width / 2 + 8, yr, 9.5, i === 0 ? bold : regular); yr -= 13;
  }));
  y = Math.min(yl, yr) - 8;
  rule(y);
  y -= 16;

  // Details
  for (const [k, v] of model.meta) {
    text(k, M, y, 9, regular, MUTED);
    const lines = wrap(v, regular, 9, width - 190);
    lines.forEach((l, i) => text(l, M + 190, y - i * 12, 9));
    y -= 12 * lines.length + 3;
  }
  y -= 8;

  // Charges
  page.drawRectangle({ x: M, y: y - 6, width, height: 20, color: rgb(0.95, 0.96, 0.98) });
  text("Description", M + 8, y, 9, bold, MUTED);
  right("Amount", M + width - 8, y, 9, bold, MUTED);
  y -= 24;
  for (const [d, a] of model.lines) {
    const lines = wrap(d, regular, 10, width - 150);
    lines.forEach((l, i) => text(l, M + 8, y - i * 13, 10));
    right(a, M + width - 8, y, 10);
    y -= 13 * lines.length + 6;
  }
  rule(y + 2);
  y -= 14;
  const totalRow = (label: string, value: string, font = regular, size = 10) => {
    right(label, M + width - 140, y, size, font, font === bold ? INK : MUTED);
    right(value, M + width - 8, y, size, font);
    y -= size + 6;
  };
  totalRow("Taxable value", model.taxable);
  for (const [k, v] of model.taxes) totalRow(k, v);
  y -= 2;
  page.drawLine({ start: { x: M + width - 260, y: y + 10 }, end: { x: M + width, y: y + 10 }, thickness: 0.75, color: RULE });
  y -= 4;
  totalRow("Total", model.total, bold, 12);
  for (const l of wrap(model.totalInWords, regular, 9, width)) { right(l, M + width - 8, y, 9, regular, MUTED); y -= 12; }

  // Footer
  let yf = M + 12 * model.footer.length;
  page.drawLine({ start: { x: M, y: yf + 10 }, end: { x: M + width, y: yf + 10 }, thickness: 0.75, color: RULE });
  for (const l of model.footer) { text(l, M, yf - 4, 8.5, regular, MUTED); yf -= 12; }

  return await pdf.save();
}

// ── Handler ────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  const db = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };

  const caller = await verifiedUserId(req, url, serviceKey);
  if (!caller) return json({ error: "unauthenticated" }, 401);

  let invoiceId: string | undefined;
  try {
    invoiceId = (await req.json())?.invoiceId;
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) return json({ error: "bad_invoice" }, 400);

  const r = await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${invoiceId}&select=${INVOICE_COLUMNS}`, { headers: db });
  if (!r.ok) return json({ error: "unavailable" }, 500);
  const inv = ((await r.json()) as Array<InvoiceRow & { vendor_id: string; plan_id: string | null; pdf_url: string | null }>)[0];
  // Someone else's invoice answers exactly as a missing one does.
  if (!inv) return json({ error: "not_found" }, 404);
  if (inv.vendor_id !== caller) {
    const a = await fetch(`${url}/rest/v1/rpc/admin_status_of`, {
      method: "POST", headers: { ...db, "content-type": "application/json" }, body: JSON.stringify({ p_user_id: caller }),
    });
    const status = a.ok ? ((await a.json()) as Array<{ is_admin: boolean; admin_role: string | null }>)[0] : null;
    if (!status?.is_admin || !ADMIN_ROLES.has(status.admin_role ?? "")) return json({ error: "not_found" }, 404);
  }

  const number = inv.invoice_number ?? inv.id;
  const path = `${inv.vendor_id}/${number.replace(/[^A-Za-z0-9-]+/g, "-")}.v${RENDER_VERSION}.pdf`;
  if (inv.pdf_url === path) {
    return json({ path, fileName: `${number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf` });
  }

  const [plan, vendor] = await Promise.all([
    inv.plan_id
      ? fetch(`${url}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(inv.plan_id)}&select=name`, { headers: db })
          .then((x) => (x.ok ? x.json() : [])).catch(() => [])
      : Promise.resolve([]),
    inv.recipient
      ? Promise.resolve([])
      : fetch(`${url}/rest/v1/vendor_profiles?id=eq.${inv.vendor_id}&select=brand_name,owner_name`, { headers: db })
          .then((x) => (x.ok ? x.json() : [])).catch(() => []),
  ]);
  const planName = (plan as Array<{ name: string }>)[0]?.name ?? inv.plan_id ?? "Cosora";
  const v = (vendor as Array<{ brand_name: string | null; owner_name: string | null }>)[0];
  const model = invoiceModel(inv, planName, v?.brand_name || v?.owner_name || null);

  let bytes: Uint8Array;
  try {
    bytes = await draw(model);
  } catch (e) {
    console.error("invoice-render: drawing failed", inv.id, e);
    return json({ error: "render_failed" }, 500);
  }

  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...db, "content-type": "application/pdf", "x-upsert": "true", "cache-control": "max-age=31536000" },
    body: bytes,
  });
  if (!up.ok) {
    console.error("invoice-render: upload failed", inv.id, up.status, (await up.text()).slice(0, 200));
    return json({ error: "store_failed" }, 500);
  }
  // Recording the path is a service-role write, which the invoice-immutability trigger allows.
  await fetch(`${url}/rest/v1/subscription_invoices?id=eq.${inv.id}`, {
    method: "PATCH",
    headers: { ...db, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ pdf_url: path }),
  });
  return json({ path, fileName: model.fileName });
});
