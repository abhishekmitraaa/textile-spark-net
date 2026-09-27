// Global UI language store (English / Hindi / Gujarati).
//
// One module-level store (useSyncExternalStore + localStorage) shared by the
// whole app, buyer and vendor. The translations are two catalogues keyed by the
// ENGLISH text, src/i18n/hi.json and src/i18n/gu.json, loaded on demand so an
// English session downloads neither. AutoTranslate applies them to everything
// rendered; `useT()` translates a string in code. A key may hold numbered
// placeholders ("Show {0} results") for text with a value in it.
//
// Every string the app renders from its own code must be in both catalogues:
// `npm run i18n:check` fails otherwise (2026-09-26). The catalogues used to
// cover 370 of ~6,300 strings, which is why the language switch looked
// "selective". What people type (chat, reviews, requirements) and vendors' own
// product and business names are left as entered.
//
// The chosen language is saved to the account and applied at sign-in:
// src/lib/languagePreference.ts. JSX-free.

import { useSyncExternalStore } from "react";

export type Lang = "en" | "hi" | "gu";

export const LANG_OPTIONS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

const SUPPORTED: Lang[] = ["en", "hi", "gu"];

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (SUPPORTED as string[]).includes(v);
}

/**
 * The ONLY languages any picker may offer. Every language selector in the app
 * must derive its list from here rather than hardcoding its own — the buyer
 * Login modal used to advertise 15 and the regional-settings select 4, while
 * only these three have catalogues, so picking Bengali/Tamil/etc. silently
 * did nothing and read as "translation is broken".
 */
export const LANGUAGE_NAMES: string[] = LANG_OPTIONS.map((l) => l.label);

// Map a human language name (from the Login modal) to a supported code.
// Anything unknown falls back to English so the app stays readable.
export function langCodeFromName(name: string): Lang {
  if (/gujarati|ગુજરાતી|ગુજરાતિ/i.test(name)) return "gu";
  if (/hindi|हिंदी|हिन्दी/i.test(name)) return "hi";
  return "en";
}

const KEY = "cosora.lang";

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (isLang(v)) return v;
  } catch { /* ssr / private mode */ }
  return "en";
}

let current: Lang = read();
// Bumped when a catalogue arrives, so what rendered in English re-translates.
let version = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function applyDocLang(l: Lang) {
  if (typeof document !== "undefined") document.documentElement.lang = l;
}
applyDocLang(current);

// ── Catalogues ──
type Template = { re: RegExp; out: string; literal: number };
type Catalog = {
  exact: Map<string, string>;
  byFirstChar: Map<string, Template[]>;
  leadingValue: Template[]; // templates that start with a placeholder
  cache: Map<string, string | null>;
};
type Translated = Exclude<Lang, "en">;

const LOADERS: Record<Translated, () => Promise<{ default: Record<string, string> }>> = {
  hi: () => import("@/i18n/hi.json"),
  gu: () => import("@/i18n/gu.json"),
};
const catalogs: Partial<Record<Translated, Catalog>> = {};
const pending: Partial<Record<Translated, Promise<void>>> = {};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Month names as en-IN and en-US print them; their translations are catalogue
// entries (src/i18n/external-strings.json, "dates").
const MONTHS = new Set([
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
]);
// "4 Jul 2026" / "4 July" | "Jul 4, 2026" / "Jul 4" | "Jan 2025"
const DATE_RE = /^\d{1,2} ([A-Z][a-z]{2,8}),?(?: \d{4})?$|^([A-Z][a-z]{2,8}) \d{1,2}(?:, \d{4})?$|^([A-Z][a-z]{2,8}) \d{4}$/;

