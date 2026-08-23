-- The three-game V1 product: Secret Recipe and Mystery Customer join Beat the
-- Kitchen. Both new mechanics are configured per venue through `VenueGame.data`,
-- so no venue business constant enters code (PLATFORM.md §10).
ALTER TYPE "Mechanic" ADD VALUE 'SECRET_RECIPE';
ALTER TYPE "Mechanic" ADD VALUE 'MYSTERY_CUSTOMER';

-- Per-venue game configuration. Secret Recipe keeps its ingredients and
-- combinations here; Mystery Customer keeps its brief options and course
-- slots. Json, because the shape belongs to the game, not to the schema —
-- the same reason `Event.detail` is Json.
ALTER TABLE "VenueGame" ADD COLUMN "data" JSONB;