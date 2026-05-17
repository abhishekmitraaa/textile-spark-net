const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE>', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR>', err.stack || err.toString()));
  page.on('requestfailed', req => console.log('REQ_FAIL>', req.url(), req.failure()?.errorText));
  try {
    const resp = await page.goto('http://localhost:8083/home/new-arrivals', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('STATUS', resp && resp.status());
    const html = await page.content();
    console.log('HTML_LEN', html.length);
    // check for role=tab
    const hasTabs = await page.$$eval('[role="tab"]', els => els.length);
    console.log('TABS_COUNT', hasTabs);
  } catch (e) {
    console.error('ERROR', e.toString());
  }
  await browser.close();
})();
