-- Per-venue game enablement.
--
-- Hand-written for the backfill: a venue with no VenueGame rows has no enabled
-- games, and task 2 treats that as "closed" on the guest surface. Every venue
-- that already exists must therefore come out of this migration with both
-- mechanics on, which is exactly the state they were in implicitly before.

-- CreateTable
CREATE TABLE "VenueGame" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "mechanic" "Mechanic" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueGame_venueId_mechanic_key" ON "VenueGame"("venueId", "mechanic");

-- CreateIndex
CREATE INDEX "VenueGame_venueId_enabled_idx" ON "VenueGame"("venueId", "enabled");

-- AddForeignKey
ALTER TABLE "VenueGame" ADD CONSTRAINT "VenueGame_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: both mechanics on for every venue that already exists.
INSERT INTO "VenueGame" ("id", "venueId", "mechanic", "enabled", "displayOrder", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text || v."id" || g.mechanic::text),
    v."id",
    g.mechanic,
    true,
    g.ord,
    NOW()
FROM "Venue" v
CROSS JOIN (VALUES
    ('KITCHEN_ROUND'::"Mechanic", 0),
    ('MYSTERY_PLATE'::"Mechanic", 1)
) AS g(mechanic, ord);
