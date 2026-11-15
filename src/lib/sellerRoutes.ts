/**
 * Which side an address belongs to (SH-004). The address decides the frame: a seller page always shows the seller
 * menu and a buyer page the buyer menu, so Back and Forward after a Buyer/Seller switch land on a whole page, never
 * a seller page inside the buyer's menu.
 *
 * "shared" pages pick their frame from the side the person is on (Help, notifications, chats, Cosora Studio, legal
 * pages), so arriving on one never changes the side. "seller" pages are the ones rendered inside DashboardLayout;
 * every other page is the buyer's. A new seller page adds its path to SELLER_PATHS; a new page that shows either
 * frame by side adds it to SHARED_PATHS.
 */
export type RouteSide = "seller" | "buyer" | "shared";

const SHARED_PATHS = [
  "/help",
  "/feedback",
  "/report-fraud",
  "/cosora-studio",
  "/notifications",
  "/chat",
  "/chats",
  "/terms",
  "/privacy",
  "/grievance",
];

const SELLER_PATHS = [
  "/seller-home",
  "/products",
  "/upload",
  "/upload-video",
  "/upload-catalogue",
  "/leads",
  "/lead-alerts",
  "/overseas-leads",
  "/quotes",
  "/advertisements",
  "/old-advertisements",
  "/competitor-ads",
  "/settings",
  "/subscription",
  "/my-payments",
  "/my-store",
  "/business-profile",
  "/business-profile-score",
  "/add-social-links",
  "/analytics",
  "/reviews",
  "/kyc",
  "/crm",
  "/account-manager",
  "/visibility",
  "/seller/blogs",
];

/** True when `pathname` is `base` or a page under it ("/crm" covers "/crm/follow-ups", not "/crmx"). */
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function routeSide(pathname: string): RouteSide {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (SHARED_PATHS.some((p) => under(path, p))) return "shared";
  if (SELLER_PATHS.some((p) => under(path, p))) return "seller";
  return "buyer";
}
