import { Link } from "react-router-dom";

// ─────────────────────────────────────────────────────────────
// The text under a product card's picture opens the product too (2026-10-14,
// Mitra: "clicking the text below the product picture doesn't open the product").
//
// A stretched click target, not a second link for assistive technology: the
// picture's <Link> stays the card's one named, focusable link, so this layer is
// aria-hidden and out of the tab order. Put it inside the text block, give that
// block `relative`, and give everything in it that does something else (the
// seller's name, Call Now, Chat, a checkbox) `relative z-10` so it sits above.
// ─────────────────────────────────────────────────────────────

export default function CardLinkOverlay({ to, onClick }: { to: string; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-hidden="true"
      tabIndex={-1}
      data-card-link=""
      className="absolute inset-0 z-0"
    />
  );
}

/** For the controls a card's text block holds: above the CardLinkOverlay. */
export const ABOVE_CARD_LINK = "relative z-10";
