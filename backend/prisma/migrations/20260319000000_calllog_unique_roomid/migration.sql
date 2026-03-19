-- DropIndex
DROP INDEX "CallLog_roomId_idx";

-- AlterTable: add unique constraint on roomId
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_roomId_key" UNIQUE ("roomId");
