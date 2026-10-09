/**
 * Subscriptions P13 (2026-10-09): the truth pass, locally.
 *   * The plans page's comparison says what each plan gives as built: Silver's shared account
 *     team, overseas requirements on Gold and VIP, the VIP seal by its name; nothing "dedicated"
 *     on Silver and no "100%" seal.
 *   * The rewritten FAQ answer about autopay reads in English and, from its stored translation,
 *     in Hindi.
 * The copy is checked against every plan's limits by scripts/subscriptions/p13_truth_pass.sql.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, watchErrors } from "./stack";

test("the comparison says what each plan gives, and the autopay FAQ is true", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await freshAccount("p13-reader", { seller: true });
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/subscription`);
  await page.getByRole("button", { name: /View all \d+ features/ }).click();
  for (const text of ["Overseas requirements", "Account manager", "Shared account team", "Yes, 24-hour first look", "VIP trusted seller"]) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/dedicated/i)).toHaveCount(0);
  await expect(page.getByText(/100% trusted/i)).toHaveCount(0);

  await page.getByRole("button", { name: "How does billing work — is there autopay?" }).click();
  await expect(page.getByText(/^Autopay is optional\./)).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("in Hindi the comparison and the autopay answer read in Hindi", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await freshAccount("p13-hindi", { seller: true });
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  await ctx.addInitScript(() => { try { localStorage.setItem("cosora.lang", "hi"); } catch { /* none */ } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/subscription`);
  await page.getByRole("button", { name: /View all|सभी/ }).click();
  await expect(page.getByText("साझा अकाउंट टीम", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("विदेशी ज़रूरतें", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "बिलिंग कैसे काम करती है — क्या ऑटोपे है?" }).click();
  await expect(page.getByText(/^ऑटोपे आपकी मर्ज़ी पर है।/)).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});
