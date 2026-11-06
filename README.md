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
- นำเข้า / ส่งออกสินค้าด้วย CSV: ดาวน์โหลด template และคู่มือส่งให้คนอื่นกรอกได้ ระบบจับคู่สินค้าด้วย slug และตัวเลือกด้วย SKU ถ้าชื่อซ้ำแต่ slug ต่างจะถามว่าเป็นสินค้าเดียวกันหรือไม่ และเลือกได้ทีละช่องว่าจะใช้ค่าจากไฟล์หรือค่าเดิม ก่อนบันทึกจริง
- บันทึกการแก้ไข (Activity): ทุกการแก้ไขของ admin ต่อสินค้า สต็อก order แบนเนอร์ หมวดหมู่ แบรนด์ รีวิว และการนำเข้า CSV พร้อมค่าก่อน/หลัง ค้นหาและกรองได้
- รายงานยอดขาย: ช่วงวันที่และจัดกลุ่มรายวัน/สัปดาห์/เดือน เทียบช่วงก่อนหน้า สินค้าขายดี ยอดตามหมวดและวิธีชำระเงิน ดาวน์โหลด CSV ได้
- จัดส่ง: เปลี่ยนสถานะคำสั่งซื้อตามขั้นตอนที่อนุญาต บันทึก S/N รายเครื่อง และขนส่ง + เลขพัสดุตอนส่งของ
- แบนเนอร์: สร้าง แก้ เปิด/ปิด ลบ และตั้งช่วงเวลาแสดง (hero, promo grid, ribbon ด้านบน) พร้อมพรีวิว
- หมวดหมู่และแบรนด์: เพิ่ม แก้ ลบ (ลบได้เมื่อไม่มีสินค้า) และกำหนดเมนูด้านบน
- รีวิว: ค้นหา กรองตามดาว และซ่อนรีวิวที่ไม่เหมาะสม

### คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `make up` / `make down` | เปิด / ปิดทุกบริการใน Docker |
| `make reset` | ลบข้อมูลทั้งหมดแล้วเริ่มใหม่ |
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
- Product CSV import / export: downloadable template and guide to hand to others; products match by slug and options by SKU; a same-name product with a different slug asks whether it is the same product; every changed field can keep its current value before anything is saved
- Activity log: every admin change to products, stock, orders, banners, categories, brands, reviews and CSV imports, with before/after values; searchable and filterable
- Sales report: any date range by day/week/month, compared with the previous period, top products, revenue by category and payment method, CSV downloads
- Fulfilment: allowed status transitions only, one serial number per unit, carrier + tracking number on shipping
- Banners: create, edit, switch on/off, delete and schedule (hero, promo grid, top ribbon) with a live preview
- Categories and brands: add, edit, delete (only when no products use them) and set the top menu
- Reviews: search, filter by stars, hide reviews that break the guidelines

### Common commands

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop all Docker services |
| `make reset` | Wipe data and start fresh |
| `make psql` | Open a Postgres shell |
| `cd apps/api && go test ./...` | Backend tests |
| `cd apps/web && npx tsc --noEmit` | Frontend type check |
| `make swagger` (or `npm run swagger`) | Regenerate the API reference from handler annotations |

### Other documents

- **API reference (Swagger UI)** at http://localhost:8080/swagger/ (disable with `SWAGGER_ENABLED=false`); the OpenAPI file is `apps/api/docs/swagger.yaml`
- `PROJECT_SPEC.md` — the original project specification
- `docs/01-project-genesis-and-asset-pipeline.md` — project history and the product-image pipeline
- `IMAGE_GEN_TRACKER.md` — product-image generation status (written by `cmd/assetgen`)
