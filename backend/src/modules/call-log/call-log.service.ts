import { Injectable } from "@nestjs/common";
import { RoomStatus } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class CallLogService {
  constructor(private readonly prismaService: PrismaService) {}

  async createForRoom(roomId: string, endReason: string): Promise<void> {
    const room = await this.prismaService.room.findUnique({
      where: { id: roomId }
    });

    if (!room || room.status !== RoomStatus.ended) {
      return;
    }

    const existing = await this.prismaService.callLog.findFirst({
      where: { roomId }
    });

    if (existing) {
      return;
    }

    const [captionCount, messageCount] = await Promise.all([
      this.prismaService.captionEvent.count({ where: { roomId } }),
      this.prismaService.messageEvent.count({ where: { roomId } })
    ]);

    const durationSec = room.startedAt
      ? Math.round((Date.now() - room.startedAt.getTime()) / 1000)
      : 0;

    await this.prismaService.callLog.create({
      data: {
        roomId,
        durationSec,
        captionCount,
        messageCount,
        endReason
      }
    });
  }
}
