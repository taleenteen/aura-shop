.PHONY: infra infra-down dev-api dev-web seed-local up down logs seed psql reset swagger db-reset

# 1. Run only DB (PostgreSQL) and MinIO in Docker (for local development)
infra:
	docker compose up -d postgres minio minio-init

infra-down:
	docker compose stop postgres minio minio-init

# 2. Run Backend API locally on host
dev-api:
	cd apps/api && go run cmd/server/main.go

# 3. Run Frontend Web locally on host
dev-web:
	cd apps/web && npm run dev

# 4. Run Seeder locally on host
seed-local:
	cd apps/api && go run cmd/seeder/main.go

# Full Docker container execution
up:
	cp -n .env.example .env || true
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

seed:
	docker compose exec api go run cmd/seeder/main.go

psql:
	docker compose exec postgres psql -U aura_admin -d aura_ecommerce

# Fresh database with the sample data again. Keeps the MinIO images (reset below deletes them,
# and they are not in the repository). Asks first.
db-reset:
	node scripts/db-reset.mjs

# Wipes EVERYTHING, including product images in MinIO. Prefer db-reset.
reset:
	docker compose down -v
	cp -n .env.example .env || true
	docker compose up -d --build

# Regenerate the Swagger / OpenAPI reference (apps/api/docs) from handler annotations.
# Served at http://localhost:8080/swagger/ while SWAGGER_ENABLED=true.
swagger:
	cd apps/api && go run github.com/swaggo/swag/cmd/swag@v1.16.4 fmt -d ./cmd/server,./internal/handler && go run github.com/swaggo/swag/cmd/swag@v1.16.4 init -d ./cmd/server,./internal/handler -g main.go -o docs --parseInternal --parseDependency --parseDependencyLevel 1 --outputTypes go,json,yaml
