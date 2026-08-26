-- Restaurant referral capture — the public "/refer" route backing the landing
-- page's "Refer a Restaurant" CTA.
--
-- Additive only: one new table, no changes to existing models, so a failed
-- rollout rolls back with a single DROP and touches nothing else.
--
-- submitterKey is an HMAC of the submitting IP keyed by SESSION_SECRET, not
-- the address itself — the same DPDP posture as Venue.phoneSalt. It indexes
-- beside createdAt because that pair IS the rate limiter's query.
CREATE TABLE "RestaurantReferral" (
    "id"              TEXT        NOT NULL,
    "restaurantName"  TEXT        NOT NULL,
    "location"        TEXT        NOT NULL,
    "pocName"         TEXT        NOT NULL,
    "pocPhone"        TEXT        NOT NULL,
    "pocRoleTitle"    TEXT        NOT NULL,
    "referrerName"    TEXT        NOT NULL,
    "referrerContact" TEXT        NOT NULL,
    "submitterKey"    TEXT        NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantReferral_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestaurantReferral_submitterKey_createdAt_idx"
  ON "RestaurantReferral"("submitterKey", "createdAt");
CREATE INDEX "RestaurantReferral_createdAt_idx"
  ON "RestaurantReferral"("createdAt");