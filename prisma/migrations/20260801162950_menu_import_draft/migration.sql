-- CreateTable
CREATE TABLE "MenuImportDraft" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuImportDraft_venueId_key" ON "MenuImportDraft"("venueId");

-- AddForeignKey
ALTER TABLE "MenuImportDraft" ADD CONSTRAINT "MenuImportDraft_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
