const SKU = "MBA13-M3-16-256-MN";
const RUN = Date.now().toString(36);
const EMAIL = `two-units-${RUN}@example.com`;
async function addTwoAndOpenCart(page) {
  await page.goto("/products/macbook-air-13-m3");
  await page.getByRole("button", { name: "Add to Bag" }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.waitForLoadState("networkidle");
}
async function checkoutOpenCart(page, pay) {
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await page.waitForURL("**/checkout");
  const f = { "somchai@company.co.th": EMAIL, "Somchai Prommin": "Verify Buyer", "081-234-5678": "081-000-0000",
    "88/12 Sukhumvit Soi 55, Thonglor": "1 Test Road", "Watthana": "Pathum Wan", "10110": "10330" };
  for (const [ph, v] of Object.entries(f)) await page.getByPlaceholder(ph, { exact: true }).fill(v);
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  const ref = (await page.getByText(/^Ref: AURA-/).textContent()).replace("Ref: ", "").trim();
  if (pay) { await page.getByRole("button", { name: "completed the transfer" }).click(); await page.waitForURL(`**/orders/${ref}`); }
  return ref;
}
export default async ({ page, step, api, sql, check }) => {
  const token = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const [stock0] = sql(`select stock_quantity from product_variants where sku='${SKU}'`).split("\t").map(Number);

  await step("#6 cart with qty 2 while only 1 left blocks checkout", async () => {
    await addTwoAndOpenCart(page);
    // Leave exactly 1 unit available, whatever other runs have reserved.
    sql(`update product_variants set stock_quantity=reserved_stock+1 where sku='${SKU}'`);
    await page.reload(); await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Shopping Cart" }).click();
    const btn = page.getByRole("button", { name: "Resolve Unavailable Items" });
    await btn.waitFor();
    check(await btn.isDisabled(), "checkout button should be disabled");
    check(await page.getByText("Only 1 left — Reduce Quantity").count() === 1, "badge missing");
  });
  await step("#6 restore stock -> checkout allowed again", async () => {
    sql(`update product_variants set stock_quantity=${stock0} where sku='${SKU}'`);
    await page.reload(); await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Shopping Cart" }).click();
    await page.getByRole("button", { name: "Proceed to Checkout" }).waitFor();
    check(await page.getByRole("button", { name: "Proceed to Checkout" }).isEnabled(), "should be enabled");
  });
  const ref = await step("pay for 2 units", () => checkoutOpenCart(page, true));
  const orderId = sql(`select id from orders where order_number='${ref}'`);
  const itemId = sql(`select id from order_items where order_id='${orderId}'`);
  const patch = (status, serials) => api("PATCH", `/admin/orders/${orderId}/status`, { status, ...(serials ? { serial_numbers: { [itemId]: serials } } : {}) }, token);

  await step("#5 shipping with one of two serials is rejected", async () => {
    const r = await patch("SHIPPED", ["C02AAA"]);
    check(r.status === 400 && r.json.error.code === "SERIAL_NUMBER_REQUIRED", `${r.status} ${r.text}`);
    check(sql(`select coalesce(serial_numbers::text,'null') from order_items where id='${itemId}'`) === "null", "nothing saved on rejected request");
  });
  await step("#5 duplicate serials rejected", async () => {
    const r = await patch("SN_ASSIGNED", ["DUP1", "dup1"]);
    check(r.status === 400 && r.json.error.code === "INVALID_SERIAL_NUMBERS", `${r.status} ${r.text}`); return r.json.error.message;
  });
  await step("#5 save unit 1, then a blank does not erase it", async () => {
    let r = await patch("SN_ASSIGNED", ["c02aaa", ""]); check(r.status === 200, r.text);
    r = await patch("SHIPPED", ["", "C02BBB"]); check(r.status === 200, r.text);
    const saved = sql(`select serial_numbers::text from order_items where id='${itemId}'`);
    check(saved === '["C02AAA", "C02BBB"]', `saved ${saved}`); return saved;
  });
  await step("#5 serials cannot change after shipping", async () => {
    const r = await patch("DELIVERED", ["HACKED", ""]);
    check(r.status === 400 && r.json.error.code === "INVALID_SERIAL_NUMBERS", `${r.status} ${r.text}`);
    const ok = await patch("DELIVERED"); check(ok.status === 200, ok.text);
  });
  await step("#5 receipt shows both serials", async () => {
    await page.goto(`/orders/${ref}`); await page.waitForLoadState("networkidle");
    check(await page.getByText("S/N: C02AAA").count() === 1 && await page.getByText("S/N: C02BBB").count() === 1, "serials missing on receipt");
  });
  await step("#4 API search by order number, email, and literal %", async () => {
    const byRef = await api("GET", `/admin/orders?q=${ref.slice(-4)}`, null, token);
    check(byRef.json.data.some((o) => o.order_number === ref), "search by ref suffix");
    const byEmail = await api("GET", `/admin/orders?q=${EMAIL.split("@")[0].toUpperCase()}`, null, token);
    check(byEmail.json.data.length === 1 && byEmail.json.meta.total_items === 1, `email search ${byEmail.json.meta.total_items}`);
    const pct = await api("GET", `/admin/orders?q=%25`, null, token);
    check(pct.json.meta.total_items === 0, `'%' must match literally, got ${pct.json.meta.total_items}`);
    const p2 = await api("GET", `/admin/orders?limit=1&page=2`, null, token);
    const total = p2.json.meta.total_items;
    check(p2.json.meta.page === 2 && p2.json.meta.total_pages === total && p2.json.data.length === (total >= 2 ? 1 : 0), `page 2 of size 1 with total ${total}: ${p2.json.data.length} rows`);
    return { byEmail: byEmail.json.meta, pct: pct.json.meta.total_items };
  });
  await step("#4 UI search filters the fulfillment table; 2-unit order shows 2 S/N inputs", async () => {
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), token);
    await page.goto("/admin"); await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Order S/N Fulfillment" }).click();
    await page.getByRole("searchbox", { name: "Search orders" }).fill(EMAIL.split("@")[0]);
    await page.waitForTimeout(700); await page.waitForLoadState("networkidle");
    const rows = await page.locator("tbody tr").count();
    check(rows === 1, `rows ${rows}`);
    await page.getByText(ref).first().click();
    const inputs = await page.getByRole("textbox", { name: /Serial number for .* unit/ }).count();
    check(inputs === 2, `inputs ${inputs}`);
    await page.getByRole("searchbox", { name: "Search orders" }).fill("zzz-no-match");
    await page.waitForTimeout(700); await page.waitForLoadState("networkidle");
    check(await page.getByText('No orders match "zzz-no-match"').count() === 1, "empty-search message");
  });
};
