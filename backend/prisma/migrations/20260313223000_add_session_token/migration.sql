ALTER TABLE "UserSession" ADD COLUMN "sessionToken" TEXT;

UPDATE "UserSession"
SET "sessionToken" = 'legacy_' || "id"
WHERE "sessionToken" IS NULL;

ALTER TABLE "UserSession" ALTER COLUMN "sessionToken" SET NOT NULL;

CREATE UNIQUE INDEX "UserSession_sessionToken_key" ON "UserSession"("sessionToken");
CREATE UNIQUE INDEX "RoomParticipant_roomId_sessionId_key" ON "RoomParticipant"("roomId", "sessionId");
