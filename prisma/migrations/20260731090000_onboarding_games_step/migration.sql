-- A games step at the end of onboarding, so a venue chooses what it runs before
-- it reaches the dashboard rather than discovering the choice later.
--
-- Additive: an existing venue sitting on any current step keeps that step, and
-- 'DONE' still means done. Only a venue walking the wizard from here on passes
-- through 'GAMES'.
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'GAMES' BEFORE 'DONE';
