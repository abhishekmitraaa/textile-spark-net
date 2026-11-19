import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * A new page opens at its top (2026-11-19, review M-02: switching Home tabs kept the scroll, so Trends opened
 * 2,500 px down). Only when the path changes by a link or a redirect: Back and Forward (POP) leave the browser's own
 * restore alone, and a page that changes only its ?query (filters kept in the address) stays where it is. A link to
 * an #anchor scrolls to the anchor instead.
 */
export function ScrollToTopOnNavigate() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    if (type === "POP" || hash) return;
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash, type]);
  return null;
}
