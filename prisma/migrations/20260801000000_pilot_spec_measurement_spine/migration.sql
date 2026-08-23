-- CreateEnum
CREATE TYPE "ServiceArm" AS ENUM ('LIVE', 'CONTROL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TENT_PRESENT', 'SESSION_OPEN', 'CONSENT_GIVEN', 'RUN_START', 'PAIR_SHOWN', 'ANSWER', 'RUNG_REACHED', 'GAMBLE_TAKEN', 'GAMBLE_DECLINED', 'RUN_END', 'DEVICE_SPENT', 'LIFE_EARNED', 'PRIZE_TAKEN', 'ADDON_REQUESTED', 'ADDON_CONFIRMED', 'ADDON_CANCELLED', 'PHONE_SUBMITTED', 'FEEDBACK_SUBMITTED', 'AWARD_REDEEMED', 'AWARD_EXPIRED', 'REVIEW_SHOWN', 'REVIEW_OPENED', 'REVIEW_HANDED_OFF');

-- CreateEnum
CREATE TYPE "RunEndReason" AS ENUM ('WRONG_ANSWER', 'FOOD_ARRIVED', 'ABANDONED', 'TIMEOUT', 'PRIZE_TAKEN');

-- CreateEnum
CREATE TYPE "LifeAction" AS ENUM ('ADDON_CONFIRMED', 'PHONE_SUBMITTED', 'FEEDBACK_SUBMITTED');

-- AlterEnum
ALTER TYPE "Mechanic" ADD VALUE 'BEAT_THE_KITCHEN';

-- AlterTable
ALTER TABLE "AddOnRequest" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "tableRunId" TEXT;

-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "code" TEXT,
ADD COLUMN     "redeemedAt" TIMESTAMP(3),
ADD COLUMN     "redeemedById" TEXT,
ADD COLUMN     "rung" INTEGER,
ADD COLUMN     "tableRunId" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "chefRank" INTEGER,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "prepMinutes" INTEGER,
ADD COLUMN     "salesImportedAt" TIMESTAMP(3),
ADD COLUMN     "station" TEXT;

-- AlterTable
ALTER TABLE "OrderFire" ADD COLUMN     "partySize" INTEGER;

-- AlterTable
ALTER TABLE "ReviewPrompt" ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "arm" "ServiceArm" NOT NULL DEFAULT 'LIVE',
ADD COLUMN     "killedAt" TIMESTAMP(3),
ADD COLUMN     "killedById" TEXT,
ADD COLUMN     "serviceDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "covers" INTEGER,
ADD COLUMN     "posRef" TEXT;

-- AlterTable
ALTER TABLE "VenueConfig" ADD COLUMN     "fallbackMenuItemId" TEXT,
ADD COLUMN     "gamblePenaltyRungs" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ladderRungs" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "lifeForAddOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lifeForFeedback" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lifeForPhone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pairGapRatio" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
ADD COLUMN     "questionSeconds" INTEGER,
ADD COLUMN     "startingLives" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "untimedAfterSec" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "velocityWindowDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "ServiceArmAssignment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "arm" "ServiceArm" NOT NULL,
    "reason" TEXT NOT NULL,
    "supersedesId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,

    CONSTRAINT "ServiceArmAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableRun" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "currentRung" INTEGER NOT NULL DEFAULT 0,
    "livesRemaining" INTEGER NOT NULL DEFAULT 0,
    "pairsShown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partySize" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TableRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" TEXT NOT NULL,
    "tableRunId" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spentAt" TIMESTAMP(3),

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "serviceId" TEXT NOT NULL,
    "arm" "ServiceArm" NOT NULL,
    "tableRunId" TEXT,
    "deviceSessionId" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTableMap" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "posRef" TEXT NOT NULL,

    CONSTRAINT "PosTableMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueFeedback" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tableRunId" TEXT,
    "body" TEXT NOT NULL,
    "rating" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalService" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "weekday" INTEGER NOT NULL,
    "covers" INTEGER NOT NULL,
    "tableCount" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "attachedTableCount" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceArmAssignment_serviceId_recordedAt_idx" ON "ServiceArmAssignment"("serviceId", "recordedAt");

-- CreateIndex
CREATE INDEX "TableRun_serviceId_openedAt_idx" ON "TableRun"("serviceId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableRun_serviceId_tableId_key" ON "TableRun"("serviceId", "tableId");

-- CreateIndex
CREATE INDEX "DeviceSession_tableRunId_idx" ON "DeviceSession"("tableRunId");

-- CreateIndex
CREATE INDEX "Event_serviceId_at_idx" ON "Event"("serviceId", "at");

-- CreateIndex
CREATE INDEX "Event_type_at_idx" ON "Event"("type", "at");

-- CreateIndex
CREATE INDEX "Event_tableRunId_at_idx" ON "Event"("tableRunId", "at");

-- CreateIndex
CREATE INDEX "PosTableMap_tableId_idx" ON "PosTableMap"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTableMap_venueId_posRef_key" ON "PosTableMap"("venueId", "posRef");

-- CreateIndex
CREATE INDEX "VenueFeedback_serviceId_submittedAt_idx" ON "VenueFeedback"("serviceId", "submittedAt");

-- CreateIndex
CREATE INDEX "HistoricalService_venueId_weekday_idx" ON "HistoricalService"("venueId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalService_venueId_serviceDate_key" ON "HistoricalService"("venueId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Award_code_key" ON "Award"("code");

-- CreateIndex
CREATE INDEX "Service_venueId_serviceDate_idx" ON "Service"("venueId", "serviceDate");

-- CreateIndex
CREATE INDEX "Ticket_serviceId_tableId_idx" ON "Ticket"("serviceId", "tableId");

-- AddForeignKey
ALTER TABLE "ServiceArmAssignment" ADD CONSTRAINT "ServiceArmAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableRun" ADD CONSTRAINT "TableRun_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableRun" ADD CONSTRAINT "TableRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_deviceSessionId_fkey" FOREIGN KEY ("deviceSessionId") REFERENCES "DeviceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTableMap" ADD CONSTRAINT "PosTableMap_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTableMap" ADD CONSTRAINT "PosTableMap_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueFeedback" ADD CONSTRAINT "VenueFeedback_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueFeedback" ADD CONSTRAINT "VenueFeedback_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnRequest" ADD CONSTRAINT "AddOnRequest_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalService" ADD CONSTRAINT "HistoricalService_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPrompt" ADD CONSTRAINT "ReviewPrompt_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
