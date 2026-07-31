-- AlterTable
ALTER TABLE "OrderFire" ADD COLUMN     "courses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "VenueConfig" ADD COLUMN     "defaultPrepMinutes" INTEGER NOT NULL DEFAULT 12;
