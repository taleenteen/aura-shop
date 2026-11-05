const badge = (page) => page.getByRole("button", { name: "Shopping Cart" }).innerText().then((t) => t.trim());
const ref = async (page) => (await page.getByText(/^Ref: AURA-/).innerText()).replace("Ref: ", "").trim();
const fillDelivery = async (page, email) => {
  for (const [l, v] of Object.entries({ "Customer Email": email, "Recipient Full Name": "Nok Tester", "Mobile Phone Number": "0812223333", "Street Address & Building": "9 Silom Rd", "District": "Bang Rak", "Postal Code": "10500" }))
    await page.getByLabel(l, { exact: true }).fill(v);
};
const addToBag = async (page) => {
  await page.goto("/products/macbook-air-13-m3");
  await page.getByRole("button", { name: "Add to Bag" }).click();
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await page.waitForURL("**/checkout");
};

export default async ({ page, context, step, api, sql, check, base }) => {
  const email = `nok${Date.now()}@example.com`;
  let first, paid;

  await step("G1 reserve: URL carries the order, reload resumes payment", async () => {
    await addToBag(page);
    await fillDelivery(page, email);
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText(/^Ref: AURA-/).waitFor();
    first = await ref(page);
    await page.waitForURL(`**order=${first}`);
    check(await page.getByText("Developer").count() === 0, "no developer wording");
    await page.reload();
    await page.getByText(`Ref: ${first}`, { exact: true }).waitFor({ timeout: 10000 });
    check(await page.getByRole("button", { name: "I've completed the transfer" }).count() === 1, "promptpay confirm button");
    return first;
  });

  await step("G2 cancel from checkout: order page explains, items back in bag", async () => {
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await page.waitForURL(`**/orders/${first}`);
    await page.getByRole("heading", { name: "Order cancelled" }).waitFor();
    await page.waitForLoadState("networkidle");
    check(await badge(page) === "1", `badge ${await badge(page)}`);
    check(await page.getByRole("button", { name: /Order cancelled: / }).count() === 1, "email row");
    check(sql(`select status from orders where order_number='${first}'`) === "CANCELLED", "db status");
  });

  await step("G3 open the email; its button opens the bag", async () => {
    await page.getByRole("button", { name: /Order cancelled: / }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("heading", { name: "Your order has been cancelled" }).waitFor();
    const text = await dlg.innerText();
    check(text.includes(email) && text.includes("orders@auratech.co.th") && text.includes("MacBook Air"), "email header/body");
    await dlg.getByRole("button", { name: "Return to your bag" }).click();
    await page.getByRole("heading", { name: /Review Bag \(1\)/ }).waitFor();
  });

  await step("G4 pay with PromptPay: confirmation + email", async () => {
    await page.getByRole("button", { name: "Proceed to Checkout" }).click();
    await page.waitForURL("**/checkout");
    await fillDelivery(page, email);
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText(/^Ref: AURA-/).waitFor();
    paid = await ref(page);
    await page.getByRole("button", { name: "I've completed the transfer" }).click();
    await page.waitForURL(`**/orders/${paid}`, { timeout: 15000 });
    await page.getByRole("heading", { name: "Thank you for your order!" }).waitFor();
    await page.getByRole("button", { name: "View email" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("heading", { name: "Thanks for your order" }).waitFor();
    check((await dlg.innerText()).includes("Delivering to"), "address in email");
    await dlg.getByRole("button", { name: "View your order" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    return paid;
  });

  await step("G5 lookup from another browser: read-only order page", async () => {
    const other = await context.browser().newContext({ baseURL: base });
    const p = await other.newPage();
    await p.goto(`/orders/${paid}`);
    await p.getByRole("heading", { name: "We couldn't open this order" }).waitFor();
    await p.getByRole("link", { name: "Find my order" }).click();
    await p.waitForURL("**/orders/lookup**");
    check(await p.getByLabel("Order number").inputValue() === paid, "order number prefilled");
    await p.getByLabel("Email").fill("wrong@example.com");
    await p.getByRole("button", { name: "Find order" }).click();
    await p.getByRole("alert").waitFor();
    check((await p.getByRole("alert").innerText()).includes("couldn't find"), "wrong email message");
    await p.getByLabel("Email").fill(email.toUpperCase());
    await p.getByRole("button", { name: "Find order" }).click();
    await p.waitForURL(`**/orders/${paid}`);
    await p.getByRole("heading", { name: "Thank you for your order!" }).waitFor();
    await p.getByRole("button", { name: /Order confirmed/ }).waitFor();
    check(await p.getByRole("link", { name: "Complete payment" }).count() === 0, "no manage actions");
    await p.reload();
    await p.getByRole("heading", { name: "Thank you for your order!" }).waitFor();
    await other.close();
  });

  await step("U1 signed-in: saved address offered; unpaid order resumable from My Orders", async () => {
    const reg = await api("POST", "/auth/register", { email: `u${Date.now()}@example.com`, password: "password123", full_name: "Saved Address" });
    const token = reg.json.data.token;
    await api("PATCH", "/auth/me", { full_name: "Saved Address", phone: "0899999999", address: "77 Rama IV Rd, Pathum Wan, Bangkok 10330" }, token);
    const u = await context.browser().newContext({ baseURL: base });
    await u.addInitScript((t) => localStorage.setItem("aura_jwt_token", t), token);
    const p = await u.newPage();
    await addToBag(p);
    await p.getByText("My saved address").waitFor();
    check(await p.getByRole("radio", { name: /My saved address/ }).isChecked(), "saved address preselected");
    check(await p.getByLabel("Street Address & Building", { exact: true }).count() === 0, "address fields hidden");
    await p.getByRole("button", { name: "Continue to Payment" }).click();
    await p.getByText(/^Ref: AURA-/).waitFor();
    const n = await ref(p);
    const addr = sql(`select (shipping_address->>'address_line_1') || '|' || (shipping_address->>'postal_code') from orders where order_number='${n}'`);
    check(addr === "77 Rama IV Rd, Pathum Wan, Bangkok 10330|10330", `stored address ${addr}`);
    await p.goto("/account");
    await p.getByRole("link", { name: "Complete payment" }).click();
    await p.getByText(`Ref: ${n}`, { exact: true }).waitFor({ timeout: 10000 });
    await u.close();
    return n;
  });

  await step("U2 expired hold: checkout link sends to order page", async () => {
    sql(`update orders set reservation_expires_at = now() - interval '1 minute' where order_number='${first}'`);
    await page.goto(`/checkout?order=${first}`);
    await page.waitForURL(`**/orders/${first}`);
  });
};
