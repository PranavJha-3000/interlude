-- The four V1 mini-game funnel events. The schema grew these when the games
-- landed; the live databases need the same values or every mini-game event
-- write fails.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SECRET_RECIPE_ATTEMPT';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SECRET_RECIPE_FOUND';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MYSTERY_BRIEF_SHOWN';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MYSTERY_MEAL_SCORED';

-- `claimantName` sat in the datamodel without ever having been migrated, so
-- every environment built purely from `migrate deploy` was missing the column
-- and any award claim crashed with ColumnNotFound.
ALTER TABLE "Award" ADD COLUMN IF NOT EXISTS "claimantName" TEXT;