// Seeds orders through the real API (cart -> reserve -> pay), backdates some, then checks the
// dashboard against figures computed independently in SQL.
const thb = (satang) => "฿" + Math.round(satang / 100).toLocaleString("en-US");
const PAID = "status not in ('PENDING_PAYMENT','CANCELLED')";
const TODAY_BKK = "(date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')";

export default async ({ page, step, api, sql, check, base }) => {
  const admin = (await api("POST", "/auth/login", { email: "admin@auratech.co.th", password: "password123" })).json.data.token;
  const variant = (sku) => sql(`select id from product_variants where sku='${sku}'`);
  async function order(sku, qty, pay) {
    const guest = "guest_dash_" + Math.random().toString(36).slice(2);
    const h = { "Content-Type": "application/json", "X-Guest-Session-ID": guest };
    const call = (m, p, b) => fetch(`${base}/api/v1${p}`, { method: m, headers: h, body: b && JSON.stringify(b) }).then((r) => r.json());
    await call("POST", "/cart/items", { variant_id: variant(sku), quantity: qty });
    const res = await call("POST", "/checkout/reserve", {
      customer_email: "dash@example.com", payment_method: "PROMPTPAY_QR",
      shipping_address: { recipient_name: "D", phone: "0", address_line_1: "1", district: "x", province: "Bangkok", postal_code: "10110" },
    });
    if (!res.success) throw new Error("reserve failed: " + JSON.stringify(res.error));
    const num = res.data.order_number;
    if (pay) {
      const p = await call("POST", "/checkout/pay", { order_number: num, payment_method: "PROMPTPAY_QR" });
      if (!p.success) throw new Error("pay failed: " + JSON.stringify(p.error));
    }
    return num;
  }
  const skus = sql(`select v.sku, c.name from product_variants v join products p on p.id=v.product_id join categories c on c.id=p.category_id where v.stock_quantity - v.reserved_stock >= 3 order by v.price`)
    .split("\n").map((l) => l.split("\t"));
  const cheap = skus[0][0];
  const other = skus.find(([, cat]) => cat !== skus[0][1])[0];

  await step("seed: 3 paid today, 1 paid 3 days ago, 1 paid 40 days ago, 1 pending, 1 cancelled", async () => {
    const a = await order(cheap, 2, true), b = await order(other, 1, true), c = await order(cheap, 1, true);
    const d = await order(other, 1, true), e = await order(cheap, 1, true);
    const pending = await order(cheap, 1, false), cancelled = await order(other, 1, false);
    sql(`update orders set created_at = now() - interval '3 days' where order_number='${d}'`);
    sql(`update orders set created_at = now() - interval '40 days' where order_number='${e}'`);
    const id = sql(`select id from orders where order_number='${cancelled}'`);
    const r = await api("PATCH", `/admin/orders/${id}/status`, { status: "CANCELLED" }, admin);
    check(r.status === 200, r.text);
    return { cheap, other, paid: [a, b, c, d, e].length, pending, cancelled };
  });

  const ov = (await api("GET", "/admin/overview", null, admin)).json.data;
  const q = (s) => Number(sql(s));

  await step("API totals match independent SQL", async () => {
    const exp = {
      total: q(`select coalesce(sum(grand_total),0) from orders where ${PAID}`),
      paidCount: q(`select count(*) from orders where ${PAID}`),
      all: q(`select count(*) from orders`),
      last30: q(`select coalesce(sum(grand_total),0) from orders where ${PAID} and created_at >= ${TODAY_BKK} - interval '29 days'`),
      prev30: q(`select coalesce(sum(grand_total),0) from orders where ${PAID} and created_at >= ${TODAY_BKK} - interval '59 days' and created_at < ${TODAY_BKK} - interval '29 days'`),
    };
    const got = { total: ov.total_revenue_satang, paidCount: ov.paid_orders_count, all: ov.total_orders_count, last30: ov.revenue_30d_satang, prev30: ov.revenue_prev_30d_satang };
    check(JSON.stringify(exp) === JSON.stringify(got), `expected ${JSON.stringify(exp)} got ${JSON.stringify(got)}`);
    check(got.prev30 > 0, "40-day-old order should land in the previous 30 days");
    return got;
  });

  await step("daily buckets: 7 days, zero-filled, match SQL per day", async () => {
    check(ov.daily_revenue.length === 7, `len ${ov.daily_revenue.length}`);
    const rows = sql(`select to_char(created_at at time zone 'Asia/Bangkok','YYYY-MM-DD'), sum(grand_total), count(*) from orders where ${PAID} and created_at >= ${TODAY_BKK} - interval '6 days' group by 1`)
      .split("\n").filter(Boolean).map((l) => l.split("\t"));
    for (const [day, rev, n] of rows) {
      const b = ov.daily_revenue.find((d) => d.date === day);
      check(b && b.revenue_satang === Number(rev) && b.orders === Number(n), `${day}: ${JSON.stringify(b)} vs ${rev}/${n}`);
    }
    const nonZero = ov.daily_revenue.filter((d) => d.revenue_satang > 0).length;
    check(nonZero === rows.length && nonZero === 2, `non-zero days ${nonZero}, sql days ${rows.length}`);
    return ov.daily_revenue.map((d) => `${d.date}:${d.orders}`).join(" ");
  });

  await step("category revenue matches SQL", async () => {
    const exp = sql(`select c.name, sum(oi.unit_price*oi.quantity), sum(oi.quantity) from order_items oi join orders o on o.id=oi.order_id join product_variants v on v.id=oi.variant_id join products p on p.id=v.product_id join categories c on c.id=p.category_id where o.${PAID} group by 1 order by 2 desc`)
      .split("\n").map((l) => l.split("\t"));
    check(exp.length === ov.category_revenue.length, `count ${exp.length} vs ${ov.category_revenue.length}`);
    exp.forEach(([name, rev, units], i) => {
      const g = ov.category_revenue[i];
      check(g.category === name && g.revenue_satang === Number(rev) && g.units === Number(units), `row ${i}: ${JSON.stringify(g)} vs ${name}/${rev}/${units}`);
    });
    return ov.category_revenue.map((c) => `${c.category} ${thb(c.revenue_satang)} x${c.units}`);
  });

  await step("dashboard shows the real figures and none of the old placeholders", async () => {
    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("aura_jwt_token", t), admin);
    await page.goto("/admin"); await page.waitForLoadState("networkidle");
    const text = await page.locator("main").innerText();
    for (const bad of ["Live Feed", "Catalog Balanced", "18.4%", "4 Major Segments", "Peak Day: Saturday"]) check(!text.includes(bad), `still shows "${bad}"`);
    check(text.includes(thb(ov.total_revenue_satang)), `total ${thb(ov.total_revenue_satang)} not shown`);
    const pct = (((ov.revenue_30d_satang - ov.revenue_prev_30d_satang) / ov.revenue_prev_30d_satang) * 100).toFixed(1);
    check(text.includes(`${pct}% last 30 days vs previous 30`), `trend ${pct}% not shown`);
    check(text.includes(`${ov.paid_orders_count} paid`), "paid count");
    const aov = thb(Math.round(ov.total_revenue_satang / ov.paid_orders_count));
    check(text.includes(aov), `AOV ${aov} not shown`);
    for (const c of ov.category_revenue) check(text.includes(c.category), `category ${c.category}`);
    const bars = await page.getByRole("list", { name: "Paid revenue per day" }).getByRole("listitem").count();
    check(bars === 7, `bars ${bars}`);
    return { trend: `${pct}%`, aov };
  });
};
