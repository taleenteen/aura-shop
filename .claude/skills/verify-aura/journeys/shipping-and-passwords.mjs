// Parcel tracking (admin ships with carrier + tracking; customer tracks it) and passwords
// (forgot → email → reset → signed in; change password; admin accounts can't be reset).
const RUN = Date.now().toString(36);

export default async ({ page, context, step, api, sql, check, base }) => {
  const adminToken = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const email = `ship${RUN}@example.com`;
  const reg = await api("POST", "/auth/register", { email, password: "oldpass1", full_name: "Ship Tester" });
  const userToken = reg.json.data.token;
  let orderNumber;

  await step("setup: customer pays for an order", async () => {
    const variant = sql("select v.id from product_variants v join products p on p.id=v.product_id where p.slug='lg-ultrafine-27-5k' limit 1");
    sql(`update product_variants set stock_quantity = stock_quantity + 5 where id='${variant}'`);
    check((await api("POST", "/cart/items", { variant_id: variant, quantity: 1 }, userToken)).status < 300, "add to cart");
    const r = await api("POST", "/checkout/reserve", { shipping_address: { recipient_name: "Ship Tester", phone: "0811112222", address_line_1: "1 Sathorn Rd", district: "Sathorn", province: "Bangkok", postal_code: "10120" }, payment_method: "PROMPTPAY_QR" }, userToken);
    orderNumber = r.json.data.order_number;
    check((await api("POST", "/checkout/pay", { order_number: orderNumber, payment_method: "PROMPTPAY_QR" }, userToken)).status === 200, "pay");
    return orderNumber;
  });

  await step("admin: shipping needs a carrier and tracking number, then succeeds", async () => {
    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), adminToken);
    await page.goto("/admin?tab=orders");
    await page.getByLabel("Search orders").fill(orderNumber);
    await page.getByText(orderNumber, { exact: true }).first().click();
    await page.getByLabel(/Serial number for .* unit 1/).fill(`SN${RUN}`.toUpperCase());
    await page.getByRole("button", { name: /Update Status/ }).click();
    await page.getByText("Choose a carrier.").waitFor();
    check(sql(`select status from orders where order_number='${orderNumber}'`) === "PAID_PROCESSING", "nothing saved without carrier");
    await page.getByLabel("Carrier").selectOption("FLASH");
    await page.getByLabel("Tracking number").fill("th 0123 4567 89a");
    await page.getByRole("button", { name: /Update Status/ }).click();
    await page.getByText(`Order ${orderNumber} is now SHIPPED.`).waitFor();
    const row = sql(`select status, carrier, tracking_number from orders where order_number='${orderNumber}'`);
    check(row === "SHIPPED\tFLASH\tTH0123456789A", row);
    return row;
  });

  await step("customer: order page shows tracking; email button opens the parcel timeline", async () => {
    const c = await context.browser().newContext({ baseURL: base });
    await c.addInitScript((t) => localStorage.setItem("aura_jwt_token", t), userToken);
    const p = await c.newPage();
    await p.goto(`/orders/${orderNumber}`);
    await p.getByRole("heading", { name: "Your order is on the way" }).waitFor();
    check(await p.getByText("TH0123456789A").count() >= 1, "tracking number on page");
    await p.getByRole("button", { name: /on the way/ }).click(); // the shipped email row
    const mail = p.getByRole("dialog");
    await mail.getByText("Flash Express tracking number").waitFor();
    await mail.getByRole("button", { name: "Track your parcel" }).click();
    const track = p.getByRole("dialog", { name: "Track your parcel" });
    await track.getByText("Picked up by Flash Express").waitFor();
    check(await track.getByText("TH0123456789A").count() === 1, "number in modal");
    await track.getByRole("button", { name: "Close" }).click();
    await p.goto("/account");
    await p.getByRole("link", { name: "Track parcel" }).first().waitFor();
    await c.close();
  });

  await step("forgot password: email opens in-app, reset link signs in", async () => {
    const c = await context.browser().newContext({ baseURL: base });
    const p = await c.newPage();
    await p.goto("/");
    await p.getByRole("banner").getByRole("button", { name: "Sign In" }).click();
    await p.getByRole("button", { name: "Forgot password?" }).click();
    await p.getByLabel("Email Address").fill("not-an-email");
    await p.getByRole("button", { name: "Send reset link" }).click();
    await p.getByText("Enter a valid email address.").waitFor();
    await p.getByLabel("Email Address").fill(email);
    await p.getByRole("button", { name: "Send reset link" }).click();
    await p.getByRole("heading", { name: "Check your email" }).waitFor();
    await p.getByRole("button", { name: "Open email" }).click();
    await p.getByRole("dialog", { name: /Reset your AURA Tech password/ }).getByRole("button", { name: "Reset password" }).click();
    await p.waitForURL("**/reset-password?token=**");
    await p.getByLabel("New password", { exact: true }).fill("newpass1");
    await p.getByLabel("Confirm new password").fill("different");
    await p.getByRole("button", { name: /Save password/ }).click();
    await p.getByText("Passwords don't match.").waitFor();
    await p.getByLabel("Confirm new password").fill("newpass1");
    await p.getByRole("button", { name: /Save password/ }).click();
    await p.waitForURL("**/account?tab=profile**");
    await p.getByText("Your password has been reset and you're signed in.").waitFor();
    check((await api("POST", "/auth/login", { email, password: "newpass1" })).status === 200, "new password works");
    check((await api("POST", "/auth/login", { email, password: "oldpass1" })).status === 401, "old password rejected");
    await c.close();
  });

  await step("change password on the profile; admin accounts get no reset email", async () => {
    const token = (await api("POST", "/auth/login", { email, password: "newpass1" })).json.data.token;
    const c = await context.browser().newContext({ baseURL: base });
    await c.addInitScript((t) => localStorage.setItem("aura_jwt_token", t), token);
    const p = await c.newPage();
    await p.goto("/account?tab=profile");
    await p.getByLabel("Current password").fill("wrongpass");
    await p.getByLabel("New password", { exact: true }).fill("thirdpass1");
    await p.getByLabel("Confirm new password").fill("thirdpass1");
    await p.getByRole("button", { name: "Update password" }).click();
    await p.getByText("That's not your current password.").waitFor();
    await p.getByLabel("Current password").fill("newpass1");
    await p.getByRole("button", { name: "Update password" }).click();
    await p.getByText("Password updated.").waitFor();
    await c.close();
    check((await api("POST", "/auth/login", { email, password: "thirdpass1" })).status === 200, "changed password works");
    const adminReset = await api("POST", "/auth/forgot-password", { email: "admin@auratech.co.th" });
    check(adminReset.status === 200 && !adminReset.json.data.email_id, "admin gets no in-app reset email");
  });
};
