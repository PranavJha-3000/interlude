-- The referrals section of the database takes its plain name: "Referral".
-- Renames the table written by 20260826203000 without moving or rewriting a
-- single value — pure metadata, reversible by swapping the two names back.
ALTER TABLE "RestaurantReferral" RENAME TO "Referral";

ALTER TABLE "Referral"
  RENAME CONSTRAINT "RestaurantReferral_pkey" TO "Referral_pkey";

ALTER INDEX "RestaurantReferral_submitterKey_createdAt_idx"
  RENAME TO "Referral_submitterKey_createdAt_idx";
ALTER INDEX "RestaurantReferral_createdAt_idx"
  RENAME TO "Referral_createdAt_idx";