import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 7, Phase 2 — the public marketing page carries no fabricated
 * endorsement and no hotlinked placeholder imagery.
 *
 * It used to render: "We cut our sampling cycle from weeks to days. The vendors
 * are real, the quotes are fast." — attributed to "Ananya Desai, Founder, Indigo
 * Loom Apparel", with a picsum.photos headshot. No such customer exists in this
 * database. Two bento cells also hotlinked picsum.photos images captioned as a
 * textile manufacturer and a garment studio.
 *
 *   npx playwright test tests/mp7-landing-no-fabrication.spec.ts
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(REPO_ROOT, "screenshots");

test("P2 Landing: no invented testimonial, no hotlinked placeholder images", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  // Scroll the whole page so every lazy section mounts before we inspect it.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });

  // The cells whose images were removed still render — with their copy intact.
  await expect(page.getByRole("heading", { name: /Verified manufacturers/i })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("heading", { name: /Pan-India network/i })).toBeVisible();

  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  for (const s of ["Ananya Desai", "Indigo Loom", "We cut our sampling cycle"]) {
    expect(text, `fabricated testimonial text "${s}"`).not.toContain(s);
  }
  expect(await page.locator('img[src*="picsum.photos"]').count(), "hotlinked picsum image").toBe(0);

  await page.screenshot({ path: path.join(SHOTS, "mp7-landing.png"), fullPage: true });
  expect(errors, "no console errors").toEqual([]);
});
