-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('SEALED', 'OPENED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK', 'DISCARD');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "return_condition" "ReturnCondition",
ADD COLUMN "return_disposition" "ReturnDisposition";
