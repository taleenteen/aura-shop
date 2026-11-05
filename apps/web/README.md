# AURA TECH Web

React 19 · Vite 6 · TanStack Router · Zustand · Tailwind CSS 4 · Motion

[ภาษาไทย](#ภาษาไทย) · [English](#english)

---

## ภาษาไทย

### การรัน
```bash
npm install
npm run dev          # http://localhost:5173
npx tsc --noEmit     # ตรวจ type
npm run build        # build production ไปที่ dist/
```

### ตัวแปรสภาพแวดล้อม
| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api/v1` | ที่อยู่ API |
| `VITE_DEMO_MODE` | ไม่ตั้ง | `true` = แสดงเครื่องมือสาธิต (ปุ่มล็อกอินบัญชีทดลองในหน้าล็อกอินและหลังบ้าน) ใน build production ตอน `npm run dev` แสดงเสมอ |

### หน้า (route)
| Path | หน้า | ไฟล์ |
|---|---|---|
| `/` | หน้าแรก | `features/landing` |
| `/catalog` | รายการสินค้า ตัวกรองอยู่ใน URL | `features/catalog` |
| `/products/:slug` | หน้าสินค้า | `features/configurator` |
| `/wishlist` | รายการโปรด | `features/wishlist` |
| `/checkout` | ที่อยู่ → จองสต็อก → จ่ายเงิน | `features/checkout` |
| `/orders/:orderNumber` | ใบเสร็จ | `features/checkout` |
| `/account?tab=orders\|profile` | คำสั่งซื้อและโปรไฟล์ | `features/account` |
| `/admin?tab=…` | หลังบ้าน: `overview`, `products` (`&edit=<id\|new>`), `orders`, `banners` | `features/admin` |

route ประกาศไว้ใน `src/app/router.tsx`

### ข้อมูลและ state
| ที่เก็บ | อยู่ที่ | ข้อมูล | มาจาก API |
|---|---|---|---|
| `auth-store` | Zustand | ผู้ใช้ที่ล็อกอิน, token | `/auth/login`, `/auth/register`, `/auth/me` (กู้ session ตอนเปิดแอป) |
| `cart-store` | Zustand | รายการในตะกร้า, ยอดรวม | `/cart` |
| `wishlist-store` | Zustand | id สินค้าที่กดใจ | `/wishlist`, `/wishlist/toggle` |
| `compare-store` | Zustand | slug ที่จะเปรียบเทียบ (สูงสุด 3) | `/products/compare` |
| `ui-store` | Zustand | เปิด/ปิด drawer, modal, ช่องค้นหา | — |
| `localStorage` | เบราว์เซอร์ | `aura_jwt_token`, `aura_guest_session_id` | ล้างทั้งหมดตอน sign out (`lib/session.ts`) |
| URL | router | ตัวกรอง catalog, แท็บ account/admin | — |

ข้อมูลอื่นดึงในหน้าที่ใช้โดยตรงผ่าน `lib/api-client.ts`:
- `apiClient` ส่ง JWT และ guest id ให้อัตโนมัติ ถ้า error จะมี `code` และ `fields` (error ราย field)
- `apiUpload` ใช้อัปโหลดไฟล์

### รูปแบบข้อมูล
- type ทั้งหมดอยู่ที่ `src/types/api.ts` ตรงกับ DTO ของ backend
- **เงินเป็นสตางค์** แสดงผลด้วย `formatTHB()` ใน `lib/currency.ts`
- สถานะ order ที่เปลี่ยนได้มาจาก backend (`allowed_transitions`) หน้าเว็บไม่ได้กำหนดเอง

### ฟอร์ม
- ทุกฟอร์มตรวจข้อมูลด้วย **zod**: ประกาศ schema ไว้ในไฟล์ของฟอร์ม แล้วเรียก `validate(schema, values)` จาก `lib/validation.ts` ก่อนส่ง
- error ใช้ key เดียวกับ backend (`email`, `variants.0.sku`) จึงเก็บ error ของ zod และของ API (`error.fields`) ไว้ใน state เดียวกันแล้วแสดงใต้ช่องนั้นได้เลย
- กฎที่ใช้ซ้ำ (อีเมล รหัสผ่าน ลิงก์ slug) อยู่ใน `lib/validation.ts` และต้องตรงกับฝั่ง backend เสมอ backend ยังตรวจซ้ำทุกครั้ง
- ใส่ `noValidate` ที่ `<form>` เพื่อให้ข้อความ error มาจาก zod แทน browser

---

## English

### Running
```bash
npm install
npm run dev          # http://localhost:5173
npx tsc --noEmit     # type check
npm run build        # production build into dist/
```

### Environment
| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api/v1` | API location |
| `VITE_DEMO_MODE` | unset | `true` shows demo helpers (demo-account sign-in buttons on the sign-in modal and admin console) in a production build; `npm run dev` always shows them |

### Routes
| Path | Page | Code |
|---|---|---|
| `/` | Home | `features/landing` |
| `/catalog` | Catalog; filters live in the URL | `features/catalog` |
| `/products/:slug` | Product page | `features/configurator` |
| `/wishlist` | Wishlist | `features/wishlist` |
| `/checkout` | Address → stock hold → payment | `features/checkout` |
| `/orders/:orderNumber` | Receipt | `features/checkout` |
| `/account?tab=orders\|profile` | Orders and profile | `features/account` |
| `/admin?tab=…` | Backoffice: `overview`, `products` (`&edit=<id\|new>`), `orders`, `banners` | `features/admin` |

Routes are declared in `src/app/router.tsx`.

### Data and state
| Store | Kind | Holds | From API |
|---|---|---|---|
| `auth-store` | Zustand | Signed-in user, token | `/auth/login`, `/auth/register`, `/auth/me` (restores the session on load) |
| `cart-store` | Zustand | Bag lines and totals | `/cart` |
| `wishlist-store` | Zustand | Hearted product ids | `/wishlist`, `/wishlist/toggle` |
| `compare-store` | Zustand | Slugs to compare (max 3) | `/products/compare` |
| `ui-store` | Zustand | Drawer / modal / search open state | — |
| `localStorage` | Browser | `aura_jwt_token`, `aura_guest_session_id` | Cleared entirely on sign out (`lib/session.ts`) |
| URL | Router | Catalog filters, account/admin tabs | — |

Other data is fetched by the page that needs it through `lib/api-client.ts`:
- `apiClient` attaches the JWT and guest id; its errors carry `code` and per-field `fields`.
- `apiUpload` handles file uploads.

### Data conventions
- All types live in `src/types/api.ts` and mirror the backend DTOs.
- **Money is in satang**; display it with `formatTHB()` from `lib/currency.ts`.
- Allowed order status changes come from the backend (`allowed_transitions`); the UI never hard-codes them.

### Forms
- Every form validates with **zod**: declare the schema next to the form and call `validate(schema, values)` from `lib/validation.ts` before submitting.
- Error keys match the API (`email`, `variants.0.sku`), so zod errors and API `error.fields` share one state and show under the matching input.
- Shared rules (email, password, link, slug) live in `lib/validation.ts` and must match the backend, which still validates every request.
- Put `noValidate` on `<form>` so messages come from zod, not the browser.
