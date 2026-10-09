import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/errorMessage";
import { downloadText } from "@/lib/csv";
import {
  MAX_ROWS, TEMPLATE_COLUMNS, categoriesCsv, importProducts, readSheet, templateCsv, useImportHistory,
  type ImportResult, type ParsedSheet,
} from "@/lib/queries/catalogueImport";

// Bulk import (subscriptions P11; Silver, Gold and VIP): many products from one spreadsheet.
// Download the template, fill it in, save it as CSV, upload it; the rows are checked here,
// then sent to import_products(), which applies every product rule (the listing limit, review
// before going live) and says which rows didn't go in and why.

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function BulkImport() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: history = [] } = useImportHistory(user?.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [asDraft, setAsDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // The spreadsheet row of each row sent, to name rows in the result as Excel numbers them.
  const [sentFrom, setSentFrom] = useState<number[]>([]);

  const onFile = async (f: File | undefined) => {
    setResult(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error("Save the sheet as CSV first", { description: "In Excel: File › Save As › CSV UTF-8. In Google Sheets: File › Download › CSV." });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("That file is over 5 MB", { description: "Split it into smaller sheets." });
      return;
    }
    setFileName(f.name);
    setSheet(readSheet(await f.text()));
  };

  const tooMany = (sheet?.rows.length ?? 0) > MAX_ROWS;
  const canImport = Boolean(sheet && sheet.rows.length > 0 && sheet.missingColumns.length === 0 && !tooMany);

  const run = async () => {
    if (!sheet || !canImport || busy) return;
    setBusy(true);
    try {
      const r = await importProducts(sheet.rows, fileName, asDraft);
      setSentFrom(sheet.sheetRows);
      setResult(r);
      await qc.invalidateQueries({ queryKey: ["product_import_batches"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      if (r.failed === 0) toast.success(`${r.created} products added`);
      else toast(`${r.created} added, ${r.failed} need fixing`);
    } catch (e) {
      toast.error("Couldn't import", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section}>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Bulk import</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {`Add up to ${MAX_ROWS} products at once from a spreadsheet. Each goes to review before buyers see it, as when you add one by hand.`}
          </p>
        </motion.div>

        <motion.div variants={section} className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">1. Get the template</p>
            <p className="mt-1 text-sm text-gray-600">Open it in Excel or Google Sheets. One product per row.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadText("cosora-products-template.csv", templateCsv())} data-testid="bulk-template"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-vendor px-3 py-2 text-xs font-bold text-white hover:opacity-90">
                <Download className="h-4 w-4" /> Template
              </button>
              <button type="button" onClick={async () => downloadText("cosora-categories.csv", await categoriesCsv())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
                <Download className="h-4 w-4" /> Category list
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">2. Save it as CSV</p>
            <p className="mt-1 text-sm text-gray-600">In Excel: File › Save As › CSV UTF-8. In Google Sheets: File › Download › CSV.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">3. Upload it</p>
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" data-testid="bulk-file"
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" onClick={() => fileInput.current?.click()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-vendor px-3 py-2 text-xs font-bold text-brand-vendor hover:bg-brand-vendor/5">
              <Upload className="h-4 w-4" /> Choose a CSV file
            </button>
          </div>
        </motion.div>

        {sheet && (
          <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="bulk-preview">
            <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <FileSpreadsheet className="h-4 w-4 text-brand-vendor" />
              <span data-no-translate>{fileName}</span>
              <span className="font-normal text-gray-500">{` · ${sheet.rows.length} rows`}</span>
            </p>
            {sheet.missingColumns.length > 0 && (
              <p className="mt-2 text-sm text-red-700">{`The sheet needs these columns: ${sheet.missingColumns.join(", ")}. Start from the template.`}</p>
            )}
            {tooMany && <p className="mt-2 text-sm text-red-700">{`That's more than ${MAX_ROWS} rows. Split it into smaller sheets.`}</p>}
            {sheet.ignored.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">Columns left out (the template doesn't have them): <span data-no-translate>{sheet.ignored.join(", ")}</span></p>
            )}
            {sheet.problems.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-amber-800" data-testid="bulk-problems">
                {sheet.problems.slice(0, 50).map((p, i) => <li key={i}><span>{`Row ${p.row}:`}</span> <span>{p.message}</span></li>)}
              </ul>
            )}
            {sheet.rows.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-gray-500">
                    <tr>{["Row", "Name", "Category", "Price", "MOQ", "Images"].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1 text-gray-400">{sheet.sheetRows[i]}</td>
                        <td className="max-w-[16rem] truncate px-2 py-1" data-no-translate>{r.name ?? "—"}</td>
                        <td className="px-2 py-1" data-no-translate>{r.category ?? "—"}</td>
                        <td className="px-2 py-1">{r.price ?? "—"}</td>
                        <td className="px-2 py-1" data-no-translate>{r.moq ?? "—"}</td>
                        <td className="px-2 py-1">{r.image_urls ? r.image_urls.split(",").length : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sheet.rows.length > 8 && <p className="mt-1 text-[11px] text-gray-400">{`and ${sheet.rows.length - 8} more`}</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Switch checked={asDraft} onCheckedChange={setAsDraft} aria-label="Save as drafts" />
                Save as drafts (send them to review later from Products)
              </label>
              <button type="button" onClick={run} disabled={!canImport || busy} data-testid="bulk-import"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-vendor px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {`Import ${sheet.rows.length} products`}
              </button>
            </div>
          </motion.div>
        )}

        {result && (
          <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="bulk-result">
            <p className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{`${result.created} added`}</span>
              {result.failed > 0 && <span className="inline-flex items-center gap-1 font-bold text-red-700"><XCircle className="h-4 w-4" />{`${result.failed} not added`}</span>}
              <Link to="/products" className="ml-auto font-medium text-brand-vendor hover:underline">Open Products</Link>
            </p>
            {result.failed > 0 && (
              <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-xs text-red-800" data-testid="bulk-errors">
                {result.results.filter((r) => r.error).map((r) => <li key={r.row}><span>{`Row ${sentFrom[r.row - 1] ?? r.row}:`}</span> <span>{r.error}</span></li>)}
              </ul>
            )}
          </motion.div>
        )}

        <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">The template's columns</h2>
          <p className="mt-0.5 text-xs text-gray-500">Keep the headings in English, as in the template. Columns marked * are needed on every row.</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {TEMPLATE_COLUMNS.map((c) => (
              <div key={c.key} className="flex gap-2">
                <dt className="w-32 shrink-0 font-semibold text-gray-800" data-no-translate>{c.header}{c.required ? " *" : ""}</dt>
                <dd className="text-gray-500">{c.help || "—"}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        {history.length > 0 && (
          <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="bulk-history">
            <h2 className="text-sm font-bold text-gray-900">Recent imports</h2>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {history.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="font-medium text-gray-900" data-no-translate>{b.fileName ?? "Sheet"}</span>
                  <span className="text-xs text-gray-500">{WHEN.format(new Date(b.createdAt))}{b.asDraft ? " · drafts" : ""}</span>
                  <span className="ml-auto text-xs text-gray-700">{`${b.created} of ${b.total} added`}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
