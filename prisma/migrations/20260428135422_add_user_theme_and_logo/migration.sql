-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "amount_due" DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN     "amount_paid" DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN     "change_given" DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN     "discount_amount" DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN     "is_part_payment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "shop_logo_url" VARCHAR(500),
ADD COLUMN     "theme_color" VARCHAR(20);
