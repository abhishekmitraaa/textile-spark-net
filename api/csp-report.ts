/**
 * POST /api/csp-report
 *
 * Receives Content-Security-Policy violation reports while the marketplace's
 * full policy runs as Content-Security-Policy-Report-Only (see vercel.json), and
 * stores them, aggregated, in public.csp_violations via csp_report_ingest().
 *
 * Browsers send two formats:
 *   - Chrome and Edge use the Reporting API (Reporting-Endpoints header):
 *     application/reports+json, an array of { type: "csp-violation", body }.
 *   - Firefox and Safari use report-uri: application/csp-report,
 *     { "csp-report": { "violated-directive", "blocked-uri", ... } }.
 * Both are normalised to the same shape before they reach the database.
 *
 * What is kept, and why so little: the directive, the blocked ORIGIN (never a
 * full URL), the page PATH with ids collapsed and no query string, the script's
 * source file without its query, and a short sample. No IP, no user agent, no
 * user id. That is enough to correct the policy and nothing more.
 *
 * Always answers 204. A browser does nothing useful with an error here, and a
 * reporting failure must never be visible to the person using the site.
 */

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?(event: string, cb: (chunk?: unknown) => void): void;
};
type Res = {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  end(): void;
};

type Normalised = {
  directive: string;
  blocked: string;
  document_path: string;
  source: string;
  sample: string | null;
  disposition: string;
};

const MAX_BODY = 64 * 1024;

/** Only reports about our own pages are stored. */
const OWN_HOST = /(^|\.)cosora\.in$|\.vercel\.app$/;

const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "self", "data", "blob", "trusted-types-policy", "trusted-types-sink"]);

function blockedOrigin(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "unknown";
  if (KEYWORDS.has(v)) return v;
  if (v.startsWith("data:")) return "data";
  if (v.startsWith("blob:")) return "blob";
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return v.slice(0, 60);
  }
}

/** Path only, ids collapsed, so /product/<uuid> is one row, not one per product. */
function pagePath(value: unknown): { host: string; path: string } | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    const path = u.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
      .replace(/\/\d{3,}(?=\/|$)/g, "/:id");
    return { host: u.hostname, path: path || "/" };
  } catch {
    return null;
  }
}

function sourceFile(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "";
  }
}

function normalise(r: Record<string, unknown>): Normalised | null {
  const page = pagePath(r.documentURL ?? r["document-uri"]);
  if (!page || !OWN_HOST.test(page.host)) return null;
  const directive = String(r.effectiveDirective ?? r["effective-directive"] ?? r["violated-directive"] ?? "")
    .trim()
    .split(/\s+/)[0];
  const sample = r.sample ?? r["script-sample"];
  return {
    directive: directive || "unknown",
    blocked: blockedOrigin(r.blockedURL ?? r["blocked-uri"]),
    document_path: page.path,
    source: sourceFile(r.sourceFile ?? r["source-file"]),
    sample: typeof sample === "string" && sample ? sample.slice(0, 120) : null,
    disposition: String(r.disposition ?? "report").slice(0, 16),
  };
}

async function readBody(req: Req): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "object" && !(req.body instanceof Uint8Array)) return req.body;
    const text = typeof req.body === "string" ? req.body : Buffer.from(req.body as Uint8Array).toString("utf8");
    return text.length > MAX_BODY ? null : JSON.parse(text);
  }
  // Report content types are not ones the runtime parses for us: read the stream.
  const chunks: Buffer[] = [];
  let size = 0;
  await new Promise<void>((resolve) => {
    if (!req.on) return resolve();
    req.on("data", (c) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(String(c));
      size += b.length;
      if (size <= MAX_BODY) chunks.push(b);
    });
    req.on("end", () => resolve());
    req.on("error", () => resolve());
  });
  if (!chunks.length || size > MAX_BODY) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(req.method === "OPTIONS" ? 204 : 405).end();
    return;
  }

  try {
    const raw = await readBody(req);
    const items: Record<string, unknown>[] = Array.isArray(raw)
      ? raw
          .filter((x) => x && typeof x === "object" && (x as { type?: string }).type === "csp-violation")
          .map((x) => ((x as { body?: unknown }).body ?? {}) as Record<string, unknown>)
      : raw && typeof raw === "object" && "csp-report" in raw
        ? [(raw as { "csp-report": Record<string, unknown> })["csp-report"]]
        : [];

    const reports = items.map(normalise).filter((x): x is Normalised => x !== null).slice(0, 20);
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (reports.length && url && key) {
      await fetch(`${url}/rest/v1/rpc/csp_report_ingest`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_reports: reports }),
      });
    }
  } catch {
    // Malformed or oversized reports are dropped. Nothing to tell the browser.
  }
  res.status(204).end();
}
