# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\new-arrivals.spec.ts >> New Arrivals shows buyer tabs and correct selection
- Location: tests\new-arrivals.spec.ts:3:1

# Error details

```
Error: Could not reach preview server on ports 8080 or 8081
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('New Arrivals shows buyer tabs and correct selection', async ({ page }) => {
  4  |   // Try default preview port 8080, fall back to 8081 if occupied
  5  |   const urls = [
  6  |     'http://localhost:8080/home/new-arrivals',
  7  |     'http://localhost:8081/home/new-arrivals',
  8  |     'http://localhost:8082/home/new-arrivals',
  9  |     'http://localhost:8083/home/new-arrivals',
  10 |     'http://localhost:8084/home/new-arrivals',
  11 |     'http://localhost:8085/home/new-arrivals',
  12 |   ];
  13 | 
  14 |   let resp = null;
  15 |   for (const url of urls) {
  16 |     try {
  17 |       resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
  18 |       if (resp) break;
  19 |     } catch (e) {
  20 |       // ignore and try next
  21 |     }
  22 |   }
> 23 |   if (!resp) throw new Error('Could not reach preview server on ports 8080 or 8081');
     |                    ^ Error: Could not reach preview server on ports 8080 or 8081
  24 | 
  25 |   // wait for role=tab elements to appear
  26 |   await page.waitForSelector('[role="tab"]');
  27 | 
  28 |   const tabs = await page.$$eval('[role="tab"]', (els) =>
  29 |     els.map((el) => ({
  30 |       text: (el.textContent || '').trim(),
  31 |       href: (el as HTMLAnchorElement).getAttribute('href'),
  32 |       ariaSelected: el.getAttribute('aria-selected'),
  33 |       ariaCurrent: el.getAttribute('aria-current'),
  34 |     }))
  35 |   );
  36 | 
  37 |   // Basic expectations
  38 |   expect(tabs.length).toBeGreaterThanOrEqual(5);
  39 | 
  40 |   const newArrivals = tabs.find((t) => t.text === 'New Arrivals');
  41 |   expect(newArrivals).toBeTruthy();
  42 |   expect(newArrivals?.ariaSelected).toBe('true');
  43 |   expect(newArrivals?.href).toBe('/home/new-arrivals');
  44 | });
  45 | 
```