import { Injectable } from "@nestjs/common";
import { RoomStatus } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";

export type EndReason = "manual" | "disconnect";

@Injectable()
export class CallLogService {
  constructor(private readonly prismaService: PrismaService) {}

  async createForRoom(roomId: string, endReason: EndReason): Promise<void> {
    const room = await this.prismaService.room.findUnique({
      where: { id: roomId }
    });

    if (!room || room.status !== RoomStatus.ended) {
      return;
    }

    const [captionCount, messageCount] = await Promise.all([
      this.prismaService.captionEvent.count({ where: { roomId } }),
      this.prismaService.messageEvent.count({ where: { roomId } })
    ]);

    const endedAt = room.endedAt ?? new Date();
    const durationSec = room.startedAt
      ? Math.round((endedAt.getTime() - room.startedAt.getTime()) / 1000)
      : 0;

    try {
      await this.prismaService.callLog.create({
        data: {
          roomId,
          durationSec,
          captionCount,
          messageCount,
          endReason
        }
      });
    } catch (error: unknown) {
      // P2002: unique constraint — CallLog already created by concurrent request
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return;
      }
      throw error;
    }
  }
}
