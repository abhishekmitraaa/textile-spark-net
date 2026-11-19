import { routeSide } from "@/lib/sellerRoutes";

// ─────────────────────────────────────────────────────────────
// Back to the page after signing in (Mitra, 2026-11-19, review M-59: "Return to the page").
//
// When a link, a prompt or the sign-up gate takes someone from a page into sign-in or sign-up, the page is remembered
// (this tab only, for 2 hours). When the flow ends where a buyer would land (New Arrivals), it lands on that page
// instead. Sign-in itself is unchanged: mobile + OTP, the same screens. A seller still lands on Seller Home (claude.md:
// "a vendor-first user lands on the vendor dashboard"), and seller pages, the landing pages and the sign-in pages are
// never remembered.
// ─────────────────────────────────────────────────────────────

const KEY = "cosora.returnTo";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const BUYER_LANDING = "/home/new-arrivals";

export function isAuthPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register" || pathname.startsWith("/auth/");
}

/** A page worth coming back to: a path on this site, not a sign-in page, a landing page or a seller page. */
function worthReturning(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const pathname = path.split(/[?#]/)[0];
  if (isAuthPath(pathname) || pathname === "/" || pathname === "/seller" || pathname === "/onboarding") return false;
  return routeSide(pathname) !== "seller";
}

export function rememberReturnTo(path: string): void {
  if (!worthReturning(path)) return;
  try { sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* private mode */ }
}

/** Where a buyer's sign-in or sign-up should land: the remembered page (taken once), else `dest`. */
export function landingFor(dest: string): string {
  if (dest !== BUYER_LANDING) return dest;
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return dest;
    const v = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof v.path !== "string" || typeof v.at !== "number" || Date.now() - v.at > MAX_AGE_MS) return dest;
    return worthReturning(v.path) ? v.path : dest;
  } catch {
    return dest;
  }
}
