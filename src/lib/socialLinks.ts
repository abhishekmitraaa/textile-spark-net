// A seller's social links (vendor_profiles.social: platform -> list of URLs). Seller Home audit SH-044, 2026-11-17
// (Mitra: "Show on the store"): the links earn profile-score points, so buyers see them on the store, and each box
// takes only its own platform's addresses (an Instagram link was stored under Facebook). Pure, so
// scripts/social-links-check.mjs can run it.

export type SocialKey = "facebook" | "x" | "linkedin" | "youtube" | "instagram" | "other";

export const SOCIAL_PLATFORMS: { key: SocialKey; label: string; hosts: string[] | null; handleBase?: string }[] = [
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"], handleBase: "https://x.com/" },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], handleBase: "https://instagram.com/" },
  // Any website, but not one of the platforms above (it belongs in its own box).
  { key: "other", label: "Website", hosts: null },
];

/** At most this many links per platform. */
export const SOCIAL_MAX_PER_PLATFORM = 3;

const hostMatches = (host: string, allowed: string[]) =>
  allowed.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * One link as stored (an https:// URL), or null when it doesn't belong in that platform's box. A bare
 * "facebook.com/x" gets https://; "@handle" works for X and Instagram.
 */
export function normaliseSocialLink(key: string, raw: string): string | null {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  if (!platform) return null;
  let v = (raw ?? "").trim();
  if (!v) return null;
  if (platform.handleBase && /^@?[A-Za-z0-9_.]{1,30}$/.test(v) && !v.includes("..") && (v.startsWith("@") || !v.includes("."))) {
    v = platform.handleBase + v.replace(/^@/, "");
  }
  v = v.replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(v)) v = `https://${v}`;
  let url: URL;
  try { url = new URL(v); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || v.length > 300) return null;
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const others = SOCIAL_PLATFORMS.filter((p) => p.hosts).flatMap((p) => p.hosts as string[]);
  if (platform.hosts ? !hostMatches(host, platform.hosts) : hostMatches(host, others)) return null;
  // A platform's own address with no account in it ("https://instagram.com/") isn't a link to the seller.
  if (platform.hosts && (url.pathname === "/" || url.pathname === "")) return null;
  return url.toString();
}

/** What a buyer sees: each platform's links that pass the rules above, in platform order. */
export function socialLinksForDisplay(social: unknown): { key: SocialKey; label: string; url: string }[] {
  if (!social || typeof social !== "object" || Array.isArray(social)) return [];
  const out: { key: SocialKey; label: string; url: string }[] = [];
  for (const p of SOCIAL_PLATFORMS) {
    const list = (social as Record<string, unknown>)[p.key];
    if (!Array.isArray(list)) continue;
    for (const raw of list.slice(0, SOCIAL_MAX_PER_PLATFORM)) {
      const url = typeof raw === "string" ? normaliseSocialLink(p.key, raw) : null;
      if (url) out.push({ key: p.key, label: p.label, url });
    }
  }
  return out;
}
