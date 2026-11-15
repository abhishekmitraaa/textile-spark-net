import { useEffect, useRef } from "react";

/**
 * `/leads?rfq=<id>` (SH-019): once the requirement is in the list, scroll its card (`id="lead-<id>"`) into view and
 * open its quote form, unless this seller already quoted. Once per id, so closing the form keeps it closed.
 */
export function useFocusLead(
  focusId: string | null | undefined,
  rows: { id: string; alreadyQuoted: boolean }[],
  openQuote: (id: string) => void,
) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || done.current === focusId) return;
    const row = rows.find((r) => r.id === focusId);
    if (!row) return;
    done.current = focusId;
    if (!row.alreadyQuoted) openQuote(focusId);
    // After the form has rendered, so the card is measured at its open height.
    requestAnimationFrame(() =>
      document.getElementById(`lead-${focusId}`)?.scrollIntoView({ block: "center" }),
    );
  }, [focusId, rows, openQuote]);
}
