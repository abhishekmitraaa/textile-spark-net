import { useEffect } from "react";
import { useLang, lookup, type Lang } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────
// Global DOM auto-translator.
//
// The dictionary approach (`useT`) only translates strings a component
// explicitly wraps. To make the language switch apply EVERYWHERE without
// touching every component, this walks the rendered DOM and translates any
// text node / placeholder whose English text is in the dictionary. It:
//   • re-applies on language change and on route/content changes (MutationObserver)
//   • remembers each node's original English so it can restore on switch back
//   • leaves untranslated (dictionary-missing) strings as English
//   • is idempotent, so React re-renders that reset text get re-translated
//
// Dynamic data (product names, user/chat text) simply won't match a dictionary
// entry and is left untouched — matching the agreed "chrome only" scope, just
// applied globally instead of per-component.
// ─────────────────────────────────────────────────────────────

// Per node: the original English source, and the exact string we last wrote.
// LAST_SET lets us tell "this is still our translation (of some language)" from
// "React re-rendered fresh English here", so direct hi↔gu switches translate
// from the stored English rather than from the other language's text.
const ORIG_TEXT = new WeakMap<Text, string>();
const LAST_SET_TEXT = new WeakMap<Text, string>();
const ORIG_ATTR = new WeakMap<Element, string>();
const LAST_SET_ATTR = new WeakMap<Element, string>();

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function skip(el: Element | null): boolean {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
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

function applyPlaceholder(el: Element, lang: Lang) {
  const cur = el.getAttribute("placeholder");
  if (cur == null) return;
  const trimmed = cur.trim();
  if (!trimmed) return;

  const tracked = ORIG_ATTR.get(el);
  const en = tracked !== undefined && cur === LAST_SET_ATTR.get(el) ? tracked : trimmed;
  ORIG_ATTR.set(el, en);

  const tr = lang === "en" ? en : (lookup(lang, en) ?? en);
  if (cur !== tr) el.setAttribute("placeholder", tr);
  LAST_SET_ATTR.set(el, tr);
}

function walk(root: Node, lang: Lang) {
  // Text nodes
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (skip((n as Text).parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts: Text[] = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) texts.push(n as Text);
  for (const t of texts) applyText(t, lang);

  // Placeholders
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (el.hasAttribute?.("placeholder") && !skip(el)) applyPlaceholder(el, lang);
  }
  const withPh = (root as Element).querySelectorAll?.("[placeholder]");
  withPh?.forEach((el) => { if (!skip(el)) applyPlaceholder(el, lang); });
}

export default function AutoTranslate() {
  const lang = useLang();

  useEffect(() => {
    let raf = 0;
    const queue = new Set<Node>();

    const flush = () => {
      raf = 0;
      const roots = [...queue];
      queue.clear();
      for (const r of roots) {
        if (r.nodeType === Node.TEXT_NODE) applyText(r as Text, lang);
        else walk(r, lang);
      }
    };
    const schedule = (n: Node) => {
      queue.add(n);
      if (!raf) raf = requestAnimationFrame(flush);
    };

    // Initial full pass.
    walk(document.body, lang);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") {
          if (!skip((m.target as Text).parentElement)) schedule(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((nd) => {
            if (nd.nodeType === Node.TEXT_NODE || nd.nodeType === Node.ELEMENT_NODE) schedule(nd);
          });
        } else if (m.type === "attributes" && m.attributeName === "placeholder") {
          const el = m.target as Element;
          if (!skip(el)) applyPlaceholder(el, lang);
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder"],
    });

    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lang]);

  return null;
}
