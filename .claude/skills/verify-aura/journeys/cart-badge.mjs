const badge = (page) => page.getByRole("button", { name: "Shopping Cart" }).innerText().then((t) => t.trim());
export default async ({ page, step, check }) => {
  await step("add 2 units; navbar shows 2", async () => {
    await page.goto("/products/macbook-air-13-m3");
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await page.getByRole("button", { name: "Increase quantity" }).click(); await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Proceed to Checkout" }).click(); await page.waitForURL("**/checkout");
    await page.waitForLoadState("networkidle");
    const b = await badge(page);
    check(b === "2", `badge before lock: "${b}"`);
    return b;
  });
  await step("lock stock: badge clears immediately, summary still lists the items", async () => {
    for (const [l, v] of Object.entries({ "Customer Email": "b@example.com", "Recipient Full Name": "B", "Mobile Phone Number": "081", "Street Address & Building": "1", "District": "X", "Postal Code": "10330" }))
      await page.getByLabel(l, { exact: true }).fill(v);
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText(/^Ref: AURA-/).waitFor();
    await page.waitForTimeout(800);
    const b = await badge(page);
    check(b === "", `badge after lock: "${b}"`);
    const summary = await page.getByRole("heading", { name: "Order Summary" }).locator("xpath=..").innerText();
    check(summary.includes("MacBook Air 13-inch (M3)") && summary.includes("Qty: 2") && summary.includes("฿79,800"), `summary: ${summary}`);
    return summary.replace(/\s+/g, " ").slice(0, 160);
  });
  await step("pay: receipt, badge still empty, drawer empty", async () => {
    await page.getByRole("button", { name: "completed the transfer" }).click();
    await page.waitForURL("**/orders/**"); await page.waitForLoadState("networkidle");
    check(await badge(page) === "", "badge after pay");
    await page.getByRole("button", { name: "Shopping Cart" }).click(); await page.waitForTimeout(600);
    check(await page.getByRole("heading", { name: /Review Bag \(0\)|Your bag is empty/i }).count() + await page.getByText(/empty/i).count() > 0, "drawer not empty");
  });
};
