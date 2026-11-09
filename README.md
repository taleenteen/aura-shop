# AURA TECH

ร้านค้าออนไลน์สำหรับโน้ตบุ๊ก จอ และอุปกรณ์ไอที ประกอบด้วยหน้าร้านสำหรับลูกค้าและหลังบ้านสำหรับผู้ดูแล
An online store for laptops, monitors and IT gear, with a customer storefront and an admin backoffice.

- [ภาษาไทย](#ภาษาไทย)
- [English](#english)
- รายละเอียดเชิงลึก / Deep dives: [`apps/api/README.md`](apps/api/README.md) (backend) · [`apps/web/README.md`](apps/web/README.md) (frontend)

---

## ภาษาไทย

### โครงสร้าง

| ส่วน | เทคโนโลยี | ที่อยู่ |
|---|---|---|
| Backend API | Go 1.23, chi, GORM | `apps/api` |
| Frontend | React 19, Vite 6, TanStack Router, Zustand, Tailwind 4 | `apps/web` |
| ฐานข้อมูล | PostgreSQL 16 | Docker (`postgres`) |
| ไฟล์รูปภาพ | MinIO (S3-compatible) | Docker (`minio`) |

### เริ่มใช้งาน

ต้องมี Docker Desktop, Go 1.23 ขึ้นไป และ Node.js 20 ขึ้นไป

```bash
cp .env.example .env          # ตั้งค่าเริ่มต้น
make up                       # รันทุกอย่างใน Docker (Postgres, MinIO, API, Web)
```

หรือรันแบบแยกบนเครื่อง:

```bash
make infra                    # Postgres + MinIO ใน Docker
make dev-api                  # API ที่ http://localhost:8080
make dev-web                  # หน้าเว็บที่ http://localhost:5173
```

ตอน API เริ่มทำงานครั้งแรกกับฐานข้อมูลว่าง ระบบจะสร้างตารางและใส่ข้อมูลตัวอย่างให้เอง รัน `make seed-local` (หรือ `npm run seed`) ซ้ำได้เพื่ออัปเดตข้อมูลตัวอย่าง โดย**ไม่ทับจำนวนสต็อกจริง**

### บัญชีทดลอง

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| ผู้ดูแล (Admin) | `admin@auratech.co.th` | `password123` |
| ลูกค้า | `demo@auratech.co.th` | `password123` |

### ความสามารถหลัก

**หน้าร้าน**
- รายการสินค้าพร้อมตัวกรอง (หมวด แบรนด์ การใช้งาน CPU RAM SSD ราคา) ตัวเลขในตัวกรองนับจากตัวกรองอื่นที่เลือกอยู่
- หน้าสินค้าเลือกสีและสเปก, เปรียบเทียบสูงสุด 3 รุ่น, ค้นหาด้วย Ctrl K / ⌘K
- ตะกร้าและรายการโปรด ใช้ได้ทั้งแบบไม่ล็อกอินและล็อกอิน ระบบรวมให้ตอนล็อกอิน
- Checkout: จองสต็อก 15 นาที แล้วจ่ายด้วย PromptPay บัตรเครดิต หรือผ่อน 0% (จำลองทั้งหมด ไม่ตัดเงินจริง) กลับมาจ่ายต่อหรือยกเลิกได้ ใช้ที่อยู่ที่บันทึกไว้ได้
- อีเมลแจ้งลูกค้า (ยืนยันการจ่าย จัดส่ง ส่งถึง ยกเลิก) เปิดอ่านได้ในหน้าคำสั่งซื้อ
- ติดตามคำสั่งซื้อด้วยเลข order + อีเมล ที่ `/orders/lookup` สำหรับคนที่ซื้อแบบไม่ล็อกอิน
- แจ้งเตือนทางอีเมลเมื่อตัวเลือกที่หมดกลับมามีของ (ต้องล็อกอิน) และกล่องข้อความในหน้าบัญชี
- รีวิวและให้ดาวสินค้า เขียนได้เมื่อได้รับของแล้ว
- หน้าบัญชีผู้ใช้: ติดตามคำสั่งซื้อตามสถานะ และแก้ชื่อ เบอร์โทร ที่อยู่ เปลี่ยนรหัสผ่าน และติดตามพัสดุ; ลืมรหัสผ่านรีเซ็ตผ่านอีเมลได้

**หลังบ้าน (`/admin`)**
- ภาพรวม: รายได้ แนวโน้ม 30 วัน ยอดรายวัน 7 วัน ยอดตามหมวด และสต็อกใกล้หมด
- สินค้าและสต็อก: เพิ่ม/แก้สินค้า variant รูป และปรับสต็อกพร้อมบันทึกประวัติทุกครั้ง
- เก็บเข้าคลัง (Archive) ซ่อนสินค้าจากหน้าร้านและรายการ แต่ order และรายงานยังครบ กู้คืนได้; ลบถาวรได้เฉพาะสินค้าที่ไม่เคยมีคนสั่ง (ต้องพิมพ์ชื่อยืนยัน)
- นำเข้า / ส่งออกสินค้าด้วย CSV: ดาวน์โหลด template และคู่มือส่งให้คนอื่นกรอกได้ ระบบจับคู่สินค้าด้วย slug และตัวเลือกด้วย SKU ถ้าชื่อซ้ำแต่ slug ต่างจะถามว่าเป็นสินค้าเดียวกันหรือไม่ และเลือกได้ทีละช่องว่าจะใช้ค่าจากไฟล์หรือค่าเดิม ก่อนบันทึกจริง
- บันทึกการแก้ไข (Activity): ทุกการแก้ไขของ admin ต่อสินค้า สต็อก order แบนเนอร์ หมวดหมู่ แบรนด์ รีวิว และการนำเข้า CSV พร้อมค่าก่อน/หลัง ค้นหาและกรองได้
- รายงานยอดขาย: ช่วงวันที่และจัดกลุ่มรายวัน/สัปดาห์/เดือน เทียบช่วงก่อนหน้า สินค้าขายดี ยอดตามหมวดและวิธีชำระเงิน ดาวน์โหลด CSV ได้
- จัดส่ง: เปลี่ยนสถานะคำสั่งซื้อตามขั้นตอนที่อนุญาต บันทึก S/N รายเครื่อง และขนส่ง + เลขพัสดุตอนส่งของ
- แบนเนอร์: สร้าง แก้ เปิด/ปิด ลบ และตั้งช่วงเวลาแสดง (hero, promo grid, ribbon ด้านบน) พร้อมพรีวิว
- หมวดหมู่และแบรนด์: เพิ่ม แก้ ลบ (ลบได้เมื่อไม่มีสินค้า) และกำหนดเมนูด้านบน
- รีวิว: ค้นหา กรองตามดาว และซ่อนรีวิวที่ไม่เหมาะสม

### ความปลอดภัย

- **จำกัดจำนวนครั้งต่อ IP** (rate limit): ทั้ง API 600 ครั้ง/นาที, login 10/นาที, สมัคร 10/15 นาที, ลืม/รีเซ็ตรหัส 5/15 นาที, ค้นหา order 20/10 นาที, checkout 30/10 นาที เกินแล้วตอบ `429 RATE_LIMITED` พร้อม `Retry-After`
- **ล็อกบัญชี** เมื่อใส่รหัสผิด 5 ครั้งติดกัน (จากกี่ IP ก็ตาม) 15 นาที ตอบ `423 ACCOUNT_LOCKED`; รีเซ็ตรหัสผ่านปลดล็อกได้ทันที อีเมลที่ไม่มีบัญชีใช้เวลาตอบเท่ากับรหัสผิด จึงเดาไม่ได้ว่าอีเมลไหนมีบัญชี
- **ยกเลิก session ได้จริง**: JWT มี `token_version` ที่ตรวจกับฐานข้อมูลทุก request เปลี่ยน/รีเซ็ตรหัสผ่าน หรือกด "Sign out of other devices" แล้ว token เก่าใช้ไม่ได้ทันที และสิทธิ์ admin อ่านจากฐานข้อมูลทุกครั้ง
- **รหัสผ่าน** 8–72 ตัวอักษร (NIST SP 800-63B; 72 bytes คือขีดจำกัดของ bcrypt) เก็บด้วย bcrypt
- **Idempotency-Key** บน `/checkout/reserve`, `/checkout/pay` และการยกเลิก order: กดซ้ำหรือเน็ตหลุดแล้วส่งใหม่ จะไม่เกิด order ซ้ำหรือตัดเงินสองครั้ง
- **Security headers**: `nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'`, `Referrer-Policy`, HSTS (production) และ `Cache-Control: no-store` สำหรับข้อมูลส่วนตัว
- **จำกัดขนาด body** 1 MB (อัปโหลดรูปและ CSV มีขีดจำกัดของตัวเอง) และ error 500 ไม่ส่งรายละเอียดภายในกลับไป
- **สต็อก** ล็อกแถว (`SELECT … FOR UPDATE`) ตอนจอง/ตัดสต็อก ราคาคำนวณที่ server เท่านั้น และ order ของคนอื่นตอบ 404 เพื่อไม่ให้ไล่เดาเลข order ได้

**ตั้งค่าสำหรับ production** (`APP_ENV=production`): server จะไม่ยอมเริ่มถ้า `JWT_SECRET` เป็นค่าตัวอย่างหรือสั้นกว่า 32 ตัว หรือ `CORS_ALLOWED_ORIGINS` ว่าง / เป็น `*` / ไม่ใช่ https; Swagger ปิดเป็นค่าเริ่มต้น; ตั้ง `TRUST_PROXY=true` เฉพาะเมื่ออยู่หลัง reverse proxy ที่ใส่ `X-Forwarded-For` ให้

### คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `make up` / `make down` | เปิด / ปิดทุกบริการใน Docker |
| `npm run db:reset` (หรือ `make db-reset`) | ล้างฐานข้อมูลให้เหมือนติดตั้งใหม่ แล้วใส่ข้อมูลตัวอย่างอีกครั้ง **รูปสินค้าใน MinIO ไม่หาย** (ถามยืนยันก่อน) |
| `make reset` | ลบ**ทุกอย่าง**รวมถึงรูปสินค้าใน MinIO ซึ่งไม่มีสำเนาใน repo ใช้ `db:reset` แทนถ้าแค่อยากล้างข้อมูล |
| `make psql` | เข้า Postgres |
| `cd apps/api && go test ./...` | รัน test ฝั่ง backend |
| `cd apps/web && npx tsc --noEmit` | ตรวจ type ฝั่ง frontend |
| `make swagger` (หรือ `npm run swagger`) | สร้างเอกสาร API (Swagger) ใหม่จาก comment ใน handler |

### เอกสารอื่น

- **API reference (Swagger UI)** ที่ http://localhost:8080/swagger/ (ปิดได้ด้วย `SWAGGER_ENABLED=false`) ไฟล์ OpenAPI อยู่ที่ `apps/api/docs/swagger.yaml`
- `PROJECT_SPEC.md` สเปกตั้งต้นของโปรเจกต์
- `docs/01-project-genesis-and-asset-pipeline.md` ที่มาของโปรเจกต์และไปป์ไลน์สร้างรูปสินค้า
- `IMAGE_GEN_TRACKER.md` สถานะการสร้างรูปสินค้า (เขียนโดย `cmd/assetgen`)

---

## English

### Layout

| Part | Stack | Path |
|---|---|---|
| Backend API | Go 1.23, chi, GORM | `apps/api` |
| Frontend | React 19, Vite 6, TanStack Router, Zustand, Tailwind 4 | `apps/web` |
| Database | PostgreSQL 16 | Docker (`postgres`) |
| Images | MinIO (S3-compatible) | Docker (`minio`) |

### Getting started

Requires Docker Desktop, Go 1.23+ and Node.js 20+.

```bash
cp .env.example .env          # default settings
make up                       # everything in Docker (Postgres, MinIO, API, web)
```

Or run the apps on your machine:

```bash
make infra                    # Postgres + MinIO in Docker
make dev-api                  # API on http://localhost:8080
make dev-web                  # web on http://localhost:5173
```

On first start against an empty database the API creates the tables and loads sample data. `make seed-local` (or `npm run seed`) can be re-run to refresh sample data; it **never overwrites real stock levels**.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@auratech.co.th` | `password123` |
| Customer | `demo@auratech.co.th` | `password123` |

### Features

**Storefront**
- Catalog with filters (category, brand, use case, CPU, RAM, storage, price); each filter's counts reflect the other active filters
- Product configurator (colour/spec), compare up to 3 models, search with Ctrl K / ⌘K
- Bag and wishlist for guests and signed-in users, merged on sign-in
- Checkout: 15-minute stock hold, then PromptPay, card or 0% instalments (all simulated; no money moves); resume or cancel unpaid orders; deliver to the saved address
- Customer emails (payment confirmed, shipped, delivered, cancelled), readable on the order page
- Order lookup by order number + email at `/orders/lookup` for guest checkouts
- Back-in-stock email alerts for sold-out options (signed in) and an account inbox
- Product reviews and star ratings, open to customers whose order was delivered
- Account page: orders grouped by status, editable name, phone and address, password change, parcel tracking; password reset by email

**Backoffice (`/admin`)**
- Overview: revenue, 30-day trend, last 7 days, revenue by category, low stock
- Products & stock: create/edit products, variants and images; every stock change is recorded
- Archive hides a product from the store and the list while orders and reports keep it, and can be undone; permanent delete is only for never-ordered products (type the name to confirm)
- Product CSV import / export: downloadable template and guide to hand to others; products match by slug and options by SKU; a same-name product with a different slug asks whether it is the same product; every changed field can keep its current value before anything is saved
- Activity log: every admin change to products, stock, orders, banners, categories, brands, reviews and CSV imports, with before/after values; searchable and filterable
- Sales report: any date range by day/week/month, compared with the previous period, top products, revenue by category and payment method, CSV downloads
- Fulfilment: allowed status transitions only, one serial number per unit, carrier + tracking number on shipping
- Banners: create, edit, switch on/off, delete and schedule (hero, promo grid, top ribbon) with a live preview
- Categories and brands: add, edit, delete (only when no products use them) and set the top menu
- Reviews: search, filter by stars, hide reviews that break the guidelines

### Security

- **Per-IP rate limits**: 600 requests/min across the API, sign-in 10/min, sign-up 10/15 min, password reset 5/15 min, order lookup 20/10 min, checkout 30/10 min. Over the limit: `429 RATE_LIMITED` with `Retry-After`
- **Account lockout** after 5 wrong passwords in a row from any IP, for 15 minutes (`423 ACCOUNT_LOCKED`); a password reset lifts it at once. Unknown emails take as long as a wrong password, so timing does not reveal which emails have accounts
- **Revocable sessions**: each JWT carries a `token_version` checked against the database on every request. A password change or reset, or "Sign out of other devices", invalidates older tokens at once, and the admin role is read from the database each time
- **Passwords** of 8–72 characters (NIST SP 800-63B; 72 bytes is the bcrypt limit), hashed with bcrypt
- **Idempotency-Key** on `/checkout/reserve`, `/checkout/pay` and order cancellation: a double click or a resend after a dropped connection cannot create a second order or charge twice
- **Security headers**: `nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'`, `Referrer-Policy`, HSTS (production) and `Cache-Control: no-store` on personal responses
- **1 MB body limit** (image upload and CSV import have their own), and 500 responses never include internal error details
- **Stock** rows are locked (`SELECT … FOR UPDATE`) when held or sold, prices are computed on the server only, and other people's orders answer 404 so order numbers cannot be probed

**Production settings** (`APP_ENV=production`): the server refuses to start when `JWT_SECRET` is the sample key or shorter than 32 characters, or `CORS_ALLOWED_ORIGINS` is empty, `*` or not https. Swagger is off by default. Set `TRUST_PROXY=true` only behind a reverse proxy that sets `X-Forwarded-For`.

### Common commands

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop all Docker services |
| `npm run db:reset` (or `make db-reset`) | Fresh database with the sample data reloaded; **keeps the product images in MinIO** (asks first) |
| `make reset` | Wipes **everything**, including product images in MinIO, which are not in the repository. Use `db:reset` to just clear the data |
| `make psql` | Open a Postgres shell |
| `cd apps/api && go test ./...` | Backend tests |
| `cd apps/web && npx tsc --noEmit` | Frontend type check |
| `make swagger` (or `npm run swagger`) | Regenerate the API reference from handler annotations |

### Other documents

- **API reference (Swagger UI)** at http://localhost:8080/swagger/ (disable with `SWAGGER_ENABLED=false`); the OpenAPI file is `apps/api/docs/swagger.yaml`
- `PROJECT_SPEC.md` — the original project specification
- `docs/01-project-genesis-and-asset-pipeline.md` — project history and the product-image pipeline
- `IMAGE_GEN_TRACKER.md` — product-image generation status (written by `cmd/assetgen`)
