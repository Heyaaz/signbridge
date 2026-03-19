import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { MessageType, Prisma, RoomStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { SessionDto } from "./dto/session.dto";
import { RoomSummary, SessionSummary } from "./room.types";

@Injectable()
export class RoomService {
  constructor(private readonly prismaService: PrismaService) {}

  async createRoom(payload: SessionDto) {
    const inviteCode = await this.createUniqueInviteCode();

    const result = await this.prismaService.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          inviteCode
        }
      });

      const session = await tx.userSession.create({
        data: {
          nickname: payload.nickname,
          role: payload.role,
          sessionToken: this.createSessionToken()
        }
      });

      await tx.roomParticipant.create({
        data: {
          roomId: room.id,
          sessionId: session.id,
          connectionState: "created"
        }
      });

      return { room, session };
    });

    return {
      roomId: result.room.id,
      inviteCode: result.room.inviteCode,
      sessionToken: result.session.sessionToken,
      sessionId: result.session.id
    };
  }

  async joinRoom(roomId: string, payload: SessionDto) {
    // 방 조회, 참가자 수 체크, 세션/참가자 생성을 모두 하나의 트랜잭션으로 묶어
    // 동시 접속 시 "방 정원 초과" 레이스 컨디션을 방지한다
    const result = await this.prismaService.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          participants: {
            where: { leftAt: null }
          }
        }
      });

      if (!room) {
        throw new NotFoundException("Room not found");
      }

      if (room.status === RoomStatus.ended) {
        throw new BadRequestException("Ended room cannot be joined");
      }

      if (room.participants.length >= 2) {
        throw new BadRequestException("Room is full");
      }

      const session = await tx.userSession.create({
        data: {
          nickname: payload.nickname,
          role: payload.role,
          sessionToken: this.createSessionToken()
        }
      });

      await tx.roomParticipant.create({
        data: {
          roomId,
          sessionId: session.id,
          connectionState: "joined"
        }
      });

      const nextStatus = room.participants.length === 1 ? RoomStatus.active : room.status;

      const updatedRoom = await tx.room.update({
        where: { id: roomId },
        data: {
          status: nextStatus,
          startedAt: nextStatus === RoomStatus.active ? room.startedAt ?? new Date() : room.startedAt
        }
      });

      return { session, room: updatedRoom };
    });

    return {
      roomId: result.room.id,
      inviteCode: result.room.inviteCode,
      sessionToken: result.session.sessionToken,
      sessionId: result.session.id,
      status: result.room.status
    };
  }

  async getRoom(roomId: string): Promise<RoomSummary> {
    const room = await this.prismaService.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            session: true
          },
          orderBy: {
            joinedAt: "asc"
          }
        }
      }
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    return this.mapRoomSummary(room);
  }

  async getRoomByInviteCode(inviteCode: string) {
    const room = await this.prismaService.room.findUnique({
      where: {
        inviteCode: inviteCode.trim().toUpperCase()
      }
    });

    if (!room) {
      throw new NotFoundException("Invite code not found");
    }

    return {
      roomId: room.id,
      inviteCode: room.inviteCode,
      status: room.status
    };
  }

  async findSessionByToken(sessionToken: string): Promise<SessionSummary | null> {
    const session = await this.prismaService.userSession.findUnique({
      where: { sessionToken }
    });

    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      sessionToken: session.sessionToken,
      nickname: session.nickname,
      role: session.role
    };
  }

  async markParticipantConnection(
    roomId: string,
    sessionId: string,
    connectionState: string
  ) {
    await this.prismaService.roomParticipant.updateMany({
      where: {
        roomId,
        sessionId,
        leftAt: null
      },
      data: {
        connectionState
      }
    });
  }

  async markParticipantLeft(roomId: string, sessionId: string): Promise<boolean> {
    return this.prismaService.$transaction(async (tx) => {
      const result = await tx.roomParticipant.updateMany({
        where: {
          roomId,
          sessionId,
          leftAt: null
        },
        data: {
          leftAt: new Date(),
          connectionState: "left"
        }
      });

      if (result.count === 0) {
        return false;
      }

      const activeParticipants = await tx.roomParticipant.count({
        where: {
          roomId,
          leftAt: null
        }
      });

      const roomEnded = activeParticipants === 0;

      await tx.room.update({
        where: { id: roomId },
        data: {
          status: roomEnded ? RoomStatus.ended : RoomStatus.waiting,
          endedAt: roomEnded ? new Date() : null
        }
      });

      return roomEnded;
    });
  }

  async createMessageEvent(input: {
    roomId: string;
    sessionId: string;
    content: string;
    messageType: MessageType;
  }) {
    const room = await this.prismaService.room.findUnique({
      where: { id: input.roomId }
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    const message = await this.prismaService.messageEvent.create({
      data: {
        roomId: input.roomId,
        senderSessionId: input.sessionId,
        content: input.content.trim(),
        messageType: input.messageType
      }
    });

    return message;
  }

  private async createUniqueInviteCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const inviteCode = randomBytes(4).toString("base64url").slice(0, 6).toUpperCase();
      const existingRoom = await this.prismaService.room.findUnique({
        where: { inviteCode }
      });

      if (!existingRoom) {
        return inviteCode;
      }
    }

    throw new BadRequestException("Could not create invite code");
  }

  private createSessionToken() {
    return `session_${randomBytes(18).toString("base64url")}`;
  }

  private mapRoomSummary(
    room: Prisma.RoomGetPayload<{
      include: {
        participants: {
          include: {
            session: true;
          };
        };
      };
    }>
  ): RoomSummary {
    return {
      id: room.id,
      inviteCode: room.inviteCode,
      status: room.status,
      startedAt: room.startedAt,
      endedAt: room.endedAt,
      participants: room.participants.map((participant) => ({
        sessionId: participant.sessionId,
        nickname: participant.session.nickname,
        role: participant.session.role,
        connectionState: participant.connectionState,
        joinedAt: participant.joinedAt
      }))
    };
  }
}
