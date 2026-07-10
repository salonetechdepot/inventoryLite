-- Tenant account lock (lost device / security)
ALTER TABLE "tenant_settings"
ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(6),
ADD COLUMN IF NOT EXISTS "locked_reason" VARCHAR(500),
ADD COLUMN IF NOT EXISTS "locked_by" VARCHAR(255);
