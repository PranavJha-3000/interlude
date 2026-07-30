-- The climb replaces the trivia quiz (core/mechanics/climb.ts).
--
-- Additive only. The three quiz columns are deliberately left in place: a venue
-- that already tuned them loses nothing, and dropping a column is the one
-- migration that cannot be rolled back cleanly during a pilot.
--
-- Defaults are estimates, and every one of them is venue config the operator
-- can edit (PLATFORM.md §10) — none of these numbers may become a constant in
-- code. Six rungs at roughly 25s a hand fills about two and a half minutes of
-- perfect play, so a guest on a 12-minute prep has room to fail and retry,
-- which is the point.
ALTER TABLE "VenueConfig"
  ADD COLUMN "climbRungs"     INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "climbHandSec"   INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN "climbMinRunSec" INTEGER NOT NULL DEFAULT 45;
