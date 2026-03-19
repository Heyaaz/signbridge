import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class SignService {
  private readonly logger = new Logger(SignService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 확정 수화 인식 결과를 MessageEvent (sign_intent)로 DB에 저장한다.
   * 방이나 세션을 찾을 수 없는 경우 에러를 로깅하고 조용히 넘어간다.
   */
  async saveSignCaption(input: {
    roomId: string;
    sessionId: string;
    content: string;
    confidence: number;
  }): Promise<void> {
    try {
      await this.prisma.messageEvent.create({
        data: {
          roomId: input.roomId,
          senderSessionId: input.sessionId,
          content: input.content,
          messageType: "sign_intent"
        }
      });
    } catch (error) {
      this.logger.error(
        `수화 인식 저장 실패: room=${input.roomId}, session=${input.sessionId}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
