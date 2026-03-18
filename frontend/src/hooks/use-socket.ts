"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { QuickReplyMessage, Role } from "@/types/signbridge";

const SOCKET_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface UseSocketOptions {
  roomId: string;
  sessionToken: string;
  onUserJoined?: (payload: {
    roomId: string;
    participant: {
      sessionId: string;
      nickname: string;
      role: Role;
    };
  }) => void;
  onUserLeft?: (payload: { roomId: string; sessionId: string }) => void;
  onMessage?: (payload: QuickReplyMessage) => void;
  onCallEnded?: (payload: { roomId: string; sessionId: string }) => void;
  onCaptionPartial?: (payload: {
    roomId: string;
    sessionId: string;
    nickname: string;
    content: string;
  }) => void;
  onCaptionFinal?: (payload: {
    id: string;
    roomId: string;
    sessionId: string;
    nickname: string;
    content: string;
    sequence: number;
    createdAt: string;
  }) => void;
  // 수화 인식 이벤트 콜백 (sign.gateway.ts 브로드캐스트 수신)
  onSignPartial?: (data: {
    roomId: string;
    fromSessionId: string;
    content: string;
    confidence: number;
  }) => void;
  onSignFinal?: (data: {
    roomId: string;
    fromSessionId: string;
    content: string;
    confidence: number;
  }) => void;
  onSignModeChanged?: (data: {
    roomId: string;
    fromSessionId: string;
    enabled: boolean;
  }) => void;
}

export function useSocket(options: UseSocketOptions | null) {
  const socketRef = useRef<Socket | null>(null);
  const latestOptionsRef = useRef<UseSocketOptions | null>(options);
  const [status, setStatus] = useState("socket disconnected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!options) {
      return;
    }

    const socket = io(SOCKET_BASE_URL, {
      transports: ["websocket"]
    });

    socketRef.current = socket;
    setStatus("socket connecting");
    setError(null);

    socket.on("connect", async () => {
      setStatus("socket connected");

      try {
        const result = (await socket.emitWithAck("room:join", {
          roomId: options.roomId,
          sessionToken: options.sessionToken
        })) as { ok: boolean; error?: string };

        if (!result.ok) {
          setStatus("socket join failed");
          setError(result.error ?? "room join failed");
        }
      } catch (joinError) {
        setStatus("socket join failed");
        setError(joinError instanceof Error ? joinError.message : "room join failed");
      }
    });

    socket.on("disconnect", () => {
      setStatus("socket disconnected");
    });

    socket.on("connect_error", (connectError) => {
      setStatus("socket error");
      setError(connectError.message);
    });

    socket.on("room:user-joined", (payload) => {
      latestOptionsRef.current?.onUserJoined?.(payload);
    });

    socket.on("room:user-left", (payload) => {
      latestOptionsRef.current?.onUserLeft?.(payload);
    });

    socket.on("message:received", (payload) => {
      latestOptionsRef.current?.onMessage?.(payload as QuickReplyMessage);
    });

    socket.on("call:ended", (payload) => {
      latestOptionsRef.current?.onCallEnded?.(payload);
    });

    socket.on("caption:partial", (payload) => {
      latestOptionsRef.current?.onCaptionPartial?.(payload);
    });

    socket.on("caption:final", (payload) => {
      latestOptionsRef.current?.onCaptionFinal?.(payload);
    });

    // 수화 인식 이벤트 리스너 등록 (sign.gateway.ts 브로드캐스트)
    socket.on("sign:partial", (data) => {
      latestOptionsRef.current?.onSignPartial?.(data);
    });

    socket.on("sign:final", (data) => {
      latestOptionsRef.current?.onSignFinal?.(data);
    });

    socket.on("sign:mode-changed", (data) => {
      latestOptionsRef.current?.onSignModeChanged?.(data);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [options?.roomId, options?.sessionToken]);

  return {
    socket: socketRef.current,
    socketRef,
    status,
    error
  };
}
