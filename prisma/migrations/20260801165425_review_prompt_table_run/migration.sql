-- AlterTable
ALTER TABLE "ReviewPrompt" ADD COLUMN     "tableRunId" TEXT,
ALTER COLUMN "guestSessionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ReviewPrompt" ADD CONSTRAINT "ReviewPrompt_tableRunId_fkey" FOREIGN KEY ("tableRunId") REFERENCES "TableRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
