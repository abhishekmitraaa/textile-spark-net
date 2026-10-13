/**
 * The chat composer stays above the on-screen keyboard (2026-10-13). On a phone the
 * keyboard covers the bottom of the page without resizing it, and the thread is exactly
 * one screen tall with the message box at its foot, so the box sat under the keyboard.
 * Its 14px text also made iOS zoom the page on focus. Local stack only.
 *
 * No browser here shows a real keyboard, so the spec stands in for one the way the
 * browser reports it: a smaller window.visualViewport and a resize event.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount } from "./stack";

const SCREEN = { width: 390, height: 800 };
const KEYBOARD = 320;

test("the message box rises above the keyboard and doesn't make iOS zoom", async ({ browser }) => {
  const seller = await freshAccount("chatkb-seller", { seller: true });
  const buyer = await freshAccount("chatkb-buyer");
  const ctx = await contextWithSession(browser, buyer.session, SCREEN, true);
  await ctx.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: window.innerHeight, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BUYER_URL}/chats/${seller.id}`);
    const box = page.getByPlaceholder("Message");
    await expect(box).toBeVisible({ timeout: 30_000 });

    // iOS zooms the page when a focused field's text is under 16px.
    expect(await box.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

    const bottom = () => box.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(await bottom()).toBeGreaterThan(SCREEN.height - KEYBOARD);

    // The keyboard opens: the visible part of the page loses its height.
    await page.evaluate((kb) => {
      const vv = window.visualViewport as unknown as EventTarget & { height: number };
      vv.height = window.innerHeight - kb;
      vv.dispatchEvent(new Event("resize"));
    }, KEYBOARD);
    await expect.poll(bottom).toBeLessThanOrEqual(SCREEN.height - KEYBOARD);

    // And closes again.
    await page.evaluate(() => {
      const vv = window.visualViewport as unknown as EventTarget & { height: number };
      vv.height = window.innerHeight;
      vv.dispatchEvent(new Event("resize"));
    });
    await expect.poll(bottom).toBeGreaterThan(SCREEN.height - KEYBOARD);
  } finally {
    await ctx.close();
  }
});
