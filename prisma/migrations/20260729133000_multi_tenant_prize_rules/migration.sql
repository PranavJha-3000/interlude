-- Multi-tenancy, operator identity, and venue-set prize rules.
--
-- Hand-written rather than generated, for two reasons the generator got wrong:
--   1. It emitted the AwardKind enum swap *before* creating "PrizeRule", so it
--      tried to alter a column on a table that did not exist yet.
--   2. It dropped 'HALF_PRICE' without converting the rows using it. A half
--      price award is now PERCENT_OFF with percentOff = 50, and existing awards
--      have to be migrated to say so — they are an operator's audit trail.

-- CreateEnum
CREATE TYPE "RuleWindow" AS ENUM ('ANY', 'PEAK', 'OFF_PEAK');

-- CreateEnum
CREATE TYPE "OperatorRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('DETAILS', 'TABLES', 'MENU', 'STAFF', 'QR', 'DONE');

-- AlterTable: the new award detail columns, added before the enum swap so the
-- backfill below has somewhere to record the percentage.
ALTER TABLE "Award" ADD COLUMN     "fixedPricePaise" INTEGER,
ADD COLUMN     "percentOff" INTEGER,
ADD COLUMN     "ruleId" TEXT;

-- Backfill: every existing HALF_PRICE award was a 50% discount by definition.
UPDATE "Award" SET "percentOff" = 50 WHERE "kind" = 'HALF_PRICE';

-- AlterEnum: HALF_PRICE was a hardcoded 50, which PLATFORM.md §10 forbids.
-- Existing rows are mapped rather than dropped.
BEGIN;
CREATE TYPE "AwardKind_new" AS ENUM ('FREE', 'PERCENT_OFF', 'FIXED_PRICE');
ALTER TABLE "Award" ALTER COLUMN "kind" TYPE "AwardKind_new" USING (
  CASE "kind"::text WHEN 'HALF_PRICE' THEN 'PERCENT_OFF' ELSE "kind"::text END
)::"AwardKind_new";
ALTER TYPE "AwardKind" RENAME TO "AwardKind_old";
ALTER TYPE "AwardKind_new" RENAME TO "AwardKind";
DROP TYPE "public"."AwardKind_old";
COMMIT;

-- AlterTable: the venue QR. Nullable, backfilled, then made required — an
-- existing venue must come out of this migration with a working printable code.
ALTER TABLE "Venue" ADD COLUMN     "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'DETAILS',
ADD COLUMN     "qrToken" TEXT;

UPDATE "Venue"
SET "qrToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "qrToken" IS NULL;

ALTER TABLE "Venue" ALTER COLUMN "qrToken" SET NOT NULL;

-- A venue that already has tables and a menu is past the setup steps.
UPDATE "Venue" SET "onboardingStep" = 'DONE'
WHERE EXISTS (SELECT 1 FROM "Table" t WHERE t."venueId" = "Venue"."id")
  AND EXISTS (SELECT 1 FROM "MenuItem" m WHERE m."venueId" = "Venue"."id");

-- AlterTable: venueId becomes nullable — signing up creates the person, and
-- creating their venue is a later step that may be abandoned halfway.
ALTER TABLE "OperatorUser" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "role" "OperatorRole" NOT NULL DEFAULT 'OWNER',
ALTER COLUMN "venueId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedFromIp" TEXT,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeRule" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "label" TEXT NOT NULL,
    "mechanic" "Mechanic" NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "marginTier" "MarginTier",
    "category" TEXT,
    "menuItemId" TEXT,
    "window" "RuleWindow" NOT NULL DEFAULT 'ANY',
    "kind" "AwardKind" NOT NULL,
    "percentOff" INTEGER,
    "fixedPricePaise" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrizeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_operatorUserId_createdAt_idx" ON "MagicLinkToken"("operatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "PrizeRule_venueId_active_priority_idx" ON "PrizeRule"("venueId", "active", "priority");

-- CreateIndex
CREATE INDEX "OperatorUser_venueId_idx" ON "OperatorUser"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_qrToken_key" ON "Venue"("qrToken");

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "OperatorUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeRule" ADD CONSTRAINT "PrizeRule_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
