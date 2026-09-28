import type { ReactNode } from "react";

/**
 * Hides everything inside it from Microsoft Clarity's recordings and heatmaps
 * (src/lib/analytics/clarity.ts). Masking happens in the browser, so the content
 * is never uploaded.
 *
 * `display: contents`: the wrapper adds no box, so the page lays out exactly as
 * before. It wraps a route's element in App.tsx, so the attribute exists from the
 * moment the page's content does. Toggling it on <body> after Clarity has already
 * seen the page is not something its docs promise to honour.
 */
export default function ClarityMask({ children }: { children: ReactNode }) {
  return (
    <div data-clarity-mask="True" className="contents">
      {children}
    </div>
  );
}
