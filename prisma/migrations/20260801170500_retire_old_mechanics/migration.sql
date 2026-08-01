-- Retire the climb and the mystery plate. The spec ships one game and Beat
-- the Kitchen is playable end to end, so the platform's mechanic list
-- collapses to it. This migration is data, not schema: old rows are history
-- and stay readable; what changes is what runs.

-- Every venue gets a BEAT_THE_KITCHEN game row if it lacks one. It arrives
-- enabled when the venue had any game enabled (or no rows at all — a venue
-- must not be silently closed by a platform change); a venue that had turned
-- everything off deliberately stays off.
INSERT INTO "VenueGame" ("id", "venueId", "mechanic", "enabled", "displayOrder", "updatedAt")
SELECT
  gen_random_uuid()::text,
  v."id",
  'BEAT_THE_KITCHEN',
  COALESCE((SELECT bool_or(vg."enabled") FROM "VenueGame" vg WHERE vg."venueId" = v."id"), true),
  0,
  now()
FROM "Venue" v
WHERE NOT EXISTS (
  SELECT 1 FROM "VenueGame" vg
  WHERE vg."venueId" = v."id" AND vg."mechanic" = 'BEAT_THE_KITCHEN'
);

-- Retired mechanics stop being offered. The rows stay — an operational
-- decision worth a timestamp is worth keeping after it stops mattering.
UPDATE "VenueGame"
SET "enabled" = false, "updatedAt" = now()
WHERE "mechanic" IN ('KITCHEN_ROUND', 'MYSTERY_PLATE') AND "enabled" = true;

-- Venues whose prize policy only names retired mechanics get the starting
-- BEAT_THE_KITCHEN policy, mirroring defaultPrizeRules(): concede less at
-- peak, a win is on the house, a loss is still worth half. Their own rules
-- stay untouched — an operator's edits are theirs.
INSERT INTO "PrizeRule"
  ("id", "venueId", "priority", "label", "mechanic", "outcome", "marginTier", "category", "menuItemId", "window", "kind", "percentOff", "fixedPricePaise", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."id", 10, 'Low margin at peak — half off rather than free', 'BEAT_THE_KITCHEN', 'WIN', 'LOW', NULL, NULL, 'PEAK', 'PERCENT_OFF', 50, NULL, true, now(), now()
FROM "Venue" v
WHERE NOT EXISTS (
  SELECT 1 FROM "PrizeRule" pr WHERE pr."venueId" = v."id" AND pr."mechanic" = 'BEAT_THE_KITCHEN'
);

INSERT INTO "PrizeRule"
  ("id", "venueId", "priority", "label", "mechanic", "outcome", "marginTier", "category", "menuItemId", "window", "kind", "percentOff", "fixedPricePaise", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."id", 100, 'Beat the kitchen — on the house', 'BEAT_THE_KITCHEN', 'WIN', NULL, NULL, NULL, 'ANY', 'FREE', NULL, NULL, true, now(), now()
FROM "Venue" v
WHERE NOT EXISTS (
  SELECT 1 FROM "PrizeRule" pr
  WHERE pr."venueId" = v."id" AND pr."mechanic" = 'BEAT_THE_KITCHEN' AND pr."outcome" = 'WIN' AND pr."window" = 'ANY'
);

INSERT INTO "PrizeRule"
  ("id", "venueId", "priority", "label", "mechanic", "outcome", "marginTier", "category", "menuItemId", "window", "kind", "percentOff", "fixedPricePaise", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."id", 100, 'Close one — half off', 'BEAT_THE_KITCHEN', 'LOSE', NULL, NULL, NULL, 'ANY', 'PERCENT_OFF', 50, NULL, true, now(), now()
FROM "Venue" v
WHERE NOT EXISTS (
  SELECT 1 FROM "PrizeRule" pr
  WHERE pr."venueId" = v."id" AND pr."mechanic" = 'BEAT_THE_KITCHEN' AND pr."outcome" = 'LOSE'
);
