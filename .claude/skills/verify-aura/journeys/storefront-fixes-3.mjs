async function placeOrder(page) {
  await page.goto("/products/macbook-air-13-m3");
  await page.getByRole("button", { name: "Add to Bag" }).click();
  await page.getByRole("button", { name: "Proceed to Checkout" }).click(); await page.waitForURL("**/checkout");
  const f = { "Customer Email": "privacy@example.com", "Recipient Full Name": "Private Person", "Mobile Phone Number": "081-000-0000",
    "Street Address & Building": "99 Secret Road", "District": "Pathum Wan", "Postal Code": "10330" };
  for (const [label, v] of Object.entries(f)) await page.getByLabel(label, { exact: true }).fill(v);   // #8 labels
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  const ref = (await page.getByText(/^Ref: AURA-/).textContent()).replace("Ref: ", "").trim();
  await page.getByRole("button", { name: "completed the transfer" }).click(); await page.waitForURL(`**/orders/${ref}`);
  return ref;
}
export default async ({ page, context, step, api, check, base }) => {
  const adminToken = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const asGuest = (guest, path) => fetch(`${base}/api/v1${path}`, { headers: { "X-Guest-Session-ID": guest } }).then(async (r) => ({ status: r.status, json: await r.json() }));

  const ref = await step("#8 checkout fields are reachable by their labels; place order", () => placeOrder(page));
  await step("#2 order number is AURA-YYYYMMDD + 8 unambiguous chars", async () => {
    check(/^AURA-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/.test(ref), ref); return ref;
  });
  await step("#1 owner sees receipt; stranger, stranger QR, stranger pay all 404; admin can view", async () => {
    check(await page.getByText("99 Secret Road").count() + await page.getByText("privacy@example.com").count() > 0, "owner sees own receipt");
    const stranger = "guest_stranger_" + Date.now();
    const r1 = await asGuest(stranger, `/orders/${ref}`);
    const r2 = await asGuest(stranger, `/checkout/promptpay/${ref}`);
    const r3 = await fetch(`${base}/api/v1/checkout/pay`, { method: "POST", headers: { "X-Guest-Session-ID": stranger, "Content-Type": "application/json" }, body: JSON.stringify({ order_number: ref, payment_method: "PROMPTPAY_QR" }) });
    check(r1.status === 404 && r2.status === 404 && r3.status === 404, `stranger got ${r1.status}/${r2.status}/${r3.status}`);
    check(!JSON.stringify(r1.json).includes("Secret Road"), "address leaked");
    const adm = await api("GET", `/orders/${ref}`, null, adminToken);
    check(adm.status === 200, `admin ${adm.status}`);
    return { stranger: [r1.status, r2.status, r3.status], admin: adm.status };
  });
  await step("#1 stranger browser opening the receipt URL sees not-found", async () => {
    const other = await context.browser().newContext({ baseURL: base });
    const p = await other.newPage(); await p.goto(`/orders/${ref}`); await p.waitForLoadState("networkidle");
    const leaked = await p.getByText("Secret Road").count();
    const body = (await p.locator("main").innerText()).slice(0, 200).replace(/\s+/g, " ");
    await other.close(); check(leaked === 0, "address visible to stranger"); return body;
  });
  await step("#5 guest: no Admin link in navbar/footer; /admin shows only a sign-in prompt", async () => {
    const other = await context.browser().newContext({ baseURL: base });
    const p = await other.newPage(); await p.goto("/admin"); await p.waitForLoadState("networkidle");
    const r = { navAdmin: await p.getByRole("banner").getByRole("link", { name: "Admin", exact: true }).count(),
      footerAdmin: await p.getByRole("link", { name: "Admin Console" }).count(),
      tabs: await p.getByRole("link", { name: "Order S/N Fulfillment" }).count(),
      prompt: await p.getByText("Sign in with an admin account").count() };
    await other.close();
    check(r.navAdmin === 0 && r.footerAdmin === 0 && r.tabs === 0 && r.prompt === 1, JSON.stringify(r)); return r;
  });
  await step("#5 admin: links and tabs visible", async () => {
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), adminToken);
    await page.goto("/admin"); await page.waitForLoadState("networkidle");
    check(await page.getByRole("banner").getByRole("link", { name: "Admin", exact: true }).count() === 1, "nav admin link");
    check(await page.getByRole("link", { name: "Order S/N Fulfillment" }).count() === 1, "tabs");
    await page.evaluate(() => localStorage.removeItem("aura_jwt_token"));
  });
  await step("#3 heart a product, Wishlist page lists it, un-heart removes it", async () => {
    await page.goto("/catalog"); await page.waitForLoadState("networkidle");
    const name = (await page.getByRole("heading", { level: 3 }).first().textContent()).trim();
    await page.getByRole("button", { name: "Add to wishlist" }).first().click(); await page.waitForTimeout(500);
    await page.getByRole("link", { name: "Wishlist" }).click(); await page.waitForURL("**/wishlist"); await page.waitForLoadState("networkidle");
    check(await page.getByRole("heading", { name: "Your Wishlist" }).count() === 1, "page heading");
    await page.getByRole("heading", { name, level: 3 }).first().waitFor({ timeout: 5000 }).catch(() => {});
    check(await page.getByRole("heading", { name, level: 3 }).count() >= 1, `card ${name} missing`);
    await page.getByRole("button", { name: "Remove from wishlist" }).first().click(); await page.waitForTimeout(500);
    check(await page.getByText("No saved products yet").count() === 1, "empty state after un-heart");
    return name;
  });
  await step("#6 adding a 4th product to compare shows the limit notice", async () => {
    await page.goto("/catalog"); await page.waitForLoadState("networkidle");
    for (let k = 0; k < 4; k++) { await page.getByRole("button", { name: "Compare", exact: true }).first().click(); await page.waitForTimeout(300); }
    const notice = page.getByRole("status").filter({ hasText: "up to 3 products" });
    check(await notice.count() === 1, "notice missing");
    await page.getByRole("button", { name: "Open Comparison" }).click(); await page.waitForTimeout(800);
    check(await page.getByText("Highlight Differences Only").count() >= 1, "compare modal did not open");
  });
  await step("#7 hero secondary CTA label matches where it goes", async () => {
    await page.goto("/"); await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: "Browse Mac Lineup" });
    check(await link.count() === 1 && (await link.getAttribute("href")).includes("category=mac"), "hero CTA");
    check(await page.getByRole("link", { name: "Compare Specs" }).count() === 0, "old label still present");
  });
  await step("#9 footer info items are plain text, not fake links", async () => {
    const item = page.getByText("Serial Number (S/N) Warranty Check", { exact: true });
    const cursor = await item.evaluate((el) => getComputedStyle(el).cursor);
    check(cursor !== "pointer", `cursor ${cursor}`);
    check(await page.getByRole("link", { name: "Track Order Status" }).getAttribute("href") === "/orders/lookup", "track order links to lookup");
  });
};
