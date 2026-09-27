import { useEffect } from "react";
import { useLang, useCatalogVersion, lookup, type Lang } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────
// Global DOM auto-translator.
//
// `useT()` only translates strings a component explicitly wraps. To make the
// language switch apply EVERYWHERE without touching every component, this walks
// the rendered DOM and translates any text node, and the placeholder, title,
// aria-label and alt attributes, whose English text is in the catalogue
// (src/i18n/*.json, exact or placeholder keys). It:
//   • re-applies on language change, when the catalogue arrives, and on
//     route/content changes (MutationObserver)
//   • remembers each node's original English so it can restore on switch back
//   • leaves strings with no catalogue entry as they are
//   • is idempotent, so React re-renders that reset text get re-translated
//
// Anything inside [data-no-translate] is left alone: what people type (chat,
// reviews, requirements) and language names in the pickers. Mark user content
// that way, or a message that happens to read "Yes" is shown as "हाँ".
// ─────────────────────────────────────────────────────────────

// Per node: the original English source, and the exact string we last wrote.
// LAST_SET lets us tell "this is still our translation (of some language)" from
// "React re-rendered fresh English here", so direct hi↔gu switches translate
// from the stored English rather than from the other language's text.
const ORIG_TEXT = new WeakMap<Text, string>();
const LAST_SET_TEXT = new WeakMap<Text, string>();
const ORIG_ATTR = new WeakMap<Element, Map<string, string>>();
const LAST_SET_ATTR = new WeakMap<Element, Map<string, string>>();

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const ATTR_SELECTOR = ATTRS.map((a) => `[${a}]`).join(",");
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function skip(el: Element | null): boolean {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  return !!el.closest("[data-no-translate], [contenteditable='true']");
}

// Attributes: a <textarea>'s content is what someone typed, but its placeholder
// is ours, so only data-no-translate opts an element's attributes out.
function skipAttrs(el: Element): boolean {
  return !!el.closest("[data-no-translate]");
}

function splitWs(raw: string): [string, string, string] {
  const lead = raw.slice(0, raw.length - raw.trimStart().length);
  const trail = raw.slice(raw.trimEnd().length);
  return [lead, raw.trim(), trail];
}

function applyText(node: Text, lang: Lang) {
  const raw = node.nodeValue ?? "";
  const [lead, trimmed, trail] = splitWs(raw);
  if (!trimmed) return;

  // English source: if the current text is exactly what we last wrote, it's
  // still our (possibly other-language) translation → use the stored English.
  // Otherwise React rendered fresh content → treat it as the new English.
  const tracked = ORIG_TEXT.get(node);
  const en = tracked !== undefined && raw === LAST_SET_TEXT.get(node) ? tracked : trimmed;
  ORIG_TEXT.set(node, en);

  const tr = lang === "en" ? en : (lookup(lang, en) ?? en);
  const next = lead + tr + trail;
  if (node.nodeValue !== next) node.nodeValue = next;
  LAST_SET_TEXT.set(node, next);
}

function applyAttr(el: Element, name: string, lang: Lang) {
  const cur = el.getAttribute(name);
  if (cur == null) return;
  const trimmed = cur.trim();
  if (!trimmed) return;

  if (!ORIG_ATTR.has(el)) { ORIG_ATTR.set(el, new Map()); LAST_SET_ATTR.set(el, new Map()); }
  const orig = ORIG_ATTR.get(el)!;
  const last = LAST_SET_ATTR.get(el)!;
  const tracked = orig.get(name);
  const en = tracked !== undefined && cur === last.get(name) ? tracked : trimmed;
  orig.set(name, en);

  const tr = lang === "en" ? en : (lookup(lang, en) ?? en);
  if (cur !== tr) el.setAttribute(name, tr);
  last.set(name, tr);
}

function applyAttrs(el: Element, lang: Lang) {
  for (const a of ATTRS) if (el.hasAttribute(a)) applyAttr(el, a, lang);
}

function walk(root: Node, lang: Lang) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (skip((n as Text).parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts: Text[] = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) texts.push(n as Text);
  for (const t of texts) applyText(t, lang);

  if (root.nodeType === Node.ELEMENT_NODE && !skipAttrs(root as Element)) applyAttrs(root as Element, lang);
  (root as Element).querySelectorAll?.(ATTR_SELECTOR).forEach((el) => { if (!skipAttrs(el)) applyAttrs(el, lang); });
}

export default function AutoTranslate() {
  const lang = useLang();
  const catalogVersion = useCatalogVersion();

  useEffect(() => {
    let raf = 0;
    const queue = new Set<Node>();

    const flush = () => {
      raf = 0;
      const roots = [...queue];
      queue.clear();
      for (const r of roots) {
        if (!r.isConnected) continue;
        if (r.nodeType === Node.TEXT_NODE) { if (!skip((r as Text).parentElement)) applyText(r as Text, lang); }
        else walk(r, lang);
      }
    };
    const schedule = (n: Node) => {
      queue.add(n);
      if (!raf) raf = requestAnimationFrame(flush);
    };

    // Full pass: on a language change, and again when its catalogue arrives.
    walk(document.body, lang);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") {
          schedule(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((nd) => {
            if (nd.nodeType === Node.TEXT_NODE || nd.nodeType === Node.ELEMENT_NODE) schedule(nd);
          });
        } else if (m.type === "attributes" && m.attributeName) {
          const el = m.target as Element;
          if (!skipAttrs(el)) applyAttr(el, m.attributeName, lang);
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });

    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lang, catalogVersion]);

  return null;
}
