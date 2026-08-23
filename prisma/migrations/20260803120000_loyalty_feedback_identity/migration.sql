-- CreateEnum
CREATE TYPE "AwardOrigin" AS ENUM ('GAME', 'LOYALTY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'LOYALTY_STAMPED';
ALTER TYPE "EventType" ADD VALUE 'LOYALTY_REWARDED';
ALTER TYPE "EventType" ADD VALUE 'PHONE_ERASED';

-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "origin" "AwardOrigin" NOT NULL DEFAULT 'GAME';

-- AlterTable
ALTER TABLE "VenueConfig" ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyIdentityExpiryDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "loyaltyRewardMaxValuePaise" INTEGER NOT NULL DEFAULT 25000,
ADD COLUMN     "loyaltyVisitsRequired" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "reviewsPerWeekBaseline" INTEGER;

-- CreateTable
CREATE TABLE "GuestVisit" (
    "id" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tableRunId" TEXT,
    "visitNumber" INTEGER NOT NULL,
    "awardId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestVisit_awardId_key" ON "GuestVisit"("awardId");

-- CreateIndex
CREATE INDEX "GuestVisit_venueId_recordedAt_idx" ON "GuestVisit"("venueId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestVisit_guestIdentityId_serviceId_key" ON "GuestVisit"("guestIdentityId", "serviceId");

-- CreateIndex
CREATE INDEX "GuestIdentity_venueId_lastSeenAt_idx" ON "GuestIdentity"("venueId", "lastSeenAt");

-- Dedupe ReviewPrompt before constraining it.
--
-- Hand-written; `prisma migrate diff` cannot know this is safe. The screen used
-- a findFirst-then-create, so a polled or reloaded run could produce more than
-- one row for the same table. The unique index below is what turns those two
-- writes into idempotent upserts, and it cannot be created while duplicates
-- exist.
--
-- Keeps the EARLIEST row per table run, because `shownAt` on that row is the
-- true moment the prompt was first shown — keeping the latest would quietly
-- shift every funnel timestamp forward.
DELETE FROM "ReviewPrompt" a
USING "ReviewPrompt" b
WHERE a."tableRunId" IS NOT NULL
  AND a."tableRunId" = b."tableRunId"
  AND (a."shownAt" > b."shownAt" OR (a."shownAt" = b."shownAt" AND a."id" > b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPrompt_tableRunId_key" ON "ReviewPrompt"("tableRunId");

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE SET NULL ON UPDATE CASCADE;
