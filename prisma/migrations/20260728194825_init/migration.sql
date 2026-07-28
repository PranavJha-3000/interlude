-- CreateEnum
CREATE TYPE "Arm" AS ENUM ('TREATMENT', 'CONTROL');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SERVER', 'KITCHEN');

-- CreateEnum
CREATE TYPE "MarginTier" AS ENUM ('HIGH', 'MID', 'LOW');

-- CreateEnum
CREATE TYPE "PrepBurden" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LoadLevel" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateEnum
CREATE TYPE "Mechanic" AS ENUM ('KITCHEN_ROUND', 'MYSTERY_PLATE');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('WIN', 'LOSE');

-- CreateEnum
CREATE TYPE "AwardKind" AS ENUM ('FREE', 'HALF_PRICE', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "AwardStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AddOnStatus" AS ENUM ('REQUESTED', 'ACKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "phoneSalt" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueConfig" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "quizLengthSec" INTEGER NOT NULL DEFAULT 75,
    "countdownBufferSec" INTEGER NOT NULL DEFAULT 60,
    "quizQuestionCount" INTEGER NOT NULL DEFAULT 8,
    "winThresholdPct" INTEGER NOT NULL DEFAULT 70,
    "prepMinutesByCategory" JSONB NOT NULL DEFAULT '{}',
    "depthCapPerItemPct" INTEGER NOT NULL DEFAULT 100,
    "depthCapPerServicePaise" INTEGER NOT NULL DEFAULT 500000,
    "mysteryPlatePricePaise" INTEGER NOT NULL DEFAULT 9900,
    "peakStartMinute" INTEGER NOT NULL DEFAULT 1140,
    "peakEndMinute" INTEGER NOT NULL DEFAULT 1380,
    "attachDeltaGatePp" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "ticketDeltaKillPct" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "ticketDeltaProceedPct" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "scanRateKillPct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "scanRateGoodPct" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "completionRateGatePct" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "reviewVelocityGateX" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "pinHash" TEXT NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorUser" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableArmAssignment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "arm" "Arm" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableArmAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "foodCostPaise" INTEGER NOT NULL,
    "marginTier" "MarginTier" NOT NULL,
    "prepBurden" "PrepBurden" NOT NULL DEFAULT 'LOW',
    "requiresKitchenWork" BOOLEAN NOT NULL DEFAULT true,
    "isHero" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trailingSales" INTEGER NOT NULL DEFAULT 0,
    "lastSoldAt" TIMESTAMP(3),

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChefVeto" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "ChefVeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenLoad" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "serviceId" TEXT,
    "level" "LoadLevel" NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setById" TEXT,

    CONSTRAINT "KitchenLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizePool" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "mechanic" "Mechanic" NOT NULL,
    "kitchenLoad" "LoadLevel" NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entries" JSONB NOT NULL,
    "excluded" JSONB NOT NULL,

    CONSTRAINT "PrizePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "armAssignmentId" TEXT,
    "armAtScan" "Arm" NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Play" (
    "id" TEXT NOT NULL,
    "guestSessionId" TEXT NOT NULL,
    "mechanic" "Mechanic" NOT NULL,
    "quizPackId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL,
    "outcome" "Outcome",
    "answers" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "playId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "prizePoolId" TEXT,
    "kind" "AwardKind" NOT NULL,
    "valuePaise" INTEGER NOT NULL,
    "foodCostPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AwardStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnRequest" (
    "id" TEXT NOT NULL,
    "guestSessionId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "pricePaise" INTEGER NOT NULL,
    "foodCostPaise" INTEGER NOT NULL,
    "status" "AddOnStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackedAt" TIMESTAMP(3),

    CONSTRAINT "AddOnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFire" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estReadyAt" TIMESTAMP(3) NOT NULL,
    "firedById" TEXT,

    CONSTRAINT "OrderFire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizPack" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuizPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "orderHint" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tableId" TEXT,
    "externalRef" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewPrompt" (
    "id" TEXT NOT NULL,
    "guestSessionId" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftedAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),

    CONSTRAINT "ReviewPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestIdentity" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "phoneHmac" TEXT NOT NULL,
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VenueConfig_venueId_key" ON "VenueConfig"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_qrToken_key" ON "Table"("qrToken");

-- CreateIndex
CREATE INDEX "Table_venueId_idx" ON "Table"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_venueId_label_key" ON "Table"("venueId", "label");

-- CreateIndex
CREATE INDEX "StaffUser_venueId_idx" ON "StaffUser"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorUser_email_key" ON "OperatorUser"("email");

-- CreateIndex
CREATE INDEX "Service_venueId_startedAt_idx" ON "Service"("venueId", "startedAt");

-- CreateIndex
CREATE INDEX "TableArmAssignment_serviceId_tableId_idx" ON "TableArmAssignment"("serviceId", "tableId");

-- CreateIndex
CREATE INDEX "TableArmAssignment_tableId_effectiveFrom_idx" ON "TableArmAssignment"("tableId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "MenuItem_venueId_active_idx" ON "MenuItem"("venueId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_venueId_name_key" ON "MenuItem"("venueId", "name");

-- CreateIndex
CREATE INDEX "ChefVeto_venueId_active_idx" ON "ChefVeto"("venueId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ChefVeto_menuItemId_key" ON "ChefVeto"("menuItemId");

-- CreateIndex
CREATE INDEX "KitchenLoad_venueId_setAt_idx" ON "KitchenLoad"("venueId", "setAt");

-- CreateIndex
CREATE INDEX "PrizePool_serviceId_snapshotAt_idx" ON "PrizePool"("serviceId", "snapshotAt");

-- CreateIndex
CREATE INDEX "GuestSession_serviceId_startedAt_idx" ON "GuestSession"("serviceId", "startedAt");

-- CreateIndex
CREATE INDEX "GuestSession_tableId_idx" ON "GuestSession"("tableId");

-- CreateIndex
CREATE INDEX "Play_guestSessionId_idx" ON "Play"("guestSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Award_playId_key" ON "Award"("playId");

-- CreateIndex
CREATE INDEX "Award_status_createdAt_idx" ON "Award"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AddOnRequest_status_requestedAt_idx" ON "AddOnRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "AddOnRequest_guestSessionId_idx" ON "AddOnRequest"("guestSessionId");

-- CreateIndex
CREATE INDEX "OrderFire_serviceId_firedAt_idx" ON "OrderFire"("serviceId", "firedAt");

-- CreateIndex
CREATE INDEX "OrderFire_tableId_firedAt_idx" ON "OrderFire"("tableId", "firedAt");

-- CreateIndex
CREATE INDEX "QuizQuestion_packId_orderHint_idx" ON "QuizQuestion"("packId", "orderHint");

-- CreateIndex
CREATE INDEX "Ticket_serviceId_closedAt_idx" ON "Ticket"("serviceId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_serviceId_externalRef_key" ON "Ticket"("serviceId", "externalRef");

-- CreateIndex
CREATE INDEX "ReviewPrompt_shownAt_idx" ON "ReviewPrompt"("shownAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestIdentity_venueId_phoneHmac_key" ON "GuestIdentity"("venueId", "phoneHmac");

-- AddForeignKey
ALTER TABLE "VenueConfig" ADD CONSTRAINT "VenueConfig_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorUser" ADD CONSTRAINT "OperatorUser_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableArmAssignment" ADD CONSTRAINT "TableArmAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableArmAssignment" ADD CONSTRAINT "TableArmAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChefVeto" ADD CONSTRAINT "ChefVeto_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChefVeto" ADD CONSTRAINT "ChefVeto_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenLoad" ADD CONSTRAINT "KitchenLoad_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenLoad" ADD CONSTRAINT "KitchenLoad_setById_fkey" FOREIGN KEY ("setById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizePool" ADD CONSTRAINT "PrizePool_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_armAssignmentId_fkey" FOREIGN KEY ("armAssignmentId") REFERENCES "TableArmAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_quizPackId_fkey" FOREIGN KEY ("quizPackId") REFERENCES "QuizPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_playId_fkey" FOREIGN KEY ("playId") REFERENCES "Play"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_prizePoolId_fkey" FOREIGN KEY ("prizePoolId") REFERENCES "PrizePool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnRequest" ADD CONSTRAINT "AddOnRequest_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnRequest" ADD CONSTRAINT "AddOnRequest_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFire" ADD CONSTRAINT "OrderFire_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFire" ADD CONSTRAINT "OrderFire_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFire" ADD CONSTRAINT "OrderFire_firedById_fkey" FOREIGN KEY ("firedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizPack" ADD CONSTRAINT "QuizPack_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_packId_fkey" FOREIGN KEY ("packId") REFERENCES "QuizPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPrompt" ADD CONSTRAINT "ReviewPrompt_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestIdentity" ADD CONSTRAINT "GuestIdentity_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
