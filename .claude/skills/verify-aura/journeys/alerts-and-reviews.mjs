// Back-in-stock alerts (sign-in prompt, subscribe, restock emails the inbox, email opens the
// option) and reviews (delivered buyers only, star validation, publish, admin hide).
const RUN = Date.now().toString(36);
const SLUG = "lg-ultrafine-27-5k";

export default async ({ page, context, step, api, sql, check, base }) => {
  const adminToken = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const email = `alert${RUN}@example.com`;
  const userToken = (await api("POST", "/auth/register", { email, password: "password1", full_name: "Nida Reviewer" })).json.data.token;
  const variant = sql(`select v.id from product_variants v join products p on p.id=v.product_id where p.slug='${SLUG}' limit 1`);
  const signedIn = async () => {
    const c = await context.browser().newContext({ baseURL: base });
    await c.addInitScript((t) => localStorage.setItem("aura_jwt_token", t), userToken);
    return { c, p: await c.newPage() };
  };

  await step("sold out: guests are asked to sign in; customers can ask to be emailed", async () => {
    sql(`update product_variants set stock_quantity = reserved_stock where id='${variant}'`);
    await page.goto(`/products/${SLUG}`);
    await page.getByRole("button", { name: "Sign in to get notified when it's back" }).waitFor();
    const { c, p } = await signedIn();
    await p.goto(`/products/${SLUG}`);
    await p.getByRole("button", { name: "Email me when it's back" }).click();
    await p.getByText(`We'll email ${email} when it's back`).waitFor();
    await p.goto("/account?tab=inbox");
    await p.getByRole("region", { name: "Waiting for stock" }).or(p.getByText("Waiting for stock")).first().waitFor();
    check(await p.getByRole("button", { name: "Stop waiting" }).count() === 1, "alert listed");
    await c.close();
  });

  await step("restock emails the customer; the email opens the product option", async () => {
    const stock = Number(sql(`select stock_quantity from product_variants where id='${variant}'`));
    const r = await api("POST", `/admin/variants/${variant}/stock-adjustments`, { mode: "delta", quantity: 3, reason: "RECEIVE", note: "", expected_stock: stock }, adminToken);
    check(r.status === 200, r.text);
    const { c, p } = await signedIn();
    await p.goto("/account?tab=inbox");
    await p.getByRole("button", { name: /Back in stock: LG/ }).click();
    const mail = p.getByRole("dialog");
    await mail.getByRole("heading", { name: "It's back" }).waitFor();
    await mail.getByRole("button", { name: "Shop now" }).click();
    await p.waitForURL(`**/products/${SLUG}?variant=${variant}`);
    await p.getByRole("button", { name: "Add to Bag" }).waitFor();
    check(sql(`select count(*) from stock_alerts a join users u on u.id=a.user_id where u.email='${email}' and notified_at is null`) === "0", "alert closed");
    await c.close();
  });

  await step("reviews need a delivered order", async () => {
    const { c, p } = await signedIn();
    await p.goto(`/products/${SLUG}#reviews`);
    await p.getByText("You can review this product once an order containing it has been delivered.").waitFor();
    await c.close();
    // Deliver an order for this customer.
    check((await api("POST", "/cart/items", { variant_id: variant, quantity: 1 }, userToken)).status < 300, "add");
    const n = (await api("POST", "/checkout/reserve", { shipping_address: { recipient_name: "Nida Reviewer", phone: "0812345678", address_line_1: "5 Rama I", district: "Pathum Wan", province: "Bangkok", postal_code: "10330" }, payment_method: "PROMPTPAY_QR" }, userToken)).json.data.order_number;
    await api("POST", "/checkout/pay", { order_number: n, payment_method: "PROMPTPAY_QR" }, userToken);
    const id = sql(`select id from orders where order_number='${n}'`);
    const serials = JSON.parse(sql(`select json_object_agg(id, (select json_agg('RV${RUN}-'||left(id::text,4)||g) from generate_series(1,quantity) g)) from order_items where order_id='${id}'`));
    check((await api("PATCH", `/admin/orders/${id}/status`, { status: "SHIPPED", serial_numbers: serials, carrier: "DHL", tracking_number: `DHL${RUN}`.toUpperCase() }, adminToken)).status === 200, "ship");
    check((await api("PATCH", `/admin/orders/${id}/status`, { status: "DELIVERED" }, adminToken)).status === 200, "deliver");
  });

  await step("write a review from My Orders; stars are required; it appears with a short name", async () => {
    const { c, p } = await signedIn();
    await p.goto("/account");
    await p.getByRole("link", { name: "Rate & review" }).first().click();
    await p.waitForURL(`**/products/${SLUG}#reviews`);
    await p.getByRole("button", { name: "Post review" }).click();
    await p.getByText("Choose 1 to 5 stars.").waitFor();
    await p.getByRole("radio", { name: "4 stars" }).click();
    await p.getByPlaceholder("Title (optional)").fill(`Crisp text ${RUN}`);
    await p.getByPlaceholder("What did you like or dislike?").fill("Great for photo work.");
    await p.getByRole("button", { name: "Post review" }).click();
    await p.getByText("Your review").waitFor();
    const list = p.locator("#reviews li").filter({ hasText: `Crisp text ${RUN}` });
    await list.first().waitFor();
    check((await list.first().innerText()).includes("Nida R. • Verified buyer"), await list.first().innerText());
    await c.close();
  });

  await step("admin hides the review: gone for shoppers, the author sees a notice", async () => {
    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), adminToken);
    await page.goto("/admin?tab=reviews");
    await page.getByLabel("Search reviews").fill(RUN);
    const row = page.locator("li").filter({ hasText: `Crisp text ${RUN}` });
    await row.getByRole("button", { name: "Hide" }).click();
    await row.getByRole("button", { name: "Show" }).waitFor();
    const guest = await context.browser().newContext({ baseURL: base });
    const g = await guest.newPage();
    await g.goto(`/products/${SLUG}`);
    await g.getByRole("heading", { name: "Customer reviews" }).waitFor();
    await g.waitForLoadState("networkidle");
    check(await g.getByText(`Crisp text ${RUN}`).count() === 0, "hidden review visible to guests");
    await guest.close();
    const { c, p } = await signedIn();
    await p.goto(`/products/${SLUG}`);
    await p.getByText(/This review is hidden from the product page/).waitFor();
    await c.close();
  });
};
