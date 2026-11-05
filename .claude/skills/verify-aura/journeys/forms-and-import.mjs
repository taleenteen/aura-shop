// zod form validation (errors under fields before anything is sent) and the product CSV import
// (template download, preview, per-field "keep current", same-name decision, results).
const RUN = Date.now().toString(36);

export default async ({ page, context, step, api, sql, check, base }) => {
  const adminToken = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;

  await step("sign-up form: every problem shows under its field; nothing is sent", async () => {
    let posted = false;
    page.on("request", (r) => r.url().includes("/auth/register") && (posted = true));
    await page.goto("/");
    await page.getByRole("banner").getByRole("button", { name: "Sign In" }).click();
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await page.getByPlaceholder("you@domain.com").fill("not-an-email");
    await page.getByPlaceholder("••••••••").fill("123");
    await page.getByRole("button", { name: "Create Account" }).last().click();
    await page.getByText("Enter your name.").waitFor();
    check(await page.getByText("Enter a valid email address.").count() === 1, "email error");
    check(await page.getByText("Use at least 6 characters.").count() === 1, "password error");
    check(!posted, "request sent despite errors");
    await page.keyboard.press("Escape");
    await page.goto("/");
  });

  await step("checkout and card forms: postal code, phone and expiry are checked", async () => {
    const v = sql("select v.id from product_variants v join products p on p.id=v.product_id where p.slug='keychron-q1-pro-wireless' limit 1");
    sql(`update product_variants set stock_quantity = stock_quantity + 5 where id='${v}'`);
    await page.goto("/products/keychron-q1-pro-wireless");
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await page.getByRole("button", { name: "Proceed to Checkout" }).click();
    await page.waitForURL("**/checkout");
    for (const [label, value] of Object.entries({ "Customer Email": "form@example.com", "Recipient Full Name": "Form Tester", "Mobile Phone Number": "081-abc", "Street Address & Building": "9 Silom", District: "Bang Rak", "Postal Code": "123" }))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText("Postal codes have 5 digits.").waitFor();
    check(await page.getByText("Use digits only, e.g. 081-234-5678.").count() === 1, "phone error");
    await page.getByLabel("Mobile Phone Number").fill("081-234-5678");
    await page.getByLabel("Postal Code").fill("10500");
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText(/^Ref: AURA-/).waitFor();
    await page.getByRole("button", { name: "Credit Card" }).click();
    await page.getByLabel("Card Number").fill("4532111122223333");
    await page.getByLabel("Name on Card").fill("FORM TESTER");
    await page.getByLabel("Expiration (MM/YY)").fill("0120");
    await page.getByLabel("Security CVV / CVC").fill("12");
    await page.getByRole("button", { name: "Complete Card Payment" }).click();
    await page.getByText("This card has expired.").waitFor();
    check(await page.getByText("Enter the 3 or 4 digits on the back.").count() === 1, "cvv error");
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await page.waitForURL("**/orders/**");
  });

  await step("import: template downloads; preview shows new, update and same-name products", async () => {
    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), adminToken);
    await page.goto("/admin?tab=products");
    await page.getByRole("button", { name: "Import / export" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Template (CSV)" }).click()]);
    check(dl.suggestedFilename() === "aura-products-template.csv", dl.suggestedFilename());
    const template = await (await dl.createReadStream()).toArray().then((b) => Buffer.concat(b).toString("utf8"));
    check(template.startsWith("﻿product_slug,product_name,"), template.slice(0, 40));

    const lgSku = sql("select v.sku from product_variants v join products p on p.id=v.product_id where p.slug='lg-ultrafine-27-5k' limit 1");
    const lgName = sql("select name from products where slug='lg-ultrafine-27-5k'");
    const q = (s) => `"${s.replace(/"/g, '""')}"`;
    const R = RUN.toUpperCase();
    const csv = [
      "product_slug,product_name,category,brand,tagline,sku,color_name,color_hex,price,stock",
      // Existing product by slug: new tagline and price.
      `lg-ultrafine-27-5k,,,,New tagline ${RUN},${lgSku},,,"21,900",`,
      // New product.
      `import-dock-${RUN},Import Dock ${RUN},accessories,keychron,Ten ports,DOCK-${R}-B,Black,#111111,4990,7`,
      // Same name as the LG monitor (shouted), different slug.
      `lg-27-copy-${RUN},${q(lgName.toUpperCase())},monitors,lg,,LGCOPY-${R},White,#FFFFFF,19900,1`,
    ].join("\n");
    await page.locator('input[type="file"]').setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("heading", { name: "3. Review" }).waitFor();
    const tabs = await page.getByRole("tablist", { name: "Filter products" }).innerText();
    check(/New 1/.test(tabs) && /Update 1/.test(tabs) && /Same name 1/.test(tabs), tabs);
    check(await page.getByRole("button", { name: /^Import \d/ }).isDisabled(), "import must wait for the same-name decision");
    return tabs.replace(/\s+/g, " ");
  });

  await step("keep the current tagline, add the same-name product as new, import", async () => {
    const lgSku = sql("select v.sku from product_variants v join products p on p.id=v.product_id where p.slug='lg-ultrafine-27-5k' limit 1");
    const lgPrice = sql(`select price from product_variants where sku='${lgSku}'`);
    const lgTagline = sql("select tagline from products where slug='lg-ultrafine-27-5k'");
    await page.getByRole("checkbox", { name: "Use the file's Tagline" }).uncheck();
    await page.getByRole("radio", { name: /Different product: add as new/ }).check();
    await page.getByRole("button", { name: "Import 3 products" }).click();
    await page.getByText(/Import finished: 2 created, 1 updated/).waitFor();
    check(sql("select tagline from products where slug='lg-ultrafine-27-5k'") === lgTagline, "tagline should be kept");
    const newPrice = sql(`select price from product_variants where sku='${lgSku}'`);
    check(newPrice === "2190000", `price ${lgPrice} -> ${newPrice}`);
    check(sql(`select count(*) from products where slug in ('import-dock-${RUN}', 'lg-27-copy-${RUN}')`) === "2", "both created");
    // Put the seeded price back for later runs.
    sql(`update product_variants set price=${lgPrice} where sku='${lgSku}'`);
  });
};
