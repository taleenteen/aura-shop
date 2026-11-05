# AURA TECH API

Go 1.23 · chi · GORM · PostgreSQL 16 · MinIO

[ภาษาไทย](#ภาษาไทย) · [English](#english)

---

## ภาษาไทย

### โครงสร้างโค้ด

| โฟลเดอร์ | หน้าที่ |
|---|---|
| `cmd/server` | จุดเริ่ม API: ต่อฐานข้อมูล, migrate, seed ครั้งแรก, ประกาศ route, worker ปล่อยสต็อกที่จองหมดเวลา (ทุก 1 นาที) |
| `cmd/seeder` | ใส่/อัปเดตข้อมูลตัวอย่าง (ไม่ทับจำนวนสต็อกเดิม) |
| `cmd/assetgen` | สร้างรูปสินค้าพื้นใส แล้วอัปโหลดขึ้น MinIO |
| `cmd/docgen` | สร้างไฟล์ `.docx` ในโฟลเดอร์ `docs/` |
| `internal/handler` | รับ HTTP request, ตรวจรูปแบบ, แปลง error เป็นรหัสตอบกลับ |
| `internal/service` | กฎทางธุรกิจและการตรวจข้อมูล |
| `internal/repository` | query และ transaction ของฐานข้อมูล |
| `internal/models` | โครงตาราง (GORM) และกฎสถานะ order |
| `internal/dto` | รูปแบบข้อมูลรับ-ส่งของ API |
| `internal/middleware` | JWT, guest session, log |
| `internal/storage` | อัปโหลดไฟล์ขึ้น MinIO |
| `internal/response` | รูปแบบ JSON มาตรฐาน `{ success, data, meta, error }` |

### บัญชีทดลอง (สร้างโดย seed)

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| ADMIN | `admin@auratech.co.th` | `password123` |
| CUSTOMER | `demo@auratech.co.th` | `password123` |

### การยืนยันตัวตน
- ล็อกอินได้ JWT อายุ 7 วัน ส่งมาใน `Authorization: Bearer <token>`
- ผู้ใช้ที่ไม่ล็อกอินส่ง `X-Guest-Session-ID` (หน้าเว็บสร้างให้อัตโนมัติ) ตะกร้าและรายการโปรดผูกกับ id นี้
- แต่ละแถวในตะกร้าหรือรายการโปรดเป็นของ user **หรือ** guest อย่างใดอย่างหนึ่ง ตอนล็อกอินระบบย้ายของ guest ไปไว้ที่บัญชี

### ฟีเจอร์ และตารางที่ใช้

| ฟีเจอร์ | Endpoint | ตาราง |
|---|---|---|
| สมัคร / ล็อกอิน / โปรไฟล์ | `POST /auth/register`, `POST /auth/login`, `GET/PATCH /auth/me` | `users`, (`wishlists`, `cart_items` ตอนรวมของ guest) |
| ลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน | `POST /auth/forgot-password`, `GET /auth/emails/{id}`, `POST /auth/reset-password`, `POST /auth/change-password` | `users`, `password_reset_tokens`, `email_messages` |
| แบนเนอร์หน้าแรก | `GET /banners` | `banners` |
| หมวดและแบรนด์ | `GET /categories`, `GET /brands` | `categories`, `brands` |
| รายการสินค้า + ตัวกรอง | `GET /catalog` | `products`, `product_variants`, `categories`, `brands` |
| หน้าสินค้า / เปรียบเทียบ / ค้นหา | `GET /products/{slug}`, `GET /products/compare`, `GET /search` | `products`, `product_variants`, `product_accessory_bundles` |
| รายการโปรด | `GET /wishlist`, `POST /wishlist/toggle` | `wishlists` |
| ตะกร้า | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/{id}` | `cart_items`, `product_variants` |
| จองสต็อก (15 นาที) | `POST /checkout/reserve` | `orders`, `order_items`, `stock_reservations`, `product_variants`, `cart_items` |
| ชำระเงิน | `POST /checkout/pay`, `GET /checkout/promptpay/{no}`, `GET /checkout/installments/{satang}` | `orders`, `stock_reservations`, `product_variants`, `stock_movements` |
| หน้าคำสั่งซื้อ + อีเมล (เจ้าของ, admin หรือผู้ค้นด้วยเลข order + อีเมล) | `GET /orders/{orderNumber}`, `GET /orders/{orderNumber}/emails`, `POST /orders/lookup` | `orders`, `order_items`, `email_messages` |
| ยกเลิกคำสั่งซื้อที่ยังไม่จ่าย (เจ้าของ) | `POST /orders/{orderNumber}/cancel` | `orders`, `stock_reservations`, `product_variants`, `cart_items`, `email_messages` |
| คำสั่งซื้อของฉัน | `GET /account/orders` | `orders`, `order_items` |
| แจ้งเตือนสินค้ากลับมามีของ + กล่องข้อความ | `GET /account/stock-alerts`, `PUT/DELETE /account/stock-alerts/{variantID}`, `GET /account/emails` | `stock_alerts`, `email_messages` |
| รีวิวสินค้า (เขียนได้เมื่อได้รับของแล้ว) | `GET /products/{slug}/reviews`, `PUT/DELETE /products/{slug}/reviews/mine` | `reviews`, `orders`, `order_items` |
| แดชบอร์ด admin | `GET /admin/overview` | `orders`, `order_items`, `product_variants`, `products`, `categories` |
| จัดการคำสั่งซื้อ | `GET /admin/orders`, `PATCH /admin/orders/{id}/status` | `orders`, `order_items`, `stock_reservations`, `product_variants`, `stock_movements`, `email_messages` | (ส่งของต้องระบุ `carrier` KERRY/FLASH/DHL และ `tracking_number`)
| จัดการสินค้า | `GET/POST /admin/products`, `GET/PUT /admin/products/{id}`, `PATCH /admin/products/{id}/status` | `products`, `product_variants`, `stock_movements`, `cart_items` |
| ปรับสต็อก + ประวัติ | `POST /admin/variants/{id}/stock-adjustments`, `GET /admin/variants/{id}/stock-movements` | `product_variants`, `stock_movements` |
| อัปโหลดรูป | `POST /admin/uploads/images` | MinIO bucket `aura-assets` |
| จัดการแบนเนอร์ (หน้าแรก, promo grid, ribbon) | `GET/POST /admin/banners`, `PUT/DELETE /admin/banners/{id}`, `PATCH /admin/banners/{id}/status` | `banners` |
| จัดการหมวดหมู่และแบรนด์ | `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/{id}`, `GET/POST /admin/brands`, `PUT/DELETE /admin/brands/{id}` | `categories`, `brands` (นับ `products`) |
| ดูและซ่อนรีวิว | `GET /admin/reviews`, `PATCH /admin/reviews/{id}` | `reviews` |

ทุก path ขึ้นต้นด้วย `/api/v1` ยกเว้น `GET /health` และ `/admin/*` ต้องเป็นบัญชี ADMIN

### ตาราง

| ตาราง | เก็บอะไร |
|---|---|
| `users` | บัญชีผู้ใช้ (รหัสผ่านเข้ารหัส bcrypt), บทบาท, ที่อยู่ |
| `categories`, `brands` | หมวดหมู่และแบรนด์; `nav_label` ของหมวดคือชื่อในเมนูด้านบน (ว่าง = ไม่แสดงในเมนู) |
| `products` | ข้อมูลสินค้า, กลุ่มการใช้งาน, เนื้อหาหน้าสินค้า (JSONB), เปิด/ปิดขาย |
| `product_variants` | สี/สเปก, SKU, ราคา (สตางค์), รูป, `stock_quantity`, `reserved_stock` |
| `product_accessory_bundles` | อุปกรณ์ที่แนะนำให้ซื้อคู่กัน |
| `wishlists`, `cart_items` | รายการโปรดและตะกร้า (ของ user หรือ guest) |
| `orders`, `order_items` | คำสั่งซื้อ, สถานะ, S/N รายเครื่อง (`serial_numbers`), ขนส่งและเลขพัสดุ (`carrier`, `tracking_number`, `shipped_at`, `delivered_at`) |
| `stock_reservations` | สต็อกที่จองไว้ระหว่าง checkout (ACTIVE / COMMITTED / RELEASED) |
| `stock_movements` | ประวัติการเปลี่ยนสต็อกทุกครั้ง: เหตุผล, จำนวน, ยอดหลังเปลี่ยน, ผู้ทำ, order |
| `email_messages` | อีเมลถึงลูกค้าทุกฉบับ (ยืนยันการจ่าย, จัดส่ง, ส่งถึง, ยกเลิก) เขียนใน transaction เดียวกับการเปลี่ยนสถานะ order |
| `password_reset_tokens` | ลิงก์รีเซ็ตรหัสผ่าน (เก็บ SHA-256 ของ token) ใช้ได้ครั้งเดียว หมดอายุ 30 นาที |
| `banners` | แบนเนอร์หน้าแรก แสดงเมื่อเปิดอยู่และอยู่ในช่วง `start_at`–`end_at` |
| `stock_alerts` | คำขอแจ้งเตือนเมื่อสินค้ากลับมามีของ (รอส่งได้หนึ่งรายการต่อคนต่อตัวเลือก) ส่งอีเมลเมื่อสต็อกที่ซื้อได้กลับมามากกว่า 0 |
| `reviews` | รีวิวหนึ่งรายการต่อคนต่อสินค้า คะแนน 1–5 admin ซ่อนได้ |

### กฎสำคัญ
- **เงิน** เก็บเป็นสตางค์ (`int64`)
- **สถานะ order** ที่ admin เปลี่ยนได้: `PENDING_PAYMENT → CANCELLED`, `PAID_PROCESSING → SN_ASSIGNED / SHIPPED / CANCELLED`, `SHIPPED → DELIVERED` การจ่ายเงินทำได้ผ่าน checkout เท่านั้น การยกเลิกคืนสต็อกให้อัตโนมัติ
- **SHIPPED** ต้องมี S/N ครบทุกเครื่อง
- **การจ่ายเงินและอีเมลเป็นการจำลองทั้งหมด** ไม่มีการตัดเงินหรือส่งอีเมลจริง QR PromptPay อยู่ในรูปแบบมาตรฐาน EMVCo แต่ชี้ไปที่หมายเลขที่ไม่มีบัญชี (สแกนแล้วโอนไม่ได้) บัตรที่ลงท้าย `0000` จะถูกปฏิเสธ อีเมลเก็บใน `email_messages` และแสดงในหน้าคำสั่งซื้อ
- **order ที่ยังไม่จ่าย** ยกเลิกเองได้ หรือถูกยกเลิกเมื่อครบ 15 นาที ทั้งสองกรณีคืนสต็อกที่จองไว้และใส่สินค้ากลับลงตะกร้า
- **ลืมรหัสผ่าน** ใช้ได้กับบัญชีลูกค้าเท่านั้น บัญชี admin รีเซ็ตผ่านหน้าร้านไม่ได้ (ป้องกันคนอื่นยึดบัญชี admin ตัวอย่าง เพราะอีเมลรีเซ็ตเปิดอ่านได้ในเว็บ)
- **สต็อก** เปลี่ยนได้ผ่าน checkout, การยกเลิก order และการปรับสต็อกของ admin เท่านั้น ทุกครั้งเขียนลง `stock_movements`
- สินค้าที่ปิดขายใส่ตะกร้าหรือ checkout ไม่ได้
- error ตรวจข้อมูลตอบ `400 VALIDATION_FAILED` พร้อม `error.fields` แยกตามช่อง

### ตัวแปรสภาพแวดล้อม
ดู `.env.example` ที่ root ค่าหลัก: `DATABASE_URL`, `JWT_SECRET`, `API_PORT`, `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET_NAME`, `MINIO_PUBLIC_URL`, `STOCK_LOCK_TTL_MINUTES`

### รันและทดสอบ
```bash
go run ./cmd/server      # API
go run ./cmd/seeder      # ข้อมูลตัวอย่าง
go test ./...            # test
```
ใน Docker ใช้ Air (`.air.toml`) rebuild อัตโนมัติ โดยเปิดโหมด poll ไว้ เพราะ Docker Desktop ไม่ส่งสัญญาณการแก้ไฟล์เข้า container

---

## English

### Code layout

| Folder | Role |
|---|---|
| `cmd/server` | API entry point: DB connection, migrations, first-run seed, routes, a worker that releases expired stock holds every minute |
| `cmd/seeder` | Loads/refreshes sample data (never overwrites existing stock) |
| `cmd/assetgen` | Generates transparent product images and uploads them to MinIO |
| `cmd/docgen` | Builds the `.docx` in `docs/` |
| `internal/handler` | HTTP layer: decoding, status codes, error mapping |
| `internal/service` | Business rules and validation |
| `internal/repository` | Queries and transactions |
| `internal/models` | GORM tables and order-status rules |
| `internal/dto` | Request/response shapes |
| `internal/middleware` | JWT, guest session, logging |
| `internal/storage` | MinIO uploads |
| `internal/response` | Standard JSON envelope `{ success, data, meta, error }` |

### Demo accounts (created by the seed)

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@auratech.co.th` | `password123` |
| CUSTOMER | `demo@auratech.co.th` | `password123` |

### Authentication
- Login returns a 7-day JWT, sent as `Authorization: Bearer <token>`.
- Anonymous visitors send `X-Guest-Session-ID` (the web app creates it); their bag and wishlist hang off that id.
- A bag or wishlist row belongs to a user **or** a guest, never both; on sign-in the guest's rows move to the account.

### Features and the tables they use

| Feature | Endpoints | Tables |
|---|---|---|
| Register / sign in / profile | `POST /auth/register`, `POST /auth/login`, `GET/PATCH /auth/me` | `users` (+ `wishlists`, `cart_items` when merging a guest) |
| Forgot / change password | `POST /auth/forgot-password`, `GET /auth/emails/{id}`, `POST /auth/reset-password`, `POST /auth/change-password` | `users`, `password_reset_tokens`, `email_messages` |
| Home banners | `GET /banners` | `banners` |
| Categories and brands | `GET /categories`, `GET /brands` | `categories`, `brands` |
| Catalog + filters | `GET /catalog` | `products`, `product_variants`, `categories`, `brands` |
| Product page / compare / search | `GET /products/{slug}`, `GET /products/compare`, `GET /search` | `products`, `product_variants`, `product_accessory_bundles` |
| Wishlist | `GET /wishlist`, `POST /wishlist/toggle` | `wishlists` |
| Bag | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/{id}` | `cart_items`, `product_variants` |
| Stock hold (15 min) | `POST /checkout/reserve` | `orders`, `order_items`, `stock_reservations`, `product_variants`, `cart_items` |
| Payment | `POST /checkout/pay`, `GET /checkout/promptpay/{no}`, `GET /checkout/installments/{satang}` | `orders`, `stock_reservations`, `product_variants`, `stock_movements` |
| Order page + emails (owner, admin, or anyone with order number + email) | `GET /orders/{orderNumber}`, `GET /orders/{orderNumber}/emails`, `POST /orders/lookup` | `orders`, `order_items`, `email_messages` |
| Cancel an unpaid order (owner) | `POST /orders/{orderNumber}/cancel` | `orders`, `stock_reservations`, `product_variants`, `cart_items`, `email_messages` |
| My orders | `GET /account/orders` | `orders`, `order_items` |
| Back-in-stock alerts + inbox | `GET /account/stock-alerts`, `PUT/DELETE /account/stock-alerts/{variantID}`, `GET /account/emails` | `stock_alerts`, `email_messages` |
| Product reviews (after delivery) | `GET /products/{slug}/reviews`, `PUT/DELETE /products/{slug}/reviews/mine` | `reviews`, `orders`, `order_items` |
| Admin dashboard | `GET /admin/overview` | `orders`, `order_items`, `product_variants`, `products`, `categories` |
| Order fulfilment | `GET /admin/orders`, `PATCH /admin/orders/{id}/status` | `orders`, `order_items`, `stock_reservations`, `product_variants`, `stock_movements`, `email_messages` | (shipping needs `carrier` KERRY/FLASH/DHL and `tracking_number`)
| Product management | `GET/POST /admin/products`, `GET/PUT /admin/products/{id}`, `PATCH /admin/products/{id}/status` | `products`, `product_variants`, `stock_movements`, `cart_items` |
| Stock adjustment + history | `POST /admin/variants/{id}/stock-adjustments`, `GET /admin/variants/{id}/stock-movements` | `product_variants`, `stock_movements` |
| Image upload | `POST /admin/uploads/images` | MinIO bucket `aura-assets` |
| Banner management (hero, promo grid, ribbon) | `GET/POST /admin/banners`, `PUT/DELETE /admin/banners/{id}`, `PATCH /admin/banners/{id}/status` | `banners` |
| Category and brand management | `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/{id}`, `GET/POST /admin/brands`, `PUT/DELETE /admin/brands/{id}` | `categories`, `brands` (counts `products`) |
| Review moderation | `GET /admin/reviews`, `PATCH /admin/reviews/{id}` | `reviews` |

All paths are under `/api/v1` except `GET /health`; `/admin/*` requires an ADMIN account.

### Tables

| Table | Holds |
|---|---|
| `users` | Accounts (bcrypt passwords), role, address |
| `categories`, `brands` | Taxonomy; a category's `nav_label` is its top-menu label (empty = not in the menu) |
| `products` | Product details, use cases, product-page content (JSONB), on-sale flag |
| `product_variants` | Colour/spec, SKU, price (satang), images, `stock_quantity`, `reserved_stock` |
| `product_accessory_bundles` | "Frequently bought together" pairs |
| `wishlists`, `cart_items` | Wishlist and bag (user or guest) |
| `orders`, `order_items` | Orders, status, per-unit serial numbers (`serial_numbers`), shipment (`carrier`, `tracking_number`, `shipped_at`, `delivered_at`) |
| `stock_reservations` | Units held during checkout (ACTIVE / COMMITTED / RELEASED) |
| `stock_movements` | Every stock change: reason, delta, balance after, who, which order |
| `email_messages` | Every customer email (payment confirmed, shipped, delivered, cancelled), written in the same transaction as the order change |
| `password_reset_tokens` | Password reset links (SHA-256 of the token only), single use, 30-minute expiry |
| `banners` | Home-page banners, shown while on and between `start_at` and `end_at` |
| `stock_alerts` | Back-in-stock requests (one pending per customer per option); emailed when available stock rises above 0 |
| `reviews` | One review per customer per product, 1–5 stars; admins can hide it |

### Key rules
- **Money** is stored in satang (`int64`).
- **Admin order transitions**: `PENDING_PAYMENT → CANCELLED`, `PAID_PROCESSING → SN_ASSIGNED / SHIPPED / CANCELLED`, `SHIPPED → DELIVERED`. Payment only happens through checkout; cancelling returns stock.
- **SHIPPED** requires a serial number for every unit.
- **Payments and emails are simulated.** No money moves and no mail is sent. The PromptPay QR is a valid EMVCo payload pointing at an unregistered proxy number (banking apps cannot complete it); cards ending in `0000` are declined. Emails are stored in `email_messages` and shown on the order page.
- **Unpaid orders** can be cancelled by the customer, or are cancelled when the 15-minute hold ends; both release the held stock and put the items back in the bag.
- **Password reset** works for customer accounts only; admin accounts cannot be reset from the storefront (the reset email is readable in the app, so this keeps anyone from taking over the demo admin)
- **Stock** changes only through checkout, order cancellation and admin adjustments, each written to `stock_movements`.
- Products taken off sale cannot be added to a bag or checked out.
- Validation errors return `400 VALIDATION_FAILED` with per-field `error.fields`.

### Environment
See the root `.env.example`. Main keys: `DATABASE_URL`, `JWT_SECRET`, `API_PORT`, `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET_NAME`, `MINIO_PUBLIC_URL`, `STOCK_LOCK_TTL_MINUTES`.

### Run and test
```bash
go run ./cmd/server      # API
go run ./cmd/seeder      # sample data
go test ./...            # tests
```
In Docker the API runs under Air (`.air.toml`) with polling enabled, because Docker Desktop does not forward host file events into containers.
