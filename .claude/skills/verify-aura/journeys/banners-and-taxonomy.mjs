// Banners (validation, schedule order, on/off, delete) and categories & brands (menu label,
// slug clash, delete only when unused). Changes show on the storefront.
const RUN = Date.now().toString(36);

export default async ({ page, context, step, api, sql, check, base }) => {
  const adminToken = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const ribbonText = `Ribbon ${RUN}: free gift wrap`;
  const storefront = async () => {
    const c = await context.browser().newContext({ baseURL: base });
    const p = await c.newPage();
    await p.goto("/");
    return { c, p };
  };

  await step("hero banner: empty form shows field errors before saving", async () => {
    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), adminToken);
    await page.goto("/admin?tab=banners");
    await page.getByRole("button", { name: "New home hero" }).click();
    await page.getByRole("button", { name: "Create banner" }).click();
    await page.getByText("Enter a headline.").waitFor();
    check(await page.getByText("Upload or link a product image.").count() === 1, "image error");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  await step("top ribbon: bad link refused, then created and shown on the storefront", async () => {
    await page.getByRole("button", { name: "New top ribbon" }).click();
    await page.getByLabel("Announcement", { exact: true }).fill(ribbonText);
    await page.getByLabel("Link (optional)").fill("javascript:alert(1)");
    await page.getByLabel("Order").fill("-100");
    await page.getByRole("button", { name: "Create banner" }).click();
    await page.getByText("Use a site path like /catalog or an https:// link.").waitFor();
    await page.getByLabel("Link (optional)").fill("/catalog?category=monitors");
    await page.getByRole("button", { name: "Create banner" }).click();
    await page.getByRole("region", { name: "Top ribbon" }).getByText(ribbonText).first().waitFor();
    const { c, p } = await storefront();
    const ribbon = p.getByRole("complementary", { name: "Storewide Announcement" });
    await ribbon.getByText(ribbonText).waitFor();
    await ribbon.getByRole("link").click();
    await p.waitForURL("**/catalog?category=monitors");
    await c.close();
  });

  await step("switching the ribbon off removes it from the storefront; delete removes it", async () => {
    await page.getByRole("switch", { name: `Turn off: ${ribbonText}` }).click();
    await page.getByRole("switch", { name: `Turn on: ${ribbonText}` }).waitFor();
    const { c, p } = await storefront();
    await p.getByRole("complementary", { name: "Storewide Announcement" }).waitFor();
    await p.waitForLoadState("networkidle");
    check(await p.getByText(ribbonText).count() === 0, "hidden ribbon still shown");
    await c.close();
    await page.getByRole("button", { name: `Delete ${ribbonText}` }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("region", { name: "Top ribbon" }).getByText(ribbonText).first().waitFor({ state: "detached" });
    check(sql(`select count(*) from banners where headline='${ribbonText}'`) === "0", "row deleted");
  });

  await step("category with a menu label appears in the top menu; deleting it removes it", async () => {
    await page.goto("/admin?tab=catalog");
    await page.getByRole("button", { name: "Add category" }).click();
    const dlg = page.getByRole("dialog", { name: "New category" });
    await dlg.getByLabel("Slug").fill("Bad Slug!");
    await dlg.getByRole("button", { name: "Create category" }).click();
    await dlg.getByText("Enter a name.").waitFor();
    check(await dlg.getByText("Use lowercase letters, digits and dashes (max 60).").count() === 1, "slug error");
    await dlg.getByLabel("Name").fill(`Smart Audio ${RUN}`);
    await dlg.getByLabel("Slug").fill("");
    await dlg.getByLabel("Menu label").fill(`Audio${RUN.slice(-3)}`);
    await dlg.getByRole("button", { name: "Create category" }).click();
    const table = page.getByRole("region", { name: "Categories" });
    await table.getByRole("cell", { name: `Smart Audio ${RUN}`, exact: true }).waitFor();
    check(sql(`select slug from categories where name='Smart Audio ${RUN}'`) === `smart-audio-${RUN}`, "slug generated");

    const { c, p } = await storefront();
    await p.getByRole("banner").getByRole("link", { name: `Audio${RUN.slice(-3)}` }).waitFor();
    await c.close();

    await page.getByRole("button", { name: `Delete Smart Audio ${RUN}` }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await table.getByRole("cell", { name: `Smart Audio ${RUN}`, exact: true }).waitFor({ state: "detached" });
  });

  await step("categories in use can't be deleted; a brand slug clash is reported", async () => {
    check(await page.getByRole("button", { name: /^Delete MacBook/ }).isDisabled(), "in-use category delete should be disabled");
    const r = await api("DELETE", `/admin/categories/${sql("select id from categories where slug='mac'")}`, null, adminToken);
    check(r.status === 409 && r.json.error.code === "IN_USE", r.text);
    await page.getByRole("button", { name: "Add brand" }).click();
    const dlg = page.getByRole("dialog", { name: "New brand" });
    await dlg.getByLabel("Name").fill("Apple Again");
    await dlg.getByLabel("Slug").fill("apple");
    await dlg.getByRole("button", { name: "Create brand" }).click();
    await dlg.getByText("Another entry already uses this slug.").waitFor();
    await dlg.getByRole("button", { name: "Close" }).click();
  });
};
