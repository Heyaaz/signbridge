import { MessageType } from "@prisma/client";
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
    origin: "*"
  }
})
export class SignalingGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

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

    await this.roomService.markParticipantConnection(roomId, sessionId, "disconnected");
    await this.roomService.markParticipantLeft(roomId, sessionId);
    await this.callLogService.createForRoom(roomId, "disconnect");

    socket.to(roomId).emit("room:user-left", {
      roomId,
      sessionId
    });
  }

  @SubscribeMessage("room:join")
  async joinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload
  ) {
    const room = await this.roomService.getRoom(payload.roomId);
    const session = await this.roomService.findSessionByToken(payload.sessionToken);

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
  }

  @SubscribeMessage("webrtc:offer")
  async relayOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalRelayPayload
  ) {
    this.emitToPeers(socket, payload.roomId, "webrtc:offer", {
      roomId: payload.roomId,
      fromSessionId: socket.data.sessionId,
      sdp: payload.sdp
    });
  }

  @SubscribeMessage("webrtc:answer")
  async relayAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalRelayPayload
  ) {
    this.emitToPeers(socket, payload.roomId, "webrtc:answer", {
      roomId: payload.roomId,
      fromSessionId: socket.data.sessionId,
      sdp: payload.sdp
    });
  }

  @SubscribeMessage("webrtc:ice-candidate")
  async relayIceCandidate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalRelayPayload
  ) {
    this.emitToPeers(socket, payload.roomId, "webrtc:ice-candidate", {
      roomId: payload.roomId,
      fromSessionId: socket.data.sessionId,
      candidate: payload.candidate
    });
  }

  @SubscribeMessage("message:text")
  async sendTextMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: MessagePayload
  ) {
    const session = await this.roomService.findSessionByToken(payload.sessionToken);

    if (!session) {
      return {
        ok: false,
        error: "Invalid session token"
      };
    }

    const message = await this.roomService.createMessageEvent({
      roomId: payload.roomId,
      sessionId: session.sessionId,
      content: payload.content,
      messageType: MessageType.text
    });

    this.server.to(payload.roomId).emit("message:received", {
      id: message.id,
      roomId: payload.roomId,
      sessionId: session.sessionId,
      nickname: session.nickname,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt
    });

    return {
      ok: true,
      messageId: message.id
    };
  }

  @SubscribeMessage("message:quick-reply")
  async sendQuickReply(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: MessagePayload
  ) {
    const session = await this.roomService.findSessionByToken(payload.sessionToken);

    if (!session) {
      return {
        ok: false,
        error: "Invalid session token"
      };
    }

    const message = await this.roomService.createMessageEvent({
      roomId: payload.roomId,
      sessionId: session.sessionId,
      content: payload.content,
      messageType: MessageType.quick_reply
    });

    this.server.to(payload.roomId).emit("message:received", {
      id: message.id,
      roomId: payload.roomId,
      sessionId: session.sessionId,
      nickname: session.nickname,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt
    });

    return {
      ok: true,
      messageId: message.id
    };
  }

  @SubscribeMessage("call:end")
  async endCall(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CallEndPayload
  ) {
    const session = await this.roomService.findSessionByToken(payload.sessionToken);

    if (!session) {
      return {
        ok: false,
        error: "Invalid session token"
      };
    }

    await this.roomService.markParticipantLeft(payload.roomId, session.sessionId);
    await this.callLogService.createForRoom(payload.roomId, "manual");

    this.server.to(payload.roomId).emit("call:ended", {
      roomId: payload.roomId,
      sessionId: session.sessionId
    });

    return {
      ok: true
    };
  }

  private emitToPeers(
    socket: Socket,
    roomId: string,
    event: string,
    payload: Record<string, unknown>
  ) {
    if (!roomId) {
      return;
    }

    socket.to(roomId).emit(event, payload);
  }
}
