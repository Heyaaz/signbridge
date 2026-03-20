import { MessageType } from "@prisma/client";
import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { CallLogService } from "../call-log/call-log.service";
import { RoomService } from "../room/room.service";

const MAX_MESSAGE_LENGTH = 500;

interface JoinRoomPayload {
  roomId: string;
  sessionToken: string;
}

interface SignalRelayPayload {
  roomId: string;
  targetSessionId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface MessagePayload {
  roomId: string;
  sessionToken: string;
  content: string;
}

interface CallEndPayload {
  roomId: string;
  sessionToken: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? "*"
  }
})
export class SignalingGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(SignalingGateway.name);

  constructor(
    private readonly roomService: RoomService,
    private readonly callLogService: CallLogService
  ) {}

  async handleDisconnect(socket: Socket) {
    const roomId = socket.data.roomId as string | undefined;
    const sessionId = socket.data.sessionId as string | undefined;

    if (!roomId || !sessionId) {
      return;
    }

    try {
      await this.roomService.markParticipantConnection(roomId, sessionId, "disconnected");
      const roomEnded = await this.roomService.markParticipantLeft(roomId, sessionId);

      if (roomEnded) {
        await this.callLogService.createForRoom(roomId, "disconnect");
      }

      socket.to(roomId).emit("room:user-left", {
        roomId,
        sessionId
      });
    } catch (error) {
      this.logger.error(`handleDisconnect failed roomId=${roomId} sessionId=${sessionId}`, error);
    }
  }

  @SubscribeMessage("room:join")
  async joinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload
  ) {
    try {
      const [room, session] = await Promise.all([
        this.roomService.getRoom(payload.roomId),
        this.roomService.findSessionByToken(payload.sessionToken)
      ]);

      if (!session) {
        return {
          ok: false,
          error: "Invalid session token"
        };
      }

      const isParticipant = room.participants.some(
        (participant) => participant.sessionId === session.sessionId
      );

      if (!isParticipant) {
        return {
          ok: false,
          error: "Session is not part of the room"
        };
      }

      socket.data.roomId = payload.roomId;
      socket.data.sessionId = session.sessionId;
      socket.data.nickname = session.nickname;
      socket.data.role = session.role;

      await socket.join(payload.roomId);
      await this.roomService.markParticipantConnection(
        payload.roomId,
        session.sessionId,
        "connected"
      );

      socket.to(payload.roomId).emit("room:user-joined", {
        roomId: payload.roomId,
        participant: {
          sessionId: session.sessionId,
          nickname: session.nickname,
          role: session.role
        }
      });

      return {
        ok: true,
        roomId: payload.roomId,
        sessionId: session.sessionId,
        participants: room.participants
      };
    } catch {
      return {
        ok: false,
        error: "Failed to join room"
      };
    }
  }

  @SubscribeMessage("webrtc:offer")
  relayOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalRelayPayload
  ) {
    if (!this.isValidRoomPayload(socket, payload.roomId)) {
      return;
    }

    this.emitToPeers(socket, payload.roomId, "webrtc:offer", {
      roomId: payload.roomId,
      fromSessionId: socket.data.sessionId,
      sdp: payload.sdp
    });
  }

  @SubscribeMessage("webrtc:answer")
  relayAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalRelayPayload
  ) {
    if (!this.isValidRoomPayload(socket, payload.roomId)) {
      return;
    }

    this.emitToPeers(socket, payload.roomId, "webrtc:answer", {
      roomId: payload.roomId,
      fromSessionId: socket.data.sessionId,
      sdp: payload.sdp
    });
  }

  @SubscribeMessage("webrtc:ice-candidate")
  relayIceCandidate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalRelayPayload
  ) {
    if (!this.isValidRoomPayload(socket, payload.roomId)) {
      return;
    }

    this.emitToPeers(socket, payload.roomId, "webrtc:ice-candidate", {
      roomId: payload.roomId,
      fromSessionId: socket.data.sessionId,
      candidate: payload.candidate
    });
  }

  @SubscribeMessage("message:text")
  async sendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: MessagePayload
  ) {
    return this.handleMessage(socket, payload, MessageType.text);
  }

  @SubscribeMessage("message:quick-reply")
  async sendQuickReply(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: MessagePayload
  ) {
    return this.handleMessage(socket, payload, MessageType.quick_reply);
  }

  @SubscribeMessage("call:end")
  async endCall(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CallEndPayload
  ) {
    // socket.data.roomId 사용 — 클라이언트 payload.roomId를 신뢰하지 않는다
    const roomId = socket.data.roomId as string | undefined;
    const sessionId = socket.data.sessionId as string | undefined;

    if (!roomId || !sessionId) {
      return { ok: false, error: "방에 참여하지 않은 상태입니다" };
    }

    try {
      const roomEnded = await this.roomService.markParticipantLeft(roomId, sessionId);

      if (roomEnded) {
        await this.callLogService.createForRoom(roomId, "manual");
      }

      this.server.to(roomId).emit("call:ended", {
        roomId,
        sessionId
      });

      return {
        ok: true
      };
    } catch (error) {
      this.logger.error(`endCall failed roomId=${roomId}`, error);
      return {
        ok: false,
        error: "Failed to end call"
      };
    }
  }

  private async handleMessage(
    socket: Socket,
    payload: MessagePayload,
    messageType: MessageType
  ) {
    // socket.data.roomId/sessionId 사용 — 클라이언트 payload.roomId를 신뢰하지 않는다
    const roomId = socket.data.roomId as string | undefined;
    const sessionId = socket.data.sessionId as string | undefined;

    if (!roomId || !sessionId) {
      return { ok: false, error: "방에 참여하지 않은 상태입니다" };
    }

    const content = payload?.content?.trim();

    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return {
        ok: false,
        error: `Message must be 1–${MAX_MESSAGE_LENGTH} characters`
      };
    }

    const message = await this.roomService.createMessageEvent({
      roomId,
      sessionId,
      content,
      messageType
    });

    this.server.to(roomId).emit("message:received", {
      id: message.id,
      roomId,
      sessionId,
      nickname: socket.data.nickname as string,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt
    });

    return {
      ok: true,
      messageId: message.id
    };
  }

  private isValidRoomPayload(socket: Socket, roomId: string): boolean {
    return Boolean(roomId) && socket.data.roomId === roomId;
  }

  private emitToPeers(
    socket: Socket,
    roomId: string,
    event: string,
    payload: Record<string, unknown>
  ) {
    socket.to(roomId).emit(event, payload);
  }
}
