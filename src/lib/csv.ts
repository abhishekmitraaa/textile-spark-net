// CSV in and out (RFC 4180), for the bulk catalogue import (subscriptions P11). Excel opens
// and saves these; a sheet saved as "CSV UTF-8" starts with a byte-order mark, which is
// dropped. Fields may be quoted; a quote inside a quoted field is doubled; quoted fields may
// hold commas and line breaks.

/** Rows of fields. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { if (s[i + 1] === "\n") i++; endRow(); i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/** One CSV line per row, quoting where a field needs it; CRLF line ends, as Excel writes. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const t = v == null ? "" : String(v);
    return /[",\r\n]/.test(t) || /^\s|\s$/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** A header as a key: "Compare at price" -> "compare_at_price". */
export function headerKey(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Offer text to the reader as a file to save. */
export function downloadText(fileName: string, text: string, type = "text/csv;charset=utf-8") {
  // The byte-order mark tells Excel the file is UTF-8 (₹, Hindi and Gujarati survive).
  const blob = new Blob(["\uFEFF" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
