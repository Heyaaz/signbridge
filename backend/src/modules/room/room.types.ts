import { Role, RoomStatus } from "@prisma/client";

export interface CreateRoomBody {
  nickname: string;
  role: Role;
}

export interface JoinRoomBody {
  nickname: string;
  role: Role;
}

export interface RoomParticipantSummary {
  sessionId: string;
  nickname: string;
  role: Role;
  connectionState: string;
  joinedAt: Date;
}

export interface RoomSummary {
  id: string;
  inviteCode: string;
  status: RoomStatus;
  participants: RoomParticipantSummary[];
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface SessionSummary {
  sessionId: string;
  sessionToken: string;
  nickname: string;
  role: Role;
}
