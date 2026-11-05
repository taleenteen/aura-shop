const signIn = async (page) => {
  await page.getByRole("banner").getByRole("button", { name: "Sign In" }).click();
  const m = page.locator("div.fixed.inset-0.z-50").last();
  await m.getByPlaceholder("you@domain.com").fill("demo@auratech.co.th");
  await m.getByPlaceholder("••••••••").fill("password123");
  await m.getByRole("button", { name: "Sign In", exact: true }).last().click();
  await page.getByRole("banner").getByRole("button", { name: "Sign In" }).waitFor({ state: "detached" });
  await page.waitForTimeout(1200);
};
const signOut = async (page) => {
  await page.getByRole("banner").getByRole("button", { name: /Somchai|ST/ }).click();
  await page.getByRole("button", { name: /Sign Out/ }).click();
  await page.waitForTimeout(1200);
};
const heartsOnCatalog = async (page) => {
  await page.goto("/catalog"); await page.waitForLoadState("networkidle");
  return page.getByRole("button", { name: "Remove from wishlist" }).count();
};
const headings = (page) => page.locator("main h3").allTextContents();

export default async ({ page, context, step, sql, check, api, base }) => {
  const userId = sql(`select id from users where email='demo@auratech.co.th'`);
  const rows = () => sql(`select coalesce(user_id::text,'-') || ' ' || coalesce(guest_session_id,'-') || ' ' || product_id from wishlists order by product_id`);
  sql(`delete from wishlists`);

  await step("W1 heart while signed in; sign out clears storage and the guest sees no account hearts", async () => {
    await page.goto("/"); await signIn(page);
    await page.goto("/catalog"); await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add to wishlist" }).nth(2).click(); await page.waitForTimeout(600);
    const guestBefore = await page.evaluate(() => localStorage.getItem("aura_guest_session_id"));
    check(!rows().includes("guest_"), `account row must not carry a guest id: ${rows()}`);
    await signOut(page);
    const ls = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    check(!("aura_jwt_token" in ls), "token left in storage");
    check(ls.aura_guest_session_id !== guestBefore, "guest id should be fresh after sign out");
    check(await heartsOnCatalog(page) === 0, "guest sees account hearts");
    check(rows().startsWith(userId), `account row intact: ${rows()}`);
    return { storageAfterSignOut: Object.keys(ls) };
  });
  await step("W2 sign in again: account heart is back", async () => {
    await signIn(page);
    check(await heartsOnCatalog(page) === 1, "heart restored");
  });
  await step("W3 guest hearts a product the account already has, plus a new one; sign in -> both, no duplicates", async () => {
    await signOut(page);
    await page.goto("/catalog"); await page.waitForLoadState("networkidle");
    const hearts = page.locator("button[aria-label$='wishlist']");
    await hearts.nth(2).click(); await page.waitForTimeout(400);   // same product the account has
    await hearts.nth(0).click(); await page.waitForTimeout(600);   // new product
    await signIn(page);
    const n = await heartsOnCatalog(page);
    const dbRows = rows().split("\n");
    check(n === 2 && dbRows.length === 2 && dbRows.every((r) => r.startsWith(userId + " - ")), `hearts ${n}, rows ${JSON.stringify(dbRows)}`);
    return dbRows.length;
  });

  await step("C1 catalog follows navbar category links without reloading the page", async () => {
    await page.goto("/catalog?category=mac"); await page.waitForLoadState("networkidle");
    const mac = await headings(page);
    await page.getByRole("navigation").getByRole("link", { name: "Ultrabooks" }).click();
    await page.waitForURL(/category=ultrabooks/); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
    const ultra = await headings(page);
    const expected = (await api("GET", "/catalog?category=ultrabooks&limit=12")).json.data.map((p) => p.name);
    check(JSON.stringify([...new Set(ultra)].sort()) === JSON.stringify([...new Set(expected)].sort()), `shown ${ultra} vs api ${expected}`);
    check(JSON.stringify(mac) !== JSON.stringify(ultra), "list did not change");
    await page.goBack(); await page.waitForURL(/category=mac/); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
    check(JSON.stringify(await headings(page)) === JSON.stringify(mac), "back button did not restore Mac list");
    return { mac: mac.length, ultrabooks: ultra.length };
  });
  await step("S1 search shortcut label matches this OS (Windows -> Ctrl K)", async () => {
    const btn = page.getByRole("button", { name: /Search/ });
    const text = await btn.innerText();
    check(text.includes("Ctrl K") && !text.includes("⌘"), `label ${text}`);
    await page.keyboard.press("Control+k"); await page.waitForTimeout(400);
    check(await page.getByPlaceholder(/Search MacBook/).count() === 1, "Ctrl+K did not open search");
    await page.keyboard.press("Escape");
    return text.trim();
  });

  await step("A1 account: orders grouped by stage", async () => {
    const order = async (pay) => {
      await page.goto("/products/macbook-air-13-m3");
      await page.getByRole("button", { name: "Add to Bag" }).click();
      await page.getByRole("button", { name: "Proceed to Checkout" }).click(); await page.waitForURL("**/checkout");
      // A saved address is preselected and hides the address fields; only fill them when shown.
      if (await page.getByLabel("Street Address & Building", { exact: true }).count())
        for (const [l, v] of Object.entries({ "Street Address & Building": "1 Rd", "District": "X", "Postal Code": "10330" })) await page.getByLabel(l, { exact: true }).fill(v);
      if (!(await page.getByLabel("Mobile Phone Number").inputValue())) await page.getByLabel("Mobile Phone Number").fill("081");
      await page.getByRole("button", { name: "Continue to Payment" }).click();
      const ref = (await page.getByText(/^Ref: AURA-/).textContent()).replace("Ref: ", "").trim();
      if (pay) { await page.getByRole("button", { name: "completed the transfer" }).click(); await page.waitForURL(`**/orders/${ref}`); }
      return ref;
    };
    const paid = await order(true), pending = await order(false);
    await page.goto("/account"); await page.waitForLoadState("networkidle");
    const tabText = await page.getByRole("tablist", { name: "Order status" }).innerText();
    await page.getByRole("tab", { name: /To Ship/ }).click();
    check(await page.getByText(paid).count() === 1 && await page.getByText(pending).count() === 0, "To Ship tab");
    await page.getByRole("tab", { name: /To Pay/ }).click();
    check(await page.getByText(pending).count() === 1 && await page.getByText(/Your items are held until/).count() >= 1, "To Pay tab");
    await page.getByRole("tab", { name: /^All/ }).click();
    await page.getByText(paid).locator("xpath=ancestor::li[1]").getByRole("link", { name: "View details" }).click();
    await page.waitForURL(`**/orders/${paid}`);
    await page.getByRole("heading", { name: "Thank you for your order!" }).waitFor();
    return { paid, pending, tabs: tabText.replace(/\s+/g, " ") };
  });
  await step("A2 profile: validation, save address, persists after reload", async () => {
    await page.goto("/account?tab=profile"); await page.waitForLoadState("networkidle");
    await page.getByLabel("Full name").fill("   ");
    await page.getByRole("button", { name: "Save changes" }).click();
    // zod shows the problem under the field, before anything is sent.
    await page.getByText("Full name is required.").waitFor();
    await page.getByLabel("Full name").fill("Somchai Techlover");
    // Unique per run: the demo account keeps its profile between runs, and saving identical
    // values leaves "Save changes" disabled.
    const addr = `99/1 Rama IX Rd (${Date.now()})\nHuai Khwang, Bangkok 10310`;
    await page.getByLabel("Delivery address").fill(addr);
    await page.getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(600);
    check((await page.getByRole("status").innerText()).includes("Profile saved"), "saved");
    await page.reload(); await page.waitForLoadState("networkidle");
    check(await page.getByLabel("Delivery address").inputValue() === addr, "address not persisted");
    check(sql(`select address from users where id='${userId}'`).includes("Rama IX"), "db");
  });
  await step("A3 signed out: /account asks to sign in", async () => {
    const other = await context.browser().newContext({ baseURL: base });
    const p = await other.newPage(); await p.goto("/account"); await p.waitForLoadState("networkidle");
    const ok = await p.getByRole("heading", { name: "Sign in to see your account" }).count();
    await other.close(); check(ok === 1, "prompt");
  });

  await step("H1 phone: icon-only logo, swipeable flagship row; education card readable", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/"); await page.waitForLoadState("networkidle");
    const logo = page.getByRole("link", { name: "AURA TECH home" });
    check(await logo.count() === 1, "logo accessible name");
    check(!(await logo.getByText("AURA TECH").isVisible()), "wordmark visible on phone");
    const row = page.getByRole("region", { name: "Flagship models" });
    await row.scrollIntoViewIfNeeded();
    const m = await row.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, snap: getComputedStyle(el).scrollSnapType }));
    check(m.sw > m.cw * 2 && m.snap.includes("x"), `row ${JSON.stringify(m)}`);
    await row.evaluate((el) => el.scrollBy({ left: el.clientWidth }));
    await page.waitForTimeout(500);
    const scrolled = await row.evaluate((el) => el.scrollLeft);
    check(scrolled > 0, "row did not scroll");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/"); await page.waitForLoadState("networkidle");
    const d = await page.getByRole("region", { name: "Flagship models" }).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, display: getComputedStyle(el).display }));
    check(d.display === "grid" && d.sw <= d.cw + 1, `desktop ${JSON.stringify(d)}`);
    check(await page.getByText("AURA TECH", { exact: true }).first().isVisible(), "wordmark hidden on desktop");
    const badge = page.getByText("EDUCATION PRICING", { exact: true });
    await badge.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
    const colors = await badge.evaluate((el) => {
      const card = el.closest("div[style]");
      return { badge: getComputedStyle(el).color, card: card && getComputedStyle(card).backgroundColor };
    });
    check(colors.card === "rgb(254, 243, 199)" && !colors.badge.startsWith("rgb(228"), `education ${JSON.stringify(colors)}`);
    return { phoneRow: m, education: colors };
  });
};
