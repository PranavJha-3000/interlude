-- AlterTable
ALTER TABLE "VenueConfig" ADD COLUMN     "rankingWeights" JSONB NOT NULL DEFAULT '{"notSelling":40,"slowMover":25,"fastMoverPenalty":-20,"stale":15,"lowPrepBonus":10,"highPrepPenalty":-10,"slowMoverMaxUnits":3,"fastMoverMinUnits":20,"staleMinDays":2}';
