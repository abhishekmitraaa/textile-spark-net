import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { headerKey, parseCsv, toCsv } from "@/lib/csv";

// ─────────────────────────────────────────────────────────────
// Bulk catalogue import (subscriptions P11, 2026-10-09; Silver, Gold and VIP).
//
// The seller downloads a template, fills it in Excel or Google Sheets, saves it as CSV and
// uploads it. Rows are read here, checked lightly so a mistake shows before sending, and sent
// to import_products(), which runs with the seller's own rights: every product rule applies
// as on the Upload page (the listing limit, review before going live). It reports each row
// that didn't go in, and why.
// ─────────────────────────────────────────────────────────────

export interface TemplateColumn { key: string; header: string; required?: boolean; help: string; example: string }

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "name", header: "Name", required: true, help: "The product's name, up to 200 characters.", example: "Cotton polo, 220 GSM" },
  { key: "category", header: "Category", required: true, help: "A Cosora category, e.g. Activewear, or Parent > Child to be exact. Category list (above) has every name.", example: "Activewear" },
  { key: "price", header: "Price", help: "Price per unit in rupees.", example: "240" },
  { key: "compare_at_price", header: "Compare at price", help: "The usual price, to show a discount.", example: "300" },
  { key: "moq", header: "MOQ", help: "Minimum order, e.g. 500 pcs.", example: "500 pcs" },
  { key: "unit", header: "Unit", help: "pcs, metres, kg…", example: "pcs" },
  { key: "description", header: "Description", help: "Up to 4,000 characters.", example: "Breathable pique cotton, bio-washed." },
  { key: "fabric", header: "Fabric", help: "", example: "Cotton" },
  { key: "gsm", header: "GSM", help: "", example: "220" },
  { key: "fit_type", header: "Fit", help: "", example: "Regular" },
  { key: "gender", header: "Gender", help: "Men, Women, Unisex, Boys, Girls or Kids.", example: "Men" },
  { key: "colour", header: "Colour", help: "", example: "Navy" },
  { key: "sizes", header: "Sizes", help: "Separated by commas.", example: "S, M, L, XL" },
  { key: "pattern", header: "Pattern", help: "Separated by commas.", example: "Solid" },
  { key: "occasion", header: "Occasion", help: "Separated by commas.", example: "Casual, Work" },
  { key: "country_of_origin", header: "Country of origin", help: "", example: "India" },
  { key: "image_urls", header: "Image URLs", help: "Up to 6 https links to photos, separated by commas.", example: "https://example.com/polo-front.jpg" },
];

const KNOWN = new Set(TEMPLATE_COLUMNS.map((c) => c.key));
/** Header spellings that mean a column. */
const ALIASES: Record<string, string> = { product_name: "name", title: "name", mrp: "compare_at_price", colour_name: "colour", color: "colour", images: "image_urls", image_url: "image_urls", fit: "fit_type", min_order: "moq" };

export const MAX_ROWS = 500;
const EXAMPLE = Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c.key, c.example]));

export function templateCsv(): string {
  return toCsv([TEMPLATE_COLUMNS.map((c) => c.header), TEMPLATE_COLUMNS.map((c) => c.example)]);
}

export interface ParsedSheet {
  rows: Record<string, string>[];
  /** Each row's number in the spreadsheet, as Excel shows it (the headings are row 1). */
  sheetRows: number[];
  /** Column headers the template doesn't know (left out). */
  ignored: string[];
  /** Problems found before sending, by spreadsheet row number. */
  problems: { row: number; message: string }[];
  /** Whether the two required columns are there. */
  missingColumns: string[];
}

export function readSheet(text: string): ParsedSheet {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], sheetRows: [], ignored: [], problems: [], missingColumns: ["Name", "Category"] };
  const keys = table[0].map((h) => { const k = headerKey(h); return ALIASES[k] ?? k; });
  const ignored = table[0].filter((_, i) => !KNOWN.has(keys[i]) && table[0][i].trim() !== "");
  const missingColumns = TEMPLATE_COLUMNS.filter((c) => c.required && !keys.includes(c.key)).map((c) => c.header);
  const problems: ParsedSheet["problems"] = [];
  const rows: Record<string, string>[] = [];
  const sheetRows: number[] = [];
  table.slice(1).forEach((cells, j) => {
    const r: Record<string, string> = {};
    keys.forEach((k, i) => { if (KNOWN.has(k) && (cells[i] ?? "").trim() !== "") r[k] = (cells[i] ?? "").trim(); });
    if (Object.keys(r).length === 0) return;
    // The template's example row, sent back unchanged, would become a product: leave it out.
    if (r.name === EXAMPLE.name && r.category === EXAMPLE.category && r.image_urls === EXAMPLE.image_urls) {
      problems.push({ row: j + 2, message: "the template's example, left out" });
      return;
    }
    rows.push(r);
    sheetRows.push(j + 2);
  });
  rows.forEach((r, i) => {
    const row = sheetRows[i];
    if (!r.name) problems.push({ row, message: "no name" });
    if (!r.category) problems.push({ row, message: "no category" });
    if (r.price && !/^[₹\s]*[\d,]+(\.\d+)?$/.test(r.price)) problems.push({ row, message: `price "${r.price}" isn't a number` });
  });
  return { rows, sheetRows, ignored, problems, missingColumns };
}

export interface ImportResult {
  batchId: string;
  total: number;
  created: number;
  failed: number;
  results: { row: number; productId?: string; error?: string }[];
}

export async function importProducts(rows: Record<string, string>[], fileName: string, asDraft: boolean): Promise<ImportResult> {
  const { data, error } = await supabase.rpc("import_products", { p_rows: rows, p_file_name: fileName, p_as_draft: asDraft });
  if (error) throw error;
  const j = data as unknown as { batch_id: string; total: number; created: number; failed: number; results: { row: number; product_id?: string; error?: string }[] };
  return {
    batchId: j.batch_id, total: j.total, created: j.created, failed: j.failed,
    results: (j.results ?? []).map((x) => ({ row: x.row, productId: x.product_id, error: x.error })),
  };
}

export interface ImportBatch { id: string; fileName: string | null; asDraft: boolean; total: number; created: number; failed: number; createdAt: string }

export function useImportHistory(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["product_import_batches", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase.from("product_import_batches")
        .select("id, file_name, as_draft, total, created, failed, created_at").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []).map((b) => ({ id: b.id, fileName: b.file_name, asDraft: b.as_draft, total: b.total, created: b.created, failed: b.failed, createdAt: b.created_at }));
    },
  });
}

/** Every category, "Parent > Child" for the ones with a parent, as a CSV to look names up in. */
export async function categoriesCsv(): Promise<string> {
  const { data } = await supabase.from("categories").select("id, name, parent_id");
  const rows = (data ?? []) as { id: string; name: string; parent_id: string | null }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const names = rows.filter((r) => r.parent_id).map((r) => `${byId.get(r.parent_id as string)?.name ?? ""} > ${r.name}`).sort();
  return toCsv([["Category"], ...names.map((n) => [n])]);
}
