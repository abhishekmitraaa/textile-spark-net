import { test, expect } from '@playwright/test';

/**
 * The buyer home tab strip.
 *
 * This spec used to time out waiting for `[role="tab"]`, and the page was the
 * thing that was wrong — not the selector. It was written against
 * `src/components/buyer/BuyerHomeTabs.tsx`, which has the right roles and
 * labels and which NOTHING IMPORTS. The strip that actually renders lives
 * inline in NewArrivals.tsx and was five plain links: no tablist, no
 * aria-selected, and an active state hardcoded to /home/new-arrivals rather
 * than derived from the route. The roles are now real, so the original intent
 * of this spec — "the tabs exist and the current one is marked selected" —
 * is testable again.
 *
 * Labels are asserted case-insensitively: the live strip renders them
 * uppercase and prefixes the active one with a ✦, and neither is what this
 * test is about.
 */
test('New Arrivals shows buyer tabs and marks the current one selected', async ({ page }) => {
  const urls = [
    'http://localhost:8080/home/new-arrivals',
    'http://localhost:8081/home/new-arrivals',
    'http://localhost:8082/home/new-arrivals',
  ];

  let reached = false;
  for (const url of urls) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
      if (resp) { reached = true; break; }
    } catch {
      // try the next port
    }
  }
  if (!reached) throw new Error('Could not reach the dev server on 8080-8082');

  await page.waitForSelector('[role="tab"]');

  const tabs = await page.$$eval('[role="tab"]', (els) =>
    els.map((el) => ({
      text: (el.textContent || '').replace(/[✦\s]+/g, ' ').trim().toLowerCase(),
      href: el.getAttribute('href'),
      ariaSelected: el.getAttribute('aria-selected'),
      ariaCurrent: el.getAttribute('aria-current'),
    })),
  );

  expect(tabs.length).toBeGreaterThanOrEqual(5);
  await expect(page.locator('[role="tablist"]')).toHaveCount(1);

  const newArrivals = tabs.find((t) => t.text === 'new arrivals');
  expect(newArrivals, 'a "New Arrivals" tab exists').toBeTruthy();
  expect(newArrivals?.href).toBe('/home/new-arrivals');
  expect(newArrivals?.ariaSelected, 'the current route is the selected tab').toBe('true');
  expect(newArrivals?.ariaCurrent).toBe('page');

  // Exactly one selected tab — the old hardcoded active state could not have
  // got this wrong on this page, but it could on any other route reusing it.
  expect(tabs.filter((t) => t.ariaSelected === 'true')).toHaveLength(1);
});
