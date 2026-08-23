-- Email + password as a second way for an operator to sign in (SECURITY.md §7a).
--
-- This exists because sending a magic link needs a verified sending domain and
-- the pilot does not have one yet, so every link goes nowhere. Magic link is
-- untouched — `MagicLinkToken` and its routes stay exactly as they are, and the
-- expectation is that the password becomes the secondary door again, not that
-- the link is retired.
--
-- Additive only, and nullable on purpose: every operator that already exists
-- was created by a magic link and has never chosen a password. Null means
-- "cannot use the password door", never "any password will do" — the
-- application still pays the scrypt cost on that branch so the difference is
-- not visible from outside.
ALTER TABLE "OperatorUser"
  ADD COLUMN "passwordHash" TEXT;

-- Throttling for the password endpoints, per client IP.
--
-- No email column, deliberately. Recording which addresses were guessed at
-- would assemble the list of operator addresses that SECURITY.md §7 exists to
-- refuse, and hand it to anyone who reaches the database. Per-IP is also the
-- only lockout available here: with no email channel there is no recovery path,
-- so a per-address lock would let anyone who knows an owner's address lock them
-- out of their own venue mid-service.
CREATE TABLE "OperatorLoginAttempt" (
  "id"        TEXT NOT NULL,
  "ip"        TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorLoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorLoginAttempt_ip_createdAt_idx"
  ON "OperatorLoginAttempt"("ip", "createdAt");
