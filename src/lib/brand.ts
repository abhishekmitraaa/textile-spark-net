/**
 * The five brand colours as CSS colour strings that follow the site theme (admin
 * completion Phase 9). The channels live in index.css (--brand-*) and are replaced by
 * the theme saved in Cosora-Admin (SiteThemeApplier).
 *
 * Tailwind classes use the `brand-*` colours (`bg-brand-buyer/10`); this is for inline
 * styles. `alpha255` is the old two-digit hex alpha (`${CORAL}1a` becomes
 * `brand("buyer", 0x1a)`), so the rendered colour is exactly what it was.
 *
 * Not for a <canvas> or anything else that doesn't resolve CSS variables.
 */
export type BrandToken = "vendor" | "buyer" | "success" | "border" | "ink";

export function brand(token: BrandToken, alpha255?: number): string {
  return alpha255 === undefined
    ? `rgb(var(--brand-${token}))`
    : `rgb(var(--brand-${token}) / ${alpha255 / 255})`;
}
