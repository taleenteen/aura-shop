---
name: verify-aura
description: Run browser user-journey tests (Playwright) against an isolated copy of the AURA Tech stack: its own Postgres, MinIO, API and Vite web server, so the developer's data is never touched. Use ONLY when the user explicitly asks to run journeys, user-journey tests, end-to-end/browser tests, or to "verify in the browser". Do not run it automatically after changes; it is slow.
---

# verify-aura

Drives the real app in a headless Chrome/Edge (system browser via `playwright-core`) and keeps
screenshots, ARIA snapshots, console logs and API traffic as evidence for every step.

**Only run this when the user asks.** For routine changes, verify with `go build/vet/test`,
`npx tsc --noEmit` and `npm run build` instead.

## Setup (once per machine)

```bash
cd .claude/skills/verify-aura/harness && npm install
```

Needs Docker running, Go, Node, and Chrome or Edge installed.

## Commands

All commands run from the repo root:

```bash
H=.claude/skills/verify-aura/harness/verify-aura.mjs
node $H up                       # start isolated stack; prints READY with URLs (web :15173, api :18080)
node $H journey order-lifecycle  # run journeys/order-lifecycle.mjs
node $H journey path/to/x.mjs    # run any journey file
node $H snapshot /catalog        # ARIA snapshot + screenshot of one page
node $H api GET /orders/lookup   # call the isolated API (env VERIFY_TOKEN, VERIFY_GUEST)
node $H sql "select count(*) from orders"
node $H doctor                   # is the run healthy?
node $H down                     # tear down; evidence is kept
```

Evidence lands in `.verify-aura/evidence/<run>/<journey>-<ts>/` (gitignored): one PNG and
`.aria.yml` per step, plus `console.log`, `network.json` and `result.json`. Read the PNGs to check
layout; the assertions only check behaviour.

`up` rebuilds the API from the working tree, so restart (`down` then `up`) after backend changes.
Frontend changes hot-reload.

## Journeys (`journeys/`)

| Journey | Covers |
|---|---|
| `order-lifecycle` | Reserve → reload resumes payment → cancel (items back in bag, cancel email) → email CTA opens bag → PromptPay pay → confirmation email → order lookup from another browser (wrong email rejected, read-only) → saved address at checkout → "Complete payment" from My Orders → expired hold redirects |
| `cart-badge` | Navbar bag count clears as soon as stock is locked, stays clear after paying |
| `account-and-home` | Wishlist guest→account merge, profile save, My Orders tabs, phone home layout |
| `storefront-fixes-1..3` | Earlier UX fixes: search shortcut, filter tabs, labels, footer links, etc. |
| `catalog-facets` | Filters only offer options matching the current selection |
| `personas` | Persona quick links |
| `mobile-menu` | Phone menu drawer fills the screen and closes on outside tap |
| `admin-dashboard` | Overview figures come from real orders |
| `admin-products` | Product create/edit, variants, image upload, stock adjustments and ledger |
| `shipping-and-passwords` | Admin ships with carrier + tracking (required), customer tracking page, shipped email → parcel timeline, forgot password → in-app email → reset → signed in, change password, admin accounts get no reset email |
| `banners-and-taxonomy` | Banner field errors, ribbon link validation, schedule order, on/off and delete reflected on the storefront; category menu label in the navbar, slug errors, in-use delete blocked, brand slug clash |
| `alerts-and-reviews` | Sold-out sign-in prompt, "email me when it's back", restock → inbox email → exact option; reviews need a delivered order, star validation, short author name, admin hide |
| `forms-and-import` | zod errors under fields (sign-up, checkout postal/phone, expired card), template download, CSV preview (new / update / same name), keep a current value, add a same-name product as new |

Run the whole suite (about 10 minutes):

```bash
for j in order-lifecycle cart-badge account-and-home storefront-fixes-1 storefront-fixes-2 storefront-fixes-3 catalog-facets personas mobile-menu admin-dashboard admin-products shipping-and-passwords banners-and-taxonomy alerts-and-reviews forms-and-import; do node $H journey $j; done
```


## Writing a journey

A journey is an ES module whose default export receives
`{ page, context, step, api, sql, check, base, outDir }`:

```js
export default async ({ page, step, check, sql }) => {
  await step("add to bag", async () => {
    await page.goto("/products/macbook-air-13-m3");
    await page.getByRole("button", { name: "Add to Bag" }).click();
    check(sql("select count(*) from cart_items") !== "0", "row saved");
    return "optional value shown in the log";
  });
};
```

- Prefer role/label locators; use `{ exact: true }` when text can repeat (e.g. "Ref: AURA-…").
- Wait for the element you assert on (`waitFor()`), not for `networkidle`, to avoid races.
- Use unique emails per run (`Date.now()`); the database persists across journeys within a run.
- `context.browser().newContext({ baseURL: base })` gives a second, separate browser.

## Gotchas

- Journeys buy real stock and change shared accounts (the demo customer) in the isolated DB, so
  write steps that still pass on a second run (unique names, `Date.now()`). After many runs the
  default MacBook Air variant
  sells out (every unit held by pending orders) and "Add to Bag" disappears. Restock:
  `node $H sql "update product_variants set stock_quantity = 60 where sku like 'MBA13-M3-%'"`.
- Payments are simulated: PromptPay confirms with "I've completed the transfer"; cards ending
  in `0000` are declined.
- The seeded admin is `admin@auratech.co.th` / `password123`.
