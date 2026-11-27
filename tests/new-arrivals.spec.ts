import { test, expect } from "@playwright/test";

/**
 * The buyer Home tab strip (`src/components/buyer/HomeTabs.tsx`, one strip on every Home page since review L-02).
 *
 * It is a `<nav aria-label="Home">` of links, not a tablist: each tab is a page, the open one carries
 * `aria-current="page"` and a "✦" (2026-11-25: a swipeable row on phones). Rewritten 2026-11-27 when CI ran this
 * spec again: the earlier version waited for `[role="tab"]` and probed ports 8080–8082 itself.
 *
 * Labels are compared case-insensitively and without the ✦: neither is what this test is about.
 */
test("New Arrivals shows the Home tabs and marks the current one", async ({ page }) => {
  await page.goto("/home/new-arrivals", { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("navigation", { name: "Home" });
  await expect(nav).toBeVisible();

  const tabs = await nav.getByRole("link").evaluateAll((els) =>
    els.map((el) => ({
      text: (el.textContent || "").replace(/[✦\s]+/g, " ").trim().toLowerCase(),
      href: el.getAttribute("href"),
      current: el.getAttribute("aria-current"),
    })),
  );

  expect(tabs.length).toBeGreaterThanOrEqual(5);
  const newArrivals = tabs.find((t) => t.text === "new arrivals");
  expect(newArrivals, 'a "New Arrivals" tab exists').toBeTruthy();
  expect(newArrivals?.href).toBe("/home/new-arrivals");
  expect(newArrivals?.current, "the current route is the marked tab").toBe("page");
  // Exactly one marked tab.
  expect(tabs.filter((t) => t.current === "page")).toHaveLength(1);
});
