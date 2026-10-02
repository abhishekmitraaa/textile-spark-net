/**
 * RFQ/leads pipeline (documentation/rfq-leads-pipeline-design-2026-10-02.md), on the
 * local stack only. R1: a signed-out visitor is asked to sign in instead of being told
 * there are no requirements, and a signed-in vendor never sees that prompt.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, clientAs, service, signedInContext, sql, watchErrors } from "./stack";

test.describe("R1: signed-out visitors", () => {
  test("/leads asks a signed-out visitor to sign in", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${BUYER_URL}/leads`);
    await expect(page.getByText("Sign in to see buyer requirements")).toBeVisible();
    await expect(page.getByText("No open buyer requirements right now")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login");
    expect(errors).toEqual([]);
  });

  test("/seller-home asks a signed-out visitor to sign in", async ({ page }) => {
    await page.goto(`${BUYER_URL}/seller-home`);
    await expect(page.getByText("Sign in to see buyer requirements")).toBeVisible();
    await expect(page.getByText("No open buyer requirements right now. Check back soon.")).toHaveCount(0);
  });

  test("a signed-in vendor never sees the sign-in prompt", async ({ browser }) => {
    const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/leads`);
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Sign in to see buyer requirements")).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("R2: the same leads on every plan", () => {
  test("a vendor with no plan quotes on 11 leads and sees no cap anywhere", async ({ browser }) => {
    const db = service();
    const buyer = (await db.from("profiles").select("id").eq("id", "11111111-1111-1111-1111-111111111111").single()).data!.id;
    sql(`update public.vendor_subscriptions set status = 'expired' where vendor_id = '22222222-2222-2222-2222-222222222222'`);
    const { data: rfqs } = await db.from("rfqs")
      .insert(Array.from({ length: 11 }, (_, i) => ({ buyer_id: buyer, title: `R2 spec lead ${i + 1}`, status: "active" })))
      .select("id");
    try {
      const vendor = await clientAs("vendor");
      for (const r of rfqs!) {
        const { error } = await vendor.from("quotes").upsert(
          { rfq_id: r.id, vendor_id: "22222222-2222-2222-2222-222222222222", price_per_unit: 100, price_inr: 100, status: "pending" },
          { onConflict: "rfq_id,vendor_id" },
        );
        expect(error).toBeNull();
      }

      const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
      const page = await ctx.newPage();
      await page.goto(`${BUYER_URL}/leads`);
      await expect(page.getByText("Buyer Requirements")).toBeVisible();
      await expect(page.getByText(/leads used/)).toHaveCount(0);
      await expect(page.getByText(/Monthly lead limit/)).toHaveCount(0);
      await expect(page.getByText("Upgrade to quote")).toHaveCount(0);

      await page.goto(`${BUYER_URL}/subscription`);
      await expect(page.getByText("Current billing")).toBeVisible();
      await expect(page.getByText("Monthly Leads")).toHaveCount(0);
      await expect(page.getByText(/leads \/ month/)).toHaveCount(0);
      await expect(page.getByText("Leads / month (est.)")).toHaveCount(0);
      await ctx.close();
    } finally {
      await db.from("quotes").delete().in("rfq_id", rfqs!.map((r) => r.id));
      sql(`delete from public.rfqs where title like 'R2 spec lead %'`);
    }
  });
});
