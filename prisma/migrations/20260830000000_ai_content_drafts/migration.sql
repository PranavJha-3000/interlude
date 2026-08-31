-- The AI Menu Experience Builder (PLATFORM.md §6a): AI drafts, a person
-- confirms. Nothing here reaches production `MenuItem` rows or game config
-- until an operator approves a draft — the same promise `MenuImportDraft`
-- makes for menu extraction, extended to the model's newer outputs.

-- What the draft is for. There is no kind that decides an outcome, prices a
-- prize or touches a business rule — AI reads and drafts, never decides.
CREATE TYPE "AiDraftKind" AS ENUM (
  'ITEM_DESCRIPTION',
  'SECRET_RECIPE',
  'MYSTERY_CUSTOMER',
  'GAME_COPY',
  'WEEKLY_NARRATION'
);

-- Draft → approved | rejected is an operator decision made on an operator
-- screen. Nothing in the codebase may move a row to APPROVED on its own.
CREATE TYPE "AiDraftStatus" AS ENUM (
  'DRAFT',
  'APPROVED',
  'REJECTED'
);

-- The approved display description lands here, and only here. The model never
-- writes to this column directly; the approve action does.
ALTER TABLE "MenuItem" ADD COLUMN "aiDescription" TEXT;

-- CreateTable
CREATE TABLE "AiContentDraft" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "AiDraftKind" NOT NULL,
    "refId" TEXT,
    "data" JSONB NOT NULL,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiContentDraft_venueId_kind_status_idx" ON "AiContentDraft"("venueId", "kind", "status");

-- CreateIndex
CREATE INDEX "AiContentDraft_venueId_refId_kind_idx" ON "AiContentDraft"("venueId", "refId", "kind");

-- AddForeignKey
ALTER TABLE "AiContentDraft" ADD CONSTRAINT "AiContentDraft_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;