// Invariant: every facet option shown is non-zero (unless selected) and ticking it returns
// exactly the count it advertised.
const GROUPS = { personas: "persona", brands: "brand", cpu_family: "cpu", ram: "ram", storage: "storage" };
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();

export default async ({ page, step, api, check, outDir }) => {
  const catalog = async (f) => (await api("GET", `/catalog?${qs({ ...f, limit: 100 })}`)).json;

  const contexts = [
    {}, { category: "ultrabooks" }, { category: "mac" }, { category: "mac", brand: "apple" },
    { persona: "GAMING" }, { category: "mac", ram: 16 }, { brand: "apple" }, { cpu: "Apple M4" },
  ];
  for (const ctx of contexts) {
    await step(`counts are exact for ${JSON.stringify(ctx)}`, async () => {
      const res = await catalog(ctx);
      const facets = res.meta.facets;
      const checked = [];
      for (const [group, param] of Object.entries(GROUPS)) {
        for (const opt of facets[group]) {
          const selected = String(ctx[param] ?? "").toLowerCase() === String(opt.value).toLowerCase();
          check(opt.count > 0 || selected, `${group} "${opt.value}" shown with 0 in ${JSON.stringify(ctx)}`);
          const got = (await catalog({ ...ctx, [param]: opt.value })).meta.total_items;
          check(got === opt.count, `${group} "${opt.value}" says ${opt.count}, ticking returns ${got}`);
          checked.push(`${opt.value}:${opt.count}`);
        }
      }
      const prices = res.data.map((p) => p.base_price);
      if (prices.length) check(facets.price_range.min_satang <= Math.min(...prices) && facets.price_range.max_satang >= Math.max(...prices), "price range");
      return checked.join(" ");
    });
  }

  await step("Ultrabooks lists only Ultrabook processors; Apple M4 no longer counts M4 Pro", async () => {
    const ultra = (await catalog({ category: "ultrabooks" })).meta.facets;
    check(ultra.cpu_family.every((o) => !o.value.startsWith("Apple")), `ultrabook cpus ${ultra.cpu_family.map((o) => o.value)}`);
    const all = (await catalog({})).meta.facets.cpu_family;
    const m4 = all.find((o) => o.value === "Apple M4"), m4pro = all.find((o) => o.value === "Apple M4 Pro");
    check(m4 && m4pro && m4.count === 1 && m4pro.count === 1, `M4 ${m4?.count} M4 Pro ${m4pro?.count}`);
    check(!all.some((o) => /Cortex|Display Engine/.test(o.value)), "non-computer CPUs listed");
    return { ultrabookCpus: ultra.cpu_family.map((o) => `${o.value}(${o.count})`), allCpus: all.map((o) => `${o.value}(${o.count})`) };
  });
  await step("picking a brand keeps the other brands visible to switch", async () => {
    const f = (await catalog({ brand: "apple" })).meta.facets.brands;
    check(f.length > 1 && f.some((o) => o.value === "apple"), `brands ${f.map((o) => o.value)}`);
    return f.map((o) => `${o.value}(${o.count})`);
  });
  await step("UI: Ultrabooks sidebar shows no Apple processors and no (0) entries", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/catalog?category=ultrabooks"); await page.waitForLoadState("networkidle");
    const sideEl = page.locator("aside").filter({ hasText: "Filters & Facets" }).first();
    await sideEl.screenshot({ path: `${outDir}/ultrabooks-sidebar.png` });
    const side = await sideEl.innerText();
    check(side.includes("Intel Core Ultra 7"), "expected the ultrabook CPU");
    check(!side.includes("Apple M4") && !side.includes("(0)"), side.replace(/\s+/g, " "));
    return side.replace(/\s+/g, " ").slice(0, 300);
  });
  await step("phone sheet: page visible beside it, tap outside closes, Escape closes", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalog"); await page.waitForLoadState("networkidle");
    const open = async () => { await page.getByRole("button", { name: /Filters/ }).first().click(); await page.getByRole("dialog", { name: "Filter products" }).waitFor(); await page.waitForTimeout(500); };
    await open();
    const sheet = page.getByRole("heading", { name: "Filter Hardware Inventory" }).locator("xpath=ancestor::div[contains(@class,'inset-y-0')][1]");
    const box = await sheet.boundingBox();
    const backdrop = await page.getByRole("dialog").locator("> div").first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter }));
    check(box.x >= 40, `sheet leaves ${box.x}px of page`);
    check(backdrop.bg.includes("/ 0.4") && (backdrop.blur === "none" || backdrop.blur === ""), JSON.stringify(backdrop));
    await page.screenshot({ path: `${outDir}/phone-sheet.png` });
    await page.mouse.click(Math.floor(box.x / 2), 420); await page.getByRole("dialog", { name: "Filter products" }).waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    check(await page.getByRole("dialog", { name: "Filter products" }).count() === 0, "outside tap did not close");
    await open(); await page.keyboard.press("Escape"); await page.getByRole("dialog", { name: "Filter products" }).waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    check(await page.getByRole("dialog", { name: "Filter products" }).count() === 0, "Escape did not close");
    return { sheetX: box.x, backdrop };
  });
};
