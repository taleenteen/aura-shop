const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const RUN = Date.now().toString(36).toUpperCase();
const NAME = `Aura Test Book ${RUN}`;
const SLUG = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default async ({ page, step, api, sql, check, base }) => {
  const token = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const admin = (m, p, b) => api(m, p, b, token);
  let productId, v1, v2;

  await step("API rejects a bad product with a message per field", async () => {
    const r = await admin("POST", "/admin/products", { name: "x", category_id: "00000000-0000-0000-0000-000000000000", brand_id: "00000000-0000-0000-0000-000000000000", variants: [{ sku: "a", color_hex: "red", price: 0 }] });
    check(r.status === 400 && r.json.error.code === "VALIDATION_FAILED", `${r.status} ${r.text}`);
    const f = r.json.error.fields;
    for (const k of ["name", "category_id", "brand_id", "variants.0.sku", "variants.0.color_hex", "variants.0.price", "variants.0.color_name"]) check(f[k], `missing ${k}: ${JSON.stringify(f)}`);
    const unknown = await admin("POST", "/admin/products", { name: "Typo Product", nmae: "oops" });
    check(unknown.status === 400, "unknown fields must be rejected");
    return Object.keys(f);
  });

  await step("create a product in the editor with two variants, an uploaded image and opening stock", async () => {
    await page.goto("/"); await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), token);
    await page.goto("/admin?tab=products"); await page.waitForLoadState("networkidle");
    check(await page.getByRole("link", { name: "Products & Stock" }).getAttribute("aria-current") === "page", "Products tab not active");
    await page.getByRole("button", { name: "New product" }).click();
    await page.getByLabel("Name", { exact: true }).fill(NAME);
    check(await page.getByLabel("URL", { exact: true }).inputValue() === SLUG, "slug not generated from name");
    await page.getByLabel("Category").selectOption({ label: "Ultrabooks & Slim" }).catch(async () => page.getByLabel("Category").selectOption({ index: 2 }));
    await page.getByLabel("Brand").selectOption({ label: "Lenovo" });
    await page.getByRole("button", { name: "Office & Study" }).click();
    await page.getByLabel(/On sale/).check();
    const v = page.getByRole("group", { name: "Variant 1" });
    await v.getByLabel("Colour name").fill("Graphite");
    await v.getByLabel("SKU").fill(`TB-${RUN}-16`);
    await v.getByLabel("Price (฿)", { exact: true }).fill("32990");
    await v.getByLabel("Processor family").fill("Intel Core Ultra 7");
    await v.getByLabel("Memory").selectOption("16");
    await v.getByLabel("Storage").selectOption("512");
    await v.getByLabel("Opening stock for variant 1").fill("5");
    await v.getByLabel("Upload images for variant 1").setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
    await v.getByRole("img", { name: "Variant 1 image 1" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Add variant" }).click();
    const w = page.getByRole("group", { name: "Variant 2" });
    await w.getByLabel("Colour name").fill("Silver");
    await w.getByLabel("SKU").fill(`TB-${RUN}-32`);
    await w.getByLabel("Price (฿)", { exact: true }).fill("38990");
    await w.getByLabel("Memory").selectOption("32");
    await page.getByRole("button", { name: "Create product" }).click();
    await page.waitForURL(/edit=[0-9a-f-]{36}/);
    await page.getByText("Product created.").waitFor();
    productId = new URL(page.url()).searchParams.get("edit");
    const p = (await admin("GET", `/admin/products/${productId}`)).json.data;
    v1 = p.variants.find((x) => x.sku.endsWith("-16")); v2 = p.variants.find((x) => x.sku.endsWith("-32"));
    check(p.slug === SLUG && p.is_active && p.base_price === 3299000, `product ${JSON.stringify({ slug: p.slug, active: p.is_active, base: p.base_price })}`);
    check(v1.stock_quantity === 5 && v2.stock_quantity === 0 && v1.specs.ram_gb === 16 && v1.specs.cpu_family === "Intel Core Ultra 7", "variant data");
    const img = await fetch(v1.images[0]);
    check(img.status === 200 && (img.headers.get("content-type") || "").includes("image/png"), `image ${v1.images[0]} -> ${img.status}`);
    return { productId, image: v1.images[0] };
  });

  await step("new product is live: catalog filter and product page", async () => {
    const c = (await api("GET", `/catalog?q=&category=ultrabooks&cpu=Intel%20Core%20Ultra%207&ram=16&limit=50`)).json;
    check(c.data.some((p) => p.slug === SLUG), "not in filtered catalog");
    await page.goto(`/products/${SLUG}`); await page.waitForLoadState("networkidle");
    check(await page.getByRole("heading", { name: NAME, level: 1 }).count() === 1, "product page");
  });

  await step("stock: receive, write-off needs a note, count correction; history explains it", async () => {
    await page.goto(`/admin?tab=products&edit=${productId}`); await page.waitForLoadState("networkidle");
    await page.getByRole("group", { name: "Variant 1" }).getByRole("button", { name: "Adjust stock" }).click();
    const d = page.getByRole("dialog", { name: `Stock for ${v1.sku}` });
    await d.getByLabel("Reason").selectOption("RECEIVE");
    await d.getByLabel("Units to add").fill("7");
    check(await d.getByText("In stock 5 → 12 (+7)").count() === 1, "preview");
    await d.getByRole("button", { name: "Update stock" }).click(); await d.getByText("Stock is now 12 (+7).").waitFor();
    await d.getByLabel("Reason").selectOption("DAMAGE");
    await d.getByLabel("Units to write off").fill("2");
    await d.getByRole("button", { name: "Update stock" }).click(); await page.waitForTimeout(500);
    check((await d.getByRole("alert").innerText()).length > 0 && await d.getByText(/short note/).count() === 1, "write-off without note must be refused");
    await d.getByLabel(/^Note/).fill("Dropped in warehouse");
    await d.getByRole("button", { name: "Update stock" }).click(); await d.getByText("Stock is now 10 (-2).").waitFor();
    await d.getByLabel("Reason").selectOption("COUNT");
    await d.getByLabel("Counted units on the shelf").fill("9");
    await d.getByLabel(/^Note/).fill("Monthly count");
    await d.getByRole("button", { name: "Update stock" }).click(); await d.getByText("Stock is now 9 (-1).").waitFor();
    const hist = await d.locator("ul li").allInnerTexts();
    check(hist.length === 4 && /Stock count correction/.test(hist[0]) && /Opening stock/.test(hist[3]), `history ${JSON.stringify(hist)}`);
    await d.getByRole("button", { name: "Close" }).click();
    check(await page.getByRole("group", { name: "Variant 1" }).getByText(/Stock\s*9/).count() >= 1, "card shows new stock");
    const ledger = sql(`select string_agg(reason || ':' || delta || '>' || stock_after, ' ' order by created_at) from stock_movements where variant_id='${v1.id}'`);
    check(ledger === "INITIAL:5>5 RECEIVE:7>12 DAMAGE:-2>10 COUNT:-1>9", ledger);
    return ledger;
  });

  await step("stale stock is refused; stock cannot drop below units held in checkout", async () => {
    const stale = await admin("POST", `/admin/variants/${v1.id}/stock-adjustments`, { mode: "delta", quantity: 1, reason: "RECEIVE", expected_stock: 5 });
    check(stale.status === 409 && stale.json.error.code === "STOCK_CHANGED", stale.text);
    const guest = { "X-Guest-Session-ID": "guest_stock_" + RUN, "Content-Type": "application/json" };
    const call = (m, p, b) => fetch(`${base}/api/v1${p}`, { method: m, headers: guest, body: b && JSON.stringify(b) }).then((r) => r.json());
    await call("POST", "/cart/items", { variant_id: v1.id, quantity: 2 });
    const res = await call("POST", "/checkout/reserve", { customer_email: "s@example.com", payment_method: "PROMPTPAY_QR", shipping_address: { recipient_name: "S", phone: "0", address_line_1: "1", district: "x", province: "Bangkok", postal_code: "10110" } });
    const low = await admin("POST", `/admin/variants/${v1.id}/stock-adjustments`, { mode: "set", quantity: 1, reason: "COUNT", note: "x", expected_stock: 9 });
    check(low.status === 400 && /held in checkout/.test(low.json.error.message), low.text);
    const paid = await call("POST", "/checkout/pay", { order_number: res.data.order_number, payment_method: "PROMPTPAY_QR" });
    check(paid.success, JSON.stringify(paid));
    const sale = sql(`select reason || ':' || delta || '>' || stock_after || ':' || note from stock_movements where variant_id='${v1.id}' order by created_at desc limit 1`);
    check(sale === `SALE:-2>7:${res.data.order_number}`, sale);
    return sale;
  });

  await step("edit: price change and removing an unused variant save; removing an ordered variant is refused", async () => {
    await page.goto(`/admin?tab=products&edit=${productId}`); await page.waitForLoadState("networkidle");
    await page.getByRole("group", { name: "Variant 2" }).getByLabel("Price (฿)", { exact: true }).fill("36990");
    await page.getByRole("button", { name: "Remove variant 2" }).click();
    await page.getByRole("button", { name: "Save changes" }).click(); await page.getByText("Changes saved.").waitFor();
    let p = (await admin("GET", `/admin/products/${productId}`)).json.data;
    check(p.variants.length === 1, `variants ${p.variants.length}`);
    // Put the second variant back, then try to remove the ordered one.
    await page.getByRole("button", { name: "Add variant" }).click();
    const w = page.getByRole("group", { name: "Variant 2" });
    await w.getByLabel("Colour name").fill("Silver"); await w.getByLabel("SKU").fill(`TB-${RUN}-32B`); await w.getByLabel("Price (฿)", { exact: true }).fill("36990");
    await page.getByRole("button", { name: "Save changes" }).click(); await page.getByText("Changes saved.").waitFor();
    await page.getByRole("button", { name: "Remove variant 1" }).click();
    await page.getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(800);
    const msg = await page.getByRole("alert").first().innerText();
    check(/appears in 1 order/.test(msg) && !/variant is in use/.test(msg), `in-use message: ${msg}`);
    p = (await admin("GET", `/admin/products/${productId}`)).json.data;
    check(p.variants.length === 2 && p.base_price === 3299000, `after refused removal ${p.variants.length} / ${p.base_price}`);
    return msg;
  });

  const shopper = { "X-Guest-Session-ID": "guest_hidden_" + RUN, "Content-Type": "application/json" };
  const shop = (m, p, b) => fetch(`${base}/api/v1${p}`, { method: m, headers: shopper, body: b && JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  await step("a shopper puts the product in their bag (before it is hidden)", async () => {
    const r = await shop("POST", "/cart/items", { variant_id: v1.id, quantity: 1 });
    check(r.status === 200 || r.status === 201, JSON.stringify(r.json));
  });
  await step("hide from the list: product leaves the catalog", async () => {
    await page.goto("/admin?tab=products"); await page.waitForLoadState("networkidle");
    await page.getByLabel("Search products").fill(RUN); await page.waitForTimeout(700); await page.waitForLoadState("networkidle");
    await page.getByRole("switch", { name: `Hide: ${NAME}` }).click(); await page.waitForTimeout(600);
    check(await page.getByRole("switch", { name: `Put on sale: ${NAME}` }).count() === 1, "switch state");
    const c = (await api("GET", "/catalog?limit=100")).json.data;
    check(!c.some((p) => p.slug === SLUG), "hidden product still in catalog");
  });
  await step("hidden product cannot be bought: bag shows it unavailable, add and checkout refused", async () => {
    const cart = await shop("GET", "/cart");
    const line = cart.json.data.items.find((i) => i.variant_id === v1.id);
    check(line && line.available_stock === 0, `bag line ${JSON.stringify(line)}`);
    const add = await shop("POST", "/cart/items", { variant_id: v1.id, quantity: 1 });
    check(add.status === 409 && add.json.error.code === "PRODUCT_UNAVAILABLE", JSON.stringify(add.json));
    const res = await shop("POST", "/checkout/reserve", { customer_email: "h@example.com", payment_method: "PROMPTPAY_QR", shipping_address: { recipient_name: "H", phone: "0", address_line_1: "1", district: "x", province: "Bangkok", postal_code: "10110" } });
    check(res.status === 409 && res.json.error.code === "PRODUCT_UNAVAILABLE", JSON.stringify(res.json));
    return res.json.error.message;
  });

  await step("non-image upload is rejected with a clear message", async () => {
    await page.goto(`/admin?tab=products&edit=${productId}`); await page.waitForLoadState("networkidle");
    await page.getByLabel("Upload images for variant 1").setInputFiles({ name: "notes.txt", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.getByText(/notes\.txt: Only PNG, JPEG or WebP images\./).waitFor({ timeout: 5000 });
  });

  await step("dashboard Restock link opens the product editor", async () => {
    await page.goto("/admin"); await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: "Restock" }).first();
    const href = await link.getAttribute("href");
    check(/tab=products/.test(href) && /edit=/.test(href), href);
    await link.click(); await page.waitForURL(/edit=/); await page.getByRole("button", { name: "Save changes" }).waitFor();
  });
};
