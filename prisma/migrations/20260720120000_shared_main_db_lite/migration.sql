-- Lite (BIVA) extension tables on shared main-app database.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "retail_tenant_settings" (
  "tenant_id" VARCHAR(64) NOT NULL,
  "is_locked" BOOLEAN NOT NULL DEFAULT false,
  "locked_at" TIMESTAMPTZ,
  "locked_reason" VARCHAR(500),
  "locked_by" VARCHAR(255),
  "lite_categories_seeded" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "retail_tenant_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "fk_retail_tenant_settings_tenants"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "retail_category_meta" (
  "category_id" VARCHAR(64) NOT NULL,
  "tenant_id" VARCHAR(64) NOT NULL,
  "icon" VARCHAR(50) DEFAULT 'package',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "retail_category_meta_pkey" PRIMARY KEY ("category_id"),
  CONSTRAINT "fk_retail_category_meta_categories"
    FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_retail_category_meta_tenants"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_retail_category_meta_tenant_id"
  ON "retail_category_meta" ("tenant_id");

CREATE TABLE IF NOT EXISTS "retail_product_meta" (
  "product_id" VARCHAR(64) NOT NULL,
  "tenant_id" VARCHAR(64) NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "cost_price" DECIMAL(15, 2),
  "specifications" JSONB,
  CONSTRAINT "retail_product_meta_pkey" PRIMARY KEY ("product_id"),
  CONSTRAINT "fk_retail_product_meta_products"
    FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_retail_product_meta_tenants"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(64) NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "route" VARCHAR(100) NOT NULL,
  "response_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_idempotency_keys_tenants"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_tenant_route_key_unique"
  ON "idempotency_keys" ("tenant_id", "route", "key");

CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_created_at"
  ON "idempotency_keys" ("created_at");

CREATE TABLE IF NOT EXISTS "day_closes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(64) NOT NULL,
  "business_date" DATE NOT NULL,
  "expected_by_method" JSONB NOT NULL,
  "counted_by_method" JSONB NOT NULL,
  "expected_cash" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "counted_cash" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "cash_variance" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "expected_total" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "counted_total" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "total_variance" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "change_given_total" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "sale_count" INTEGER NOT NULL DEFAULT 0,
  "return_count" INTEGER NOT NULL DEFAULT 0,
  "payment_count" INTEGER NOT NULL DEFAULT 0,
  "notes" VARCHAR(500),
  "closed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_day_closes_tenants"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "day_closes_tenant_business_date_unique"
  ON "day_closes" ("tenant_id", "business_date");

CREATE INDEX IF NOT EXISTS "idx_day_closes_tenant_id" ON "day_closes" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_day_closes_business_date" ON "day_closes" ("business_date");
