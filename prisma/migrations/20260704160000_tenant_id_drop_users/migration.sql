-- Drop foreign keys to users
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_user_id_fkey";
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_user_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_user_id_fkey";
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_user_id_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_user_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_user_id_fkey";

-- Idempotency keys: user_id -> tenant_id
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_user_route_key_unique";
DROP INDEX IF EXISTS "idempotency_keys_user_route_key_unique";
ALTER TABLE "idempotency_keys" RENAME COLUMN "user_id" TO "tenant_id";
CREATE UNIQUE INDEX "idempotency_keys_tenant_route_key_unique" ON "idempotency_keys"("tenant_id", "route", "key");

-- Categories
DROP INDEX IF EXISTS "idx_categories_user_id";
DELETE FROM "categories" WHERE "user_id" IS NULL;
ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "categories" RENAME COLUMN "user_id" TO "tenant_id";
CREATE INDEX "idx_categories_tenant_id" ON "categories"("tenant_id");

-- Products
DROP INDEX IF EXISTS "idx_products_user_id";
DELETE FROM "products" WHERE "user_id" IS NULL;
ALTER TABLE "products" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "products" RENAME COLUMN "user_id" TO "tenant_id";
CREATE INDEX "idx_products_tenant_id" ON "products"("tenant_id");

-- Sales
DROP INDEX IF EXISTS "idx_sales_user_id";
DELETE FROM "sales" WHERE "user_id" IS NULL;
ALTER TABLE "sales" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "sales" RENAME COLUMN "user_id" TO "tenant_id";
CREATE INDEX "idx_sales_tenant_id" ON "sales"("tenant_id");

-- Receipts
DROP INDEX IF EXISTS "idx_receipts_user_id";
ALTER TABLE "receipts" RENAME COLUMN "user_id" TO "tenant_id";
CREATE INDEX "idx_receipts_tenant_id" ON "receipts"("tenant_id");

-- Payments
DROP INDEX IF EXISTS "idx_payments_user_id";
ALTER TABLE "payments" RENAME COLUMN "user_id" TO "tenant_id";
CREATE INDEX "idx_payments_tenant_id" ON "payments"("tenant_id");

-- Drop local auth tables
DROP TABLE IF EXISTS "auth_otps";
DROP TABLE IF EXISTS "users";

-- Tenant profile / branding (replaces users for shop settings)
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255),
    "phone_e164" VARCHAR(20),
    "business_name" VARCHAR(255),
    "theme_color" VARCHAR(20),
    "shop_logo_url" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);
