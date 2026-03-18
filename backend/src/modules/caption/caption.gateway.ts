import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { CaptionService } from "./caption.service";

interface CaptionPayload {
  content: string;
}

@WebSocketGateway({
  cors: {
    origin: "*"
  }
})
export class CaptionGateway {
  @WebSocketServer()
  private server!: Server;

  constructor(private readonly captionService: CaptionService) {}

  @SubscribeMessage("caption:partial")
  handleCaptionPartial(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CaptionPayload
  ) {
    const roomId = socket.data.roomId as string | undefined;
    const sessionId = socket.data.sessionId as string | undefined;
    const nickname = socket.data.nickname as string | undefined;
    const content = payload?.content?.trim();

    if (!roomId || !sessionId || !nickname) {
      return {
        ok: false,
        error: "방에 참여하지 않은 상태입니다"
      };
    }

    if (!content) {
      return {
        ok: false,
        error: "Caption content is required"
      };
    }

    this.server.to(roomId).emit("caption:partial", {
      roomId,
      sessionId,
      nickname,
      content
    });

    return {
      ok: true
    };
  }

  @SubscribeMessage("caption:final")
  async handleCaptionFinal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CaptionPayload
  ) {
    const roomId = socket.data.roomId as string | undefined;
    const sessionId = socket.data.sessionId as string | undefined;
    const nickname = socket.data.nickname as string | undefined;
    const content = payload?.content?.trim();

    if (!roomId || !sessionId || !nickname) {
      return {
        ok: false,
        error: "방에 참여하지 않은 상태입니다"
      };
    }

    if (!content) {
      return {
        ok: false,
        error: "Caption content is required"
      };
    }

    const caption = await this.captionService.createFinalCaption({
      roomId,
      sessionId,
      content
    });

    this.server.to(roomId).emit("caption:final", {
      id: caption.id,
      roomId,
      sessionId,
      nickname,
      content: caption.content,
      sequence: caption.sequence,
      createdAt: caption.createdAt
    });

    return {
      ok: true,
      captionId: caption.id
    };
  }
}
