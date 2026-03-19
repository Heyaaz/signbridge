import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Socket } from "socket.io";
import { SignService } from "./sign.service";

// 수화 모드 ON/OFF 변경 요청 (roomId/sessionId는 socket.data에서 가져옴)
interface SignModePayload {
  enabled: boolean;
}

// 수화 인식 결과 공통 타입 (중간/확정 모두 동일한 구조)
// roomId/sessionId는 socket.data에서 가져오므로 payload에서 제거
interface SignRecognitionPayload {
  content: string;
  confidence: number;
}

/** content 최대 길이 (단어 연결 문자열 기준) */
const MAX_CONTENT_LENGTH = 500;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? "*"
  }
})
export class SignGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(SignGateway.name);

  constructor(private readonly signService: SignService) {}

  /**
   * 소켓 연결 해제 시 수화 모드 비활성화 알림
   * 수화 모드가 켜진 상태에서 연결이 끊기면 상대방에게 sign:mode-changed (enabled: false) 전송
   */
  handleDisconnect(socket: Socket) {
    const roomId = socket.data.roomId as string | undefined;
    const sessionId = socket.data.sessionId as string | undefined;

    // roomId 또는 sessionId가 없으면 방에 참여하지 않은 소켓이므로 무시
    if (!roomId || !sessionId) {
      return;
    }

    socket.to(roomId).emit("sign:mode-changed", {
      roomId,
      fromSessionId: sessionId,
      enabled: false
    });
  }

  /**
   * 수화 모드 ON/OFF 상태 변경
   * 발신자를 제외한 같은 방의 참여자에게 상태 변경을 알린다
   */
  @SubscribeMessage("sign:mode")
  handleSignMode(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignModePayload
  ) {
    const roomId = socket.data.roomId as string;
    const sessionId = socket.data.sessionId as string;

    // 방에 참여하지 않은 소켓은 처리하지 않음
    if (!roomId || !sessionId) {
      return { ok: false, error: "방에 참여하지 않은 상태입니다" };
    }

    // 발신자 정보를 포함해 상대방에게 브로드캐스트
    this.emitToPeers(socket, roomId, "sign:mode-changed", {
      roomId,
      fromSessionId: sessionId,
      enabled: payload.enabled
    });

    return { ok: true };
  }

  /**
   * 중간 인식 결과 브로드캐스트
   * 클라이언트가 수화를 인식하는 도중 중간 결과를 실시간으로 전달한다
   * partial은 빈번하게 발생하므로 별도 로깅 없이 즉시 전달
   */
  @SubscribeMessage("sign:partial")
  handleSignPartial(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignRecognitionPayload
  ) {
    const roomId = socket.data.roomId as string;
    const sessionId = socket.data.sessionId as string;

    // 방에 참여하지 않은 소켓은 처리하지 않음
    if (!roomId || !sessionId) {
      return { ok: false, error: "방에 참여하지 않은 상태입니다" };
    }

    // payload 유효성 검사
    if (typeof payload.content !== "string" || payload.content.length === 0) {
      return { ok: false, error: "content가 유효하지 않습니다" };
    }
    if (payload.content.length > MAX_CONTENT_LENGTH) {
      return { ok: false, error: "content가 너무 깁니다" };
    }

    this.emitToPeers(socket, roomId, "sign:partial", {
      roomId,
      fromSessionId: sessionId,
      content: payload.content,
      confidence: payload.confidence
    });

    return { ok: true };
  }

  /**
   * 확정 인식 결과 브로드캐스트
   * 브로드캐스트를 먼저 수행하고, DB 저장은 fire-and-forget으로 처리한다.
   * DB 저장 실패가 실시간 전달을 차단하지 않도록 한다.
   */
  @SubscribeMessage("sign:final")
  handleSignFinal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignRecognitionPayload
  ) {
    const roomId = socket.data.roomId as string;
    const sessionId = socket.data.sessionId as string;

    // 방에 참여하지 않은 소켓은 처리하지 않음
    if (!roomId || !sessionId) {
      return { ok: false, error: "방에 참여하지 않은 상태입니다" };
    }

    // payload 유효성 검사
    if (typeof payload.content !== "string" || payload.content.length === 0) {
      return { ok: false, error: "content가 유효하지 않습니다" };
    }
    if (payload.content.length > MAX_CONTENT_LENGTH) {
      return { ok: false, error: "content가 너무 깁니다" };
    }

    this.logger.log(`수화 인식 확정: room=${roomId}, content=${payload.content}`);

    // 브로드캐스트 먼저 — DB 저장 실패가 실시간 전달을 차단하지 않도록
    this.emitToPeers(socket, roomId, "sign:final", {
      roomId,
      fromSessionId: sessionId,
      content: payload.content,
      confidence: payload.confidence
    });

    // DB 저장은 fire-and-forget — 실패 시 SignService 내부에서 로깅
    void this.signService.saveSignCaption({
      roomId,
      sessionId,
      content: payload.content,
      confidence: payload.confidence
    });

    return { ok: true };
  }

  /**
   * 발신자를 제외한 같은 방의 모든 소켓에 이벤트를 전송한다
   */
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
