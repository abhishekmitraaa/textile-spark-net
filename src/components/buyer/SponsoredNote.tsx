import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// The "Sponsored" disclosure that closes every paid placement.
//
// One component rather than a repeated span, so the wording, size and colour
// cannot drift between the six surfaces that carry paid inventory. A buyer
// should recognise the same mark in the same corner on every page.
//
// ON THE COLOUR. The brief asked for grey, and this is grey — but
// `text-gray-500` (#6b7280), not the `text-gray-400`/`text-gray-300` used for
// decorative micro-labels elsewhere in the buyer app. On white, gray-400 is
// about 2.9:1 contrast, which fails WCAG AA (4.5:1) and is genuinely hard to
// read on a phone in daylight. gray-500 is 4.8:1 and passes, while still
// reading as quiet grey next to the content. An ad disclosure that cannot be
// read is not a disclosure, so this is the one micro-label that does not get
// to be the faintest thing on the page.
//
// QUIETER SINCE 2026-10-17 (Mitra: "sponsored has to be more subtle and the ad writing too"): regular weight,
// no pills, no icons, no "Sponsored" in headings. Still always there and still gray-500: an ad has to stay
// recognisable as one (ASCI), it just doesn't have to shout.
//
// It does NOT replace the per-card "Ad" mark (AdMark below). The chip says "this card is
// paid"; this says "this whole section is paid". Sections that mix paid and
// organic content (the Following brand carousel) must NOT use this — see the
// note in NewBrandsCarousel.
// ─────────────────────────────────────────────────────────────
export default function SponsoredNote({ className }: { className?: string }) {
  return (
    <p className={cn("mt-1.5 text-right text-[10px] text-gray-500", className)}>
      Sponsored
    </p>
  );
}

/** The per-card mark: the word "Ad" in the card's own small grey text, not a badge. */
export function AdMark({ className }: { className?: string }) {
  return <span className={cn("shrink-0 text-[10px] font-normal text-gray-500", className)}>Ad</span>;
}
