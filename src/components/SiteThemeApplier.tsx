import { useEffect } from "react";
import { googleFontUrl, themeVariables, THEME_CACHE_KEY, useSiteConfig } from "@/lib/siteConfig";

/**
 * Puts the site theme saved in Cosora-Admin on the page (admin completion Phase 9).
 *
 * Sets the --brand-* colour channels and the two font stacks on <html>, loads a font
 * index.html doesn't already, and remembers the result so the boot script in index.html
 * can apply it before the first paint on the next visit. With the default theme every
 * value equals index.css's, so the page renders exactly as before.
 */
export default function SiteThemeApplier() {
  const { data } = useSiteConfig();
  const theme = data?.theme;

  useEffect(() => {
    if (!theme) return;
    const vars = themeVariables(theme);
    const root = document.documentElement;
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

    const fonts = [googleFontUrl(theme.heading_font), googleFontUrl(theme.body_font)].filter(
      (u, i, all): u is string => u !== null && all.indexOf(u) === i,
    );
    for (const href of fonts) {
      if (document.querySelector(`link[data-cosora-font="${CSS.escape(href)}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-cosora-font", href);
      document.head.appendChild(link);
    }

    try {
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ vars, fonts }));
    } catch {
      // Private mode or storage disabled: the next visit waits for the fetch instead.
    }
  }, [theme]);

  return null;
}
