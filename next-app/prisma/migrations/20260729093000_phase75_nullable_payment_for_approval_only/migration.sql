-- AlterTable
ALTER TABLE "delivery_bundles" ALTER COLUMN "paymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "download_grants" ALTER COLUMN "paymentId" DROP NOT NULL;

