-- Role codes for the two-step login (email+password first, then a code).
-- The admin code opens the operator dashboard; the staff code opens the floor
-- and pass on any device signed into the shared account. Both are optional —
-- null until the operator sets them, and a null code is simply unusable.
ALTER TABLE "Venue" ADD COLUMN "adminPinHash" TEXT;
ALTER TABLE "Venue" ADD COLUMN "staffPinHash" TEXT;