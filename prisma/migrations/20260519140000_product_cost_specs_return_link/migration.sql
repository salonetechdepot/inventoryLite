-- AlterTable
ALTER TABLE "products" ADD COLUMN "cost_price" DECIMAL(15,2),
ADD COLUMN "specifications" JSONB;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN "original_receipt_id" UUID;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_original_receipt_id_fkey" FOREIGN KEY ("original_receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_receipts_original_receipt_id" ON "receipts"("original_receipt_id");
