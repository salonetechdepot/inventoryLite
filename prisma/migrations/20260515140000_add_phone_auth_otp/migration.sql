-- AlterTable
ALTER TABLE "users" ADD COLUMN "phone_e164" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateTable
CREATE TABLE "auth_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_e164" VARCHAR(20) NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "pending_json" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_otps_phone_purpose_idx" ON "auth_otps"("phone_e164", "purpose");
