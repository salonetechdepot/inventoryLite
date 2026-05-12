-- CreateTable: receipts
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "SaleType" NOT NULL DEFAULT 'SALE',
    "customer_name" VARCHAR(255),
    "customer_phone" VARCHAR(50),
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "net_amount" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "amount_paid" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "amount_due" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "change_given" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "is_part_payment" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_receipts_user_id" ON "receipts"("user_id");
CREATE INDEX "idx_receipts_created_at" ON "receipts"("created_at");
CREATE INDEX "idx_receipts_is_paid" ON "receipts"("is_paid");

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "method" VARCHAR(50) DEFAULT 'cash',
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_payments_receipt_id" ON "payments"("receipt_id");
CREATE INDEX "idx_payments_user_id" ON "payments"("user_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add receipt_id to sales
ALTER TABLE "sales" ADD COLUMN "receipt_id" UUID;

CREATE INDEX "idx_sales_receipt_id" ON "sales"("receipt_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: group existing sales rows into synthetic receipts.
-- Group key: (user_id, type, customer_name, customer_phone, discount_amount, amount_paid, amount_due, change_given, is_part_payment, created_at truncated to the second).
-- Each group becomes one receipt; sales rows are updated to point to it; an initial payment row is recorded when amount_paid > 0.
DO $$
DECLARE
    rec RECORD;
    new_receipt_id UUID;
BEGIN
    FOR rec IN
        SELECT
            user_id,
            type,
            customer_name,
            customer_phone,
            COALESCE(discount_amount, 0) AS discount_amount,
            COALESCE(amount_paid, 0)     AS amount_paid,
            COALESCE(amount_due, 0)      AS amount_due,
            COALESCE(change_given, 0)    AS change_given,
            is_part_payment,
            date_trunc('second', created_at) AS bucket,
            MIN(created_at)              AS first_created,
            SUM(total_amount)            AS subtotal,
            array_agg(id)                AS sale_ids
        FROM sales
        WHERE user_id IS NOT NULL
        GROUP BY
            user_id, type, customer_name, customer_phone,
            COALESCE(discount_amount, 0), COALESCE(amount_paid, 0),
            COALESCE(amount_due, 0), COALESCE(change_given, 0),
            is_part_payment, date_trunc('second', created_at)
    LOOP
        INSERT INTO receipts (
            user_id, type, customer_name, customer_phone,
            subtotal, discount_amount, net_amount,
            amount_paid, amount_due, change_given,
            is_part_payment, is_paid,
            created_at, updated_at
        ) VALUES (
            rec.user_id, rec.type, rec.customer_name, rec.customer_phone,
            rec.subtotal, rec.discount_amount, GREATEST(0, rec.subtotal - rec.discount_amount),
            rec.amount_paid, rec.amount_due, rec.change_given,
            rec.is_part_payment, (rec.amount_due <= 0),
            rec.first_created, rec.first_created
        )
        RETURNING id INTO new_receipt_id;

        UPDATE sales SET receipt_id = new_receipt_id WHERE id = ANY(rec.sale_ids);

        IF rec.amount_paid > 0 THEN
            INSERT INTO payments (user_id, receipt_id, amount, method, note, created_at)
            VALUES (rec.user_id, new_receipt_id, rec.amount_paid, 'cash', 'initial payment', rec.first_created);
        END IF;
    END LOOP;
END $$;
