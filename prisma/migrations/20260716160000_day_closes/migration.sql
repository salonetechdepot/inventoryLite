-- End-of-day cash close / payment reconciliation
CREATE TABLE IF NOT EXISTS "day_closes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "expected_by_method" JSONB NOT NULL,
  "counted_by_method" JSONB NOT NULL,
  "expected_cash" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "counted_cash" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "cash_variance" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "expected_total" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "counted_total" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "total_variance" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "change_given_total" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  "sale_count" INTEGER NOT NULL DEFAULT 0,
  "return_count" INTEGER NOT NULL DEFAULT 0,
  "payment_count" INTEGER NOT NULL DEFAULT 0,
  "notes" VARCHAR(500),
  "closed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "day_closes_tenant_business_date_unique"
  ON "day_closes" ("tenant_id", "business_date");

CREATE INDEX IF NOT EXISTS "idx_day_closes_tenant_id" ON "day_closes" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_day_closes_business_date" ON "day_closes" ("business_date");
