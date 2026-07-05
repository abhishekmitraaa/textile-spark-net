import { useSyncExternalStore } from "react";
import { QUOTES, RFQS, type QuoteStatus, type Rfq, type VendorQuote } from "@/lib/quotesData";

// ─────────────────────────────────────────────────────────────
// Quotes store — holds the mutable status of every received quote
// (pending → shortlisted / accepted / rejected) plus persistence. RFQs
// themselves are static (quotesData); only quote status changes here.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "cosora.quotes.v1";

type StatusMap = Record<string, QuoteStatus>;

function loadStatuses(): StatusMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StatusMap;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

// Seed each quote's status, then apply any persisted overrides.
let quotes: Record<string, VendorQuote> = (() => {
  const overrides = loadStatuses();
  const map: Record<string, VendorQuote> = {};
  for (const q of QUOTES) map[q.id] = { ...q, status: overrides[q.id] ?? q.status };
  return map;
})();

const listeners = new Set<() => void>();

function persist() {
  try {
    const statuses: StatusMap = {};
    for (const id in quotes) statuses[id] = quotes[id].status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  } catch {
    /* storage unavailable */
  }
}

function commit(next: Record<string, VendorQuote>) {
  quotes = next;
  persist();
  listeners.forEach((l) => l());
}

export function setQuoteStatus(id: string, status: QuoteStatus) {
  const q = quotes[id];
  if (!q) return;
  commit({ ...quotes, [id]: { ...q, status } });
}

// ── Selectors ──
export function quotesForRfq(map: Record<string, VendorQuote>, rfqId: string): VendorQuote[] {
  return Object.values(map).filter((q) => q.rfqId === rfqId);
}

export interface RfqStats {
  total: number;
  pending: number;
  shortlisted: number;
  accepted: number;
  rejected: number;
  newCount: number;
}

export function rfqStats(list: VendorQuote[]): RfqStats {
  return {
    total: list.length,
    pending: list.filter((q) => q.status === "pending").length,
    shortlisted: list.filter((q) => q.status === "shortlisted").length,
    accepted: list.filter((q) => q.status === "accepted").length,
    rejected: list.filter((q) => q.status === "rejected").length,
    newCount: list.filter((q) => q.isNew).length,
  };
}

export function bestPrice(list: VendorQuote[]): VendorQuote | null {
  const priced = list.filter((q) => q.status !== "rejected");
  if (priced.length === 0) return null;
  // Rank on the INR-normalized value so mixed-currency quotes compare fairly.
  return priced.reduce((a, b) => (b.priceINR < a.priceINR ? b : a));
}

export function topRated(list: VendorQuote[]): VendorQuote | null {
  const rated = list.filter((q) => q.status !== "rejected");
  if (rated.length === 0) return null;
  return rated.reduce((a, b) => (b.rating > a.rating ? b : a));
}

export function rfqById(id: string | null): Rfq | undefined {
  return RFQS.find((r) => r.id === id);
}

// ── Hook ──
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useQuotes(): Record<string, VendorQuote> {
  return useSyncExternalStore(subscribe, () => quotes, () => quotes);
}
