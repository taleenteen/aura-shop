const SKU = "MBA13-M3-16-256-MN";
const stock = (sql) => sql(`select stock_quantity, reserved_stock from product_variants where sku='${SKU}'`).split("\t").map(Number);
async function checkout(page, pay) {
  await page.goto("/products/macbook-air-13-m3");
  await page.getByRole("button", { name: "Add to Bag" }).click();
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await page.waitForURL("**/checkout");
  const f = { "somchai@company.co.th": "verify@example.com", "Somchai Prommin": "Verify Buyer", "081-234-5678": "081-000-0000",
    "88/12 Sukhumvit Soi 55, Thonglor": "1 Test Road", "Watthana": "Pathum Wan", "10110": "10330" };
  for (const [ph, v] of Object.entries(f)) await page.getByPlaceholder(ph, { exact: true }).fill(v);
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  const ref = (await page.getByText(/^Ref: AURA-/).textContent()).replace("Ref: ", "").trim();
  if (pay) { await page.getByRole("button", { name: "completed the transfer" }).click(); await page.waitForURL(`**/orders/${ref}`); }
  return ref;
}
export default async ({ page, context, step, api, sql, check }) => {
  const login = await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" });
  const token = login.json.data.token;
  const orderId = (num) => sql(`select id from orders where order_number='${num}'`);
  const patch = (num, status) => api("PATCH", `/admin/orders/${orderId(num)}/status`, { status }, token);

  const s0 = stock(sql);
  const pending = await step("checkout without paying (stock reserved)", async () => {
    const ref = await checkout(page, false); const s = stock(sql);
    check(s[1] === s0[1] + 1, `reserved +1 (${s0} -> ${s})`); return { ref, stock: s };
  });
  await step("admin cannot mark unpaid order as paid", async () => {
    const r = await patch(pending.ref, "PAID_PROCESSING");
    check(r.status === 409 && r.json.error.code === "INVALID_ORDER_TRANSITION", `got ${r.status} ${r.text}`); return r.json.error.message;
  });
  await step("admin cancels unpaid order -> reserved stock released", async () => {
    const r = await patch(pending.ref, "CANCELLED"); check(r.status === 200, r.text);
    const s = stock(sql); check(s[0] === s0[0] && s[1] === s0[1], `stock back to ${s0}, got ${s}`);
    const res = sql(`select status from stock_reservations where order_id='${orderId(pending.ref)}'`);
    check(res === "RELEASED", `reservation ${res}`); return { stock: s, reservation: res };
  });
  const paid = await step("checkout and pay (stock committed)", async () => {
    const ref = await checkout(page, true); const s = stock(sql);
    check(s[0] === s0[0] - 1 && s[1] === s0[1], `stock -1 (${s0} -> ${s})`); return { ref, stock: s };
  });
  await step("admin cancels paid order -> physical stock returned", async () => {
    const r = await patch(paid.ref, "CANCELLED"); check(r.status === 200, r.text);
    const s = stock(sql); check(s[0] === s0[0] && s[1] === s0[1], `stock back to ${s0}, got ${s}`); return { stock: s };
  });
  await step("cancelled order is terminal", async () => {
    const r = await patch(paid.ref, "SHIPPED"); check(r.status === 409, `got ${r.status}`); return r.json.error.message;
  });
  await step("orders list: limit clamped and reported honestly", async () => {
    const r = await api("GET", "/admin/orders?limit=500", null, token);
    check(r.json.meta.limit === 100, `meta.limit ${r.json.meta.limit}`);
    check(r.json.data.length === r.json.meta.total_items, `rows ${r.json.data.length} vs total ${r.json.meta.total_items}`);
    const cancelled = r.json.data.find((o) => o.order_number === paid.ref);
    check(!cancelled.allowed_transitions, "cancelled order has no transitions");
    return r.json.meta;
  });
  await step("sign in as customer via modal", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.getByPlaceholder("you@domain.com").fill("demo@auratech.co.th");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.locator("div.fixed.inset-0.z-50").getByRole("button", { name: "Sign In", exact: true }).last().click();
    await page.getByRole("banner").getByRole("button", { name: "Sign In" }).waitFor({ state: "detached" });
  });
  await step("reload keeps the user signed in", async () => {
    await page.reload(); await page.waitForLoadState("networkidle");
    const signIn = await page.getByRole("banner").getByRole("button", { name: "Sign In" }).count();
    check(signIn === 0, "navbar shows Sign In after reload");
    return (await page.getByRole("banner").ariaSnapshot()).split("\n").filter((l) => /button/.test(l)).join(" | ");
  });
  await step("admin: reload /admin stays authenticated; pending order offers only cancel", async () => {
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), token);
    const p2 = await checkout(page, false);
    await page.goto("/admin?tab=orders"); await page.waitForLoadState("networkidle");
    check(await page.getByText("Admin authentication is required").count() === 0, "auth prompt shown after reload");
    await page.getByRole("link", { name: "Order S/N Fulfillment" }).click(); await page.waitForLoadState("networkidle");
    await page.getByText(p2).first().click();
    const opts = await page.locator("form select option").allTextContents();
    check(opts.length === 2 && opts[1].startsWith("CANCELLED"), `options ${opts}`);
    return { order: p2, options: opts };
  });
};