function buildCatalog(dict: Record<string, string>): Catalog {
  const exact = new Map<string, string>();
  const byFirstChar = new Map<string, Template[]>();
  const leadingValue: Template[] = [];
  for (const [en, tr] of Object.entries(dict)) {
    if (!/\{\d\}/.test(en)) { exact.set(en, tr); continue; }
    const parts = en.split(/(\{\d\})/).filter(Boolean);
    // A placeholder may be empty: "{0} minute{1} ago" is also "1 minute ago".
    const re = new RegExp(`^${parts.map((p) => (/^\{\d\}$/.test(p) ? "(.*?)" : escapeRe(p))).join("")}$`);
    const t: Template = { re, out: tr, literal: parts.filter((p) => !/^\{\d\}$/.test(p)).join("").length };
    if (/^\{\d\}/.test(en)) leadingValue.push(t);
    else {
      const k = en[0];
      if (!byFirstChar.has(k)) byFirstChar.set(k, []);
      byFirstChar.get(k)!.push(t);
    }
  }
  // Most specific first, so "{0} saved to {1}" wins over "{0} saved".
  const bySpecificity = (a: Template, b: Template) => b.literal - a.literal;
  leadingValue.sort(bySpecificity);
  byFirstChar.forEach((list) => list.sort(bySpecificity));
  return { exact, byFirstChar, leadingValue, cache: new Map() };
}

/** Fetch a language's catalogue once. Resolves (never rejects) when it is ready or failed. */
export function loadCatalog(l: Lang): Promise<void> {
  if (l === "en" || catalogs[l]) return Promise.resolve();
  if (!pending[l]) {
    pending[l] = LOADERS[l]()
      .then((m) => {
        catalogs[l] = buildCatalog(m.default);
        version++;
        emit();
      })
      .catch(() => { delete pending[l]; }); // offline: stay in English, retry on the next switch
  }
  return pending[l]!;
}

export function getLang(): Lang {
  return current;
}

/** Switch this device's language. Saving it to the account: chooseLang() in languagePreference.ts. */
export function setLang(l: Lang) {
  if (!isLang(l)) l = "en";
  if (l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  applyDocLang(l);
  emit();
  void loadCatalog(l);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current, () => "en");
}

/** Changes when a catalogue finishes loading. */
export function useCatalogVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/**
 * The translation of `en`, or undefined when there is none (or the language is
 * English, or its catalogue hasn't arrived). Exact match first, then a date,
 * then the placeholder keys. A value caught by a placeholder is translated too,
 * one level deep: "MOQ: {0}" catches "100 pieces", which is "{0} pieces".
 */
export function lookup(lang: Lang, text: string): string | undefined {
  if (lang === "en") return undefined;
  const c = catalogs[lang];
  if (!c) return undefined;
  // Keys are stored with whitespace collapsed, as the coverage check reads them
  // (JSX line breaks, &nbsp;).
  const en = /\s\s|[^\S ]/.test(text) ? text.replace(/\s+/g, " ") : text;
  return lookupIn(c, en, 0);
}

function lookupIn(c: Catalog, en: string, depth: number): string | undefined {
  const hit = c.exact.get(en);
  if (hit !== undefined) return hit;
  const cached = c.cache.get(en);
  if (cached !== undefined) return cached ?? undefined;

  let out: string | null = null;
  // A formatted date ("4 Jul 2026", "4 July", "Jul 4, 2026", "Jan 2025"): the
  // numbers stay, the month name is translated. Only month names match.
  const date = DATE_RE.exec(en);
  if (date) {
    const month = date[1] ?? date[2] ?? date[3];
    const tr = MONTHS.has(month) ? c.exact.get(month) : undefined;
    if (tr) out = en.replace(month, tr);
  }
  for (const list of out === null ? [c.byFirstChar.get(en[0]), c.leadingValue] : []) {
    if (!list) continue;
    for (const t of list) {
      const m = t.re.exec(en);
      if (!m) continue;
      out = t.out.replace(/\{(\d)\}/g, (_, i: string) => {
        const v = m[Number(i) + 1] ?? "";
        const k = v.trim();
        if (!k) return v;
        // "any {0}s" catches "vendor"; the catalogue holds "Vendor".
        return c.exact.get(k) ?? c.exact.get(k.charAt(0).toUpperCase() + k.slice(1))
          ?? (depth === 0 ? lookupIn(c, k, 1) : undefined) ?? v;
      });
      break;
    }
    if (out !== null) break;
  }
  if (c.cache.size > 5000) c.cache.clear();
  c.cache.set(en, out);
  return out ?? undefined;
}

export function translate(lang: Lang, en: string): string {
  return lookup(lang, en) ?? en;
}

// Hook: a translate function bound to the current language. It re-renders the
// component when the language changes and when the catalogue arrives.
export function useT(): (en: string) => string {
  const lang = useLang();
  useCatalogVersion();
  return (en: string) => translate(lang, en);
}
