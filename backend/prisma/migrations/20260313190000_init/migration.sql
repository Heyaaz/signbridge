CREATE TYPE "Role" AS ENUM ('deaf', 'speaker', 'guest');
CREATE TYPE "RoomStatus" AS ENUM ('waiting', 'active', 'ended');
CREATE TYPE "MessageType" AS ENUM ('text', 'quick_reply', 'sign_intent');

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Room" (
  "id" TEXT NOT NULL,
  "inviteCode" TEXT NOT NULL,
  "status" "RoomStatus" NOT NULL DEFAULT 'waiting',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomParticipant" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "connectionState" TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT "RoomParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaptionEvent" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "speakerSessionId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isFinal" BOOLEAN NOT NULL DEFAULT false,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageEvent" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "senderSessionId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "messageType" "MessageType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallLog" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "captionCount" INTEGER NOT NULL DEFAULT 0,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "endReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_inviteCode_key" ON "Room"("inviteCode");
CREATE INDEX "RoomParticipant_roomId_idx" ON "RoomParticipant"("roomId");
CREATE INDEX "RoomParticipant_sessionId_idx" ON "RoomParticipant"("sessionId");
CREATE INDEX "CaptionEvent_roomId_idx" ON "CaptionEvent"("roomId");
CREATE INDEX "CaptionEvent_speakerSessionId_idx" ON "CaptionEvent"("speakerSessionId");
CREATE INDEX "MessageEvent_roomId_idx" ON "MessageEvent"("roomId");
CREATE INDEX "MessageEvent_senderSessionId_idx" ON "MessageEvent"("senderSessionId");
CREATE INDEX "CallLog_roomId_idx" ON "CallLog"("roomId");

ALTER TABLE "RoomParticipant"
  ADD CONSTRAINT "RoomParticipant_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomParticipant"
  ADD CONSTRAINT "RoomParticipant_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaptionEvent"
  ADD CONSTRAINT "CaptionEvent_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaptionEvent"
  ADD CONSTRAINT "CaptionEvent_speakerSessionId_fkey"
  FOREIGN KEY ("speakerSessionId") REFERENCES "UserSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageEvent"
  ADD CONSTRAINT "MessageEvent_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageEvent"
  ADD CONSTRAINT "MessageEvent_senderSessionId_fkey"
  FOREIGN KEY ("senderSessionId") REFERENCES "UserSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallLog"
  ADD CONSTRAINT "CallLog_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
