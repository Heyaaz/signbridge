import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class CaptionService {
  constructor(private readonly prismaService: PrismaService) {}

  async createFinalCaption(input: {
    roomId: string;
    sessionId: string;
    content: string;
  }) {
    const content = input.content.trim();

    if (!content) {
      throw new BadRequestException("Caption content is required");
    }

    const room = await this.prismaService.room.findUnique({
      where: { id: input.roomId }
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    const aggregate = await this.prismaService.captionEvent.aggregate({
      where: {
        roomId: input.roomId
      },
      _max: {
        sequence: true
      }
    });

    return this.prismaService.captionEvent.create({
      data: {
        roomId: input.roomId,
        speakerSessionId: input.sessionId,
        content,
        isFinal: true,
        sequence: (aggregate._max.sequence ?? 0) + 1
      }
    });
  }
}
