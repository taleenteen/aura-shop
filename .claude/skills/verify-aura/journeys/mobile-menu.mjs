// Phone hamburger drawer: full height with a solid panel, outside tap and Escape close it.
export default async ({ page, step, check, outDir }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const open = async () => {
    await page.getByRole("button", { name: /menu/i }).first().click();
    await page.waitForTimeout(600);
  };
  const drawer = () => page.getByRole("dialog", { name: "Main menu" });
  await step("drawer covers the full height with a solid panel", async () => {
    await page.goto("/catalog"); await page.waitForLoadState("networkidle");
    await open();
    await page.screenshot({ path: `${outDir}/menu-open.png` });
    check(await page.getByRole("banner").getByRole("button", { name: "Search" }).count() === 1 && await page.getByRole("banner").getByRole("button", { name: "Sign In" }).count() === 1, "icon buttons need names");
    const panel = page.getByRole("link", { name: "All Products" }).last().locator("xpath=ancestor::div[contains(@class,'inset-y-0')][1]");
    const box = await panel.boundingBox();
    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    check(box && box.height >= 840 && box.x === 0, `panel box ${JSON.stringify(box)}`);
    check(bg === "rgb(255, 255, 255)", `panel background ${bg}`);
    return { box, bg };
  });
  await step("tap outside the drawer closes it", async () => {
    const panel = page.getByRole("link", { name: "All Products" }).last().locator("xpath=ancestor::div[contains(@class,'inset-y-0')][1]");
    const box = await panel.boundingBox();
    await page.mouse.click(Math.floor(box.x + box.width + (390 - box.x - box.width) / 2), 600);
    await drawer().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    check(await drawer().count() === 0, "drawer still open after outside tap");
  });
  await step("Escape closes it; a link navigates and closes it", async () => {
    await open(); await page.keyboard.press("Escape"); await drawer().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    check(await drawer().count() === 0, "Escape did not close");
    await open();
    await drawer().getByRole("link", { name: "Gaming" }).click();
    await page.waitForURL(/category=gaming-laptops/); await drawer().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    check(await drawer().count() === 0, "drawer still open after navigating");
  });
};
