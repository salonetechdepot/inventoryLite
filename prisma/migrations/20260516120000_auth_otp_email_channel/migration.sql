-- AlterTable
ALTER TABLE "auth_otps" ADD COLUMN "channel" VARCHAR(20) NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "auth_otps" ADD COLUMN "email" VARCHAR(255);
ALTER TABLE "auth_otps" ALTER COLUMN "phone_e164" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "auth_otps_email_purpose_idx" ON "auth_otps"("email", "purpose");
