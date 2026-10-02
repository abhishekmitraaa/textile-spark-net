/**
 * RFQ/leads pipeline (documentation/rfq-leads-pipeline-design-2026-10-02.md), on the
 * local stack only. R1: a signed-out visitor is asked to sign in instead of being told
 * there are no requirements, and a signed-in vendor never sees that prompt.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, clientAs, service, signedInContext, sql, watchErrors } from "./stack";

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

test.describe("R3: a removed request", () => {
  test("the buyer sees Removed by Cosora with the reason", async ({ browser }) => {
    const db = service();
    const { data: rfq } = await db.from("rfqs")
      .insert({ buyer_id: "11111111-1111-1111-1111-111111111111", title: "R3 spec removed", status: "active" })
      .select("id").single();
    try {
      const admin = await clientAs("admin");
      const { error } = await admin.rpc("admin_lead_remove", { p_rfq_id: rfq!.id, p_reason: "Duplicate of an earlier request" });
      expect(error).toBeNull();

      const ctx = await signedInContext(browser, "buyer");
      const page = await ctx.newPage();
      await page.goto(`${BUYER_URL}/requirement/my-quotes`);
      const card = page.getByRole("button", { name: /R3 spec removed/ });
      await expect(card.getByText("Removed by Cosora")).toBeVisible();
      await expect(card.getByText("Duplicate of an earlier request")).toBeVisible();
      await ctx.close();
    } finally {
      sql(`delete from public.rfqs where id = '${rfq!.id}'`);
    }
  });
});

test("an admin removes a lead with a reason and flags another, and the Leads page shows it", async ({ browser }) => {
  const db = service();
  const { data: rows } = await db.from("rfqs").insert([
    { buyer_id: "11111111-1111-1111-1111-111111111111", title: "R3 spec admin remove", status: "active" },
    { buyer_id: "11111111-1111-1111-1111-111111111111", title: "R3 spec admin flag", status: "active",
      vendor_id: "22222222-2222-2222-2222-222222222222" },
  ]).select("id, title");
  try {
    const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${ADMIN_URL}/leads`);
    await page.getByLabel("Search").fill("R3 spec admin remove");
    await page.getByRole("row", { name: /R3 spec admin remove/ }).getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Remove lead" }).click();
    await expect(page.getByRole("button", { name: "Remove for good" })).toBeDisabled();
    await page.getByPlaceholder("Why is this being removed? The buyer will read this.").fill("Spam posting");
    await page.getByRole("button", { name: "Remove for good" }).click();
    await expect(page.getByText("Removed by")).toBeVisible();
    await expect(page.getByText("Spam posting")).toBeVisible();
    expect(sql(`select status || '|' || removed_reason from public.rfqs where title = 'R3 spec admin remove'`)).toBe("closed|Spam posting");

    await page.keyboard.press("Escape");
    await page.getByLabel("Search").fill("R3 spec admin flag");
    await page.getByRole("row", { name: /R3 spec admin flag/ }).getByRole("button", { name: "View" }).click();
    await page.getByPlaceholder("Add an internal note…").fill("Same buyer posted this twice");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Same buyer posted this twice")).toBeVisible();
    await ctx.close();
  } finally {
    sql(`delete from admin.admin_flags where entity_type = 'rfq' and note = 'Same buyer posted this twice';
         delete from public.rfqs where title like 'R3 spec admin %'`);
  }
});
