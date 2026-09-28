/**
 * Microsoft Clarity on the buyer site (admin completion Phase 8; Mitra, 2026-09-27:
 * "native dashboard + install Clarity").
 *
 * Loads only in a production build, and only when VITE_CLARITY_PROJECT_ID is set to
 * a well-formed id. The dev server, a preview deploy without the variable and every
 * test run record nothing. The id is not a secret: it is in the tag URL every visitor
 * downloads.
 *
 * Privacy, by construction:
 *   - Nobody is identified. There is no clarity("identify") and no custom tag with a
 *     name, phone number, email or account id.
 *   - Sensitive screens are masked in the browser, so their content never reaches
 *     Clarity: <ClarityMask> wraps the sign-in, chat, onboarding, KYC, profile,
 *     requirement, quote, lead and billing routes in App.tsx, and every dialog,
 *     drawer, sheet and alert dialog carries data-clarity-mask. An overlay renders in
 *     a portal outside its page, so the page's mask doesn't reach it.
 *   - Clarity itself masks every input box in every mode.
 * Also set the Clarity project's masking mode to Strict (a project setting).
 *
 * The tag is added after the window's load event, so it never competes with the
 * first paint on a slow mobile connection. The Terms page tells visitors
 * (CLARITY_ENABLED gates that paragraph, so it's never shown when nothing records).
 */

const PROJECT_ID = ((import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined) ?? "").trim();

/** Clarity project ids are short alphanumerics. Anything else is a misconfiguration. */
const VALID_ID = /^[a-z0-9]{6,32}$/i;

export const CLARITY_ENABLED = import.meta.env.PROD && VALID_ID.test(PROJECT_ID);

type ClarityQueue = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    clarity?: ClarityQueue;
  }
}

function inject(): void {
  if (document.querySelector('script[data-cosora-clarity]')) return;
  // Microsoft's snippet, unrolled: a queue that records calls made before the tag
  // arrives, then the tag itself.
  if (!window.clarity) {
    const queue: ClarityQueue = (...args: unknown[]) => {
      (queue.q = queue.q ?? []).push(args);
    };
    window.clarity = queue;
  }
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.clarity.ms/tag/${encodeURIComponent(PROJECT_ID)}`;
  tag.setAttribute("data-cosora-clarity", "");
  document.head.appendChild(tag);
}

/** Called once from main.tsx. A no-op unless CLARITY_ENABLED. */
export function startClarity(): void {
  if (!CLARITY_ENABLED || typeof window === "undefined") return;
  if (document.readyState === "complete") inject();
  else window.addEventListener("load", inject, { once: true });
}
