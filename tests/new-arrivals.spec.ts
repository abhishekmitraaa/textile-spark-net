import { test, expect } from '@playwright/test';

test('New Arrivals shows buyer tabs and correct selection', async ({ page }) => {
  // Try default preview port 8080, fall back to 8081 if occupied
  const urls = [
    'http://localhost:8080/home/new-arrivals',
    'http://localhost:8081/home/new-arrivals',
    'http://localhost:8082/home/new-arrivals',
    'http://localhost:8083/home/new-arrivals',
    'http://localhost:8084/home/new-arrivals',
    'http://localhost:8085/home/new-arrivals',
  ];

  let resp = null;
  for (const url of urls) {
    try {
      resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
      if (resp) break;
    } catch (e) {
      // ignore and try next
    }
  }
  if (!resp) throw new Error('Could not reach preview server on ports 8080 or 8081');

  // wait for role=tab elements to appear
  await page.waitForSelector('[role="tab"]');

  const tabs = await page.$$eval('[role="tab"]', (els) =>
    els.map((el) => ({
      text: (el.textContent || '').trim(),
      href: (el as HTMLAnchorElement).getAttribute('href'),
      ariaSelected: el.getAttribute('aria-selected'),
      ariaCurrent: el.getAttribute('aria-current'),
    }))
  );

  // Basic expectations
  expect(tabs.length).toBeGreaterThanOrEqual(5);

  const newArrivals = tabs.find((t) => t.text === 'New Arrivals');
  expect(newArrivals).toBeTruthy();
  expect(newArrivals?.ariaSelected).toBe('true');
  expect(newArrivals?.href).toBe('/home/new-arrivals');
});
