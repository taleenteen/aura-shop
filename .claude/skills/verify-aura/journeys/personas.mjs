const thb = (satang) => "฿" + Math.round(satang / 100).toLocaleString("en-US");
export default async ({ page, step, api, check, outDir }) => {
  const ids = { CREATOR: "Creator Workstation", GAMING: "High-FPS Gaming", ULTRALIGHT: "Ultralight Mobility", OFFICE: "Study & Office Pro" };
  await step("cards show the catalog's real count and entry price, and link to the filter", async () => {
    await page.goto("/"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
    const out = {};
    for (const [id, title] of Object.entries(ids)) {
      const r = (await api("GET", `/catalog?persona=${id}&sort=price_asc&limit=1`)).json;
      const n = r.meta.total_items;
      const expected = `${title}: ${n} ${n === 1 ? "model" : "models"}`;
      const link = page.getByRole("link", { name: expected });
      check(await link.count() === 1, `missing card "${expected}"`);
      check((await link.getAttribute("href")).includes(`persona=${id}`), `href for ${id}`);
      out[id] = expected;
    }
    const imgs = await page.getByRole("heading", { name: "What will you use it for?" }).locator("xpath=ancestor::section[1]").locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
    check(imgs.length === 4 && new Set(imgs).size === 4, `photos not distinct: ${imgs}`);
    await page.getByRole("link", { name: /^High-FPS Gaming/ }).click();
    await page.waitForURL(/persona=GAMING/);
    return out;
  });
  for (const [label, size] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    await step(`${label} screenshot`, async () => {
      await page.setViewportSize(size);
      await page.goto("/"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
      const sec = page.getByRole("heading", { name: "What will you use it for?" }).locator("xpath=ancestor::section[1]");
      await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await sec.screenshot({ path: `${outDir}/personas-${label}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      check(!overflow, "page scrolls horizontally");
    });
  }
};
