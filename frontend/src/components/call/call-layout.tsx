"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptionPanel } from "@/components/caption/caption-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TextResponsePanel } from "@/components/chat/text-response-panel";
import { ConnectionStatus } from "@/components/controls/connection-status";
import { HandOverlay } from "@/components/hand-tracking/hand-overlay";
import { SignModeButton } from "@/components/hand-tracking/sign-mode-button";
import { QuickRepliesPanel } from "@/components/quick-replies/quick-replies-panel";
import { useHandTracking } from "@/hooks/use-hand-tracking";
import { useSignClassifier } from "@/hooks/use-sign-classifier";
import { useSpeechCaptions } from "@/hooks/use-speech-captions";
import { useSocket } from "@/hooks/use-socket";
import { useWebRtc } from "@/hooks/use-webrtc";
import { createTtsAudio, getQuickReplies, getRoom } from "@/lib/api";
import { loadRoomSession } from "@/lib/session";
import { QuickReplyMessage, RoomSession, RoomSummary } from "@/types/signbridge";

interface CallLayoutProps {
  roomId: string;
}

const MAX_CHAT_MESSAGES = 50;

export function CallLayout({ roomId }: CallLayoutProps) {
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messageFeed, setMessageFeed] = useState<QuickReplyMessage[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [speechPartialCaption, setSpeechPartialCaption] = useState<string | null>(null);
  const [speechFinalCaptions, setSpeechFinalCaptions] = useState<string[]>([]);
  const [ttsStatus, setTtsStatus] = useState("tts idle");

  // 상대방 수화 인식 자막 상태
  // partialCaption: 인식 중인 임시 자막, finalCaptions: 확정된 자막 목록
  const [partialCaption, setPartialCaption] = useState<string | null>(null);
  const [finalCaptions, setFinalCaptions] = useState<string[]>([]);
  // 상대방 수화 모드 활성화 여부
  const [remoteSignModeEnabled, setRemoteSignModeEnabled] = useState(false);

  useEffect(() => {
    setSession(loadRoomSession(roomId));
  }, [roomId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    async function hydrateRoom() {
      try {
        const [roomResponse, quickReplyResponse] = await Promise.all([
          getRoom(roomId),
          getQuickReplies()
        ]);

        setRoom(roomResponse);
        setQuickReplies(quickReplyResponse);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "room load failed");
      }
    }

    void hydrateRoom();
  }, [roomId, session]);

  const { socket, status, error: socketError } = useSocket(
    session
      ? {
          roomId,
          sessionToken: session.sessionToken,
          onUserJoined: ({ participant }) => {
            setRoom((currentRoom) =>
              currentRoom
                ? {
                    ...currentRoom,
                    status: "active",
                    participants: [...currentRoom.participants, { ...participant, connectionState: "connected", joinedAt: new Date().toISOString() }]
                  }
                : currentRoom
            );
          },
          onUserLeft: ({ sessionId }) => {
            setRoom((currentRoom) =>
              currentRoom
                ? {
                    ...currentRoom,
                    status: currentRoom.participants.length <= 1 ? "ended" : "waiting",
                    participants: currentRoom.participants.filter(
                      (participant) => participant.sessionId !== sessionId
                    )
                  }
                : currentRoom
            );
          },
          onMessage: (payload) => {
            setMessageFeed((currentFeed) => [...currentFeed.slice(-(MAX_CHAT_MESSAGES - 1)), payload]);
            if (payload.sessionId !== session.sessionId && payload.messageType !== "sign_intent") {
              void playTts(payload.content);
            }
          },
          onCallEnded: () => {
            setRoom((currentRoom) =>
              currentRoom
                ? {
                    ...currentRoom,
                    status: "ended"
                  }
                : currentRoom
            );
          },
          onCaptionPartial: (payload) => {
            setSpeechPartialCaption(`[음성] ${payload.nickname}: ${payload.content}`);
          },
          onCaptionFinal: (payload) => {
            setSpeechPartialCaption(null);
            setSpeechFinalCaptions((current) => [
              ...current.slice(-7),
              `[음성] ${payload.nickname}: ${payload.content}`
            ]);
          },
          // 수화 인식 임시 자막 수신 — 상대방 세션에서 온 경우에만 표시
          onSignPartial: (data) => {
            if (data.fromSessionId !== session.sessionId) {
              setPartialCaption(data.content);
            }
          },
          // 수화 인식 확정 자막 수신 — 최근 8개까지 유지
          onSignFinal: (data) => {
            if (data.fromSessionId !== session.sessionId) {
              setPartialCaption(null);
              setFinalCaptions((prev) => [...prev.slice(-7), data.content]);
            }
          },
          // 상대방 수화 모드 변경 수신
          onSignModeChanged: (data) => {
            if (data.fromSessionId !== session.sessionId) {
              setRemoteSignModeEnabled(data.enabled);
              if (!data.enabled) {
                // 상대방이 수화 모드를 끄면 임시 자막 초기화
                setPartialCaption(null);
              }
            }
          }
        }
      : null
  );

  const currentParticipant = useMemo(
    () =>
      room?.participants.find((participant) => participant.sessionId === session?.sessionId) ?? null,
    [room?.participants, session?.sessionId]
  );

  const shouldCreateOffer = Boolean(
    room &&
      session &&
      room.participants.length >= 2 &&
      room.participants[0]?.sessionId === session.sessionId
  );

  const { localVideoRef, remoteVideoRef, mediaStatus, isCameraOn, isMicOn, toggleCamera, toggleMic } = useWebRtc({
    roomId,
    sessionId: session?.sessionId ?? "",
    sessionToken: session?.sessionToken ?? "",
    socket,
    participantCount: room?.participants.length ?? 0,
    shouldCreateOffer
  });

  const { status: sttStatus, supported: sttSupported } = useSpeechCaptions({
    enabled:
      Boolean(socket) &&
      Boolean(session) &&
      session?.role !== "deaf" &&
      !mediaStatus.startsWith("camera error"),
    socket
  });

  // 수화 모드: 로컬 비디오 위에 손 랜드마크 오버레이
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isSignMode, toggleSignMode, isHandDetected, landmarks } = useHandTracking({
    localVideoRef,
    canvasRef,
  });

  // onPartial 중복 단어 emit 방지용 ref
  const lastPartialWordRef = useRef<string | null>(null);

  // 수화 분류기: 랜드마크 → 단어/문장 인식 → 소켓 emit
  useSignClassifier({
    landmarksRef: landmarks,
    isSignMode,
    onPartial: (word) => {
      // 이전과 동일한 단어면 emit 생략 — 불필요한 네트워크 트래픽 방지
      if (!socket || word === lastPartialWordRef.current) return;
      lastPartialWordRef.current = word;
      socket.emit("sign:partial", { content: word, confidence: 1.0 });
    },
    onFinal: (sentence) => {
      lastPartialWordRef.current = null; // 문장 확정 시 중복 체크 초기화
      if (!socket) return;
      socket.emit("sign:final", { content: sentence, confidence: 1.0 });
    },
  });

  // 수화 모드 ON/OFF 시 상대방에게 상태 전달
  // prevIsSignModeRef로 이전 값과 비교 — socket 재연결 시 불필요한 emit 방지
  const prevIsSignModeRef = useRef<boolean>(isSignMode);
  useEffect(() => {
    if (!socket || prevIsSignModeRef.current === isSignMode) return;
    prevIsSignModeRef.current = isSignMode;
    socket.emit("sign:mode", { enabled: isSignMode });
  }, [isSignMode, socket]);

  async function playTts(content: string) {
    setTtsStatus("tts preparing");

    try {
      const response = await createTtsAudio({
        text: content,
        lang: "ko-KR"
      });

      if (response.mode === "audio-data-url") {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        const audio = new Audio(response.audio.dataUrl);
        await audio.play();
        setTtsStatus(`tts ${response.provider}`);
        return;
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(response.text);
        utterance.lang = response.lang;
        window.speechSynthesis.speak(utterance);
        setTtsStatus(`tts ${response.provider}`);
        return;
      }

      setTtsStatus("tts unavailable");
    } catch (error) {
      setTtsStatus("tts failed");
      setPageError(error instanceof Error ? error.message : "tts playback failed");
    }
  }

  function sendTextMessage() {
    if (!socket || !session || !messageInput.trim()) {
      return;
    }

    socket.emit("message:text", {
      roomId,
      sessionToken: session.sessionToken,
      content: messageInput.trim()
    });
    setMessageInput("");
  }

  function sendQuickReply(content: string) {
    if (!socket || !session) {
      return;
    }

    socket.emit("message:quick-reply", {
      roomId,
      sessionToken: session.sessionToken,
      content
    });
  }

  // 카메라 끄면 수화 모드도 자동 해제 (검은 프레임 오인식 방지)
  const handleToggleCamera = useCallback(() => {
    if (isCameraOn && isSignMode) {
      toggleSignMode();
    }
    toggleCamera();
  }, [isCameraOn, isSignMode, toggleCamera, toggleSignMode]);

  function endCall() {
    if (!socket || !session) {
      return;
    }

    socket.emit("call:end", {
      roomId,
      sessionToken: session.sessionToken
    });
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-8">
        <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <h1 className="text-2xl font-semibold">세션 정보 없음</h1>
          <p className="mt-3 text-[var(--muted)]">
            랜딩 화면에서 방을 만들거나 입장한 뒤 다시 시도해 주세요.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white"
          >
            랜딩으로 이동
          </Link>
        </section>
      </main>
    );
  }

  // 미디어 준비 완료 여부 — 스트림이 없는 상태에서 토글 버튼 비활성화
  const isMediaReady = mediaStatus === "camera ready" || mediaStatus.startsWith("webrtc ");

  // 수화 자막 + 메시지 피드를 합산해 CaptionPanel에 전달
  // 확정 자막은 [수화] 접두어로 구분, 임시 자막은 말줄임표로 표시
  const signCaptionEntries = [
    ...finalCaptions.map((text) => `[수화] ${text}`),
    ...(partialCaption ? [`[수화 인식 중] ${partialCaption}…`] : [])
  ];

  const speechCaptionEntries = [
    ...speechFinalCaptions,
    ...(speechPartialCaption ? [`${speechPartialCaption}…`] : [])
  ];

  const activityEntries = [
    `socket ${status}`,
    `media ${mediaStatus}`,
    sttSupported ? sttStatus : "stt unsupported",
    ttsStatus,
    `room ${room?.status ?? "loading"}`,
    ...(remoteSignModeEnabled ? ["상대방 수화 모드 활성화"] : []),
    ...(socketError ? [`error ${socketError}`] : []),
    ...(pageError ? [`error ${pageError}`] : []),
    ...speechCaptionEntries,
    ...signCaptionEntries
  ].slice(-8);

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1.45fr_0.95fr]">
      <section className="grid gap-6">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--muted)]">Room</p>
              <h1 className="text-2xl font-semibold">{roomId}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {session.nickname} / {currentParticipant?.role ?? session.role ?? "guest"}
              </p>
            </div>
            <ConnectionStatus status={status} detail={mediaStatus} />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="aspect-video w-full rounded-[1.5rem] bg-[#1f2937] object-cover"
            />
            {/* 로컬 비디오 + 수화 모드 캔버스 오버레이 */}
            <div className="relative">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="aspect-[4/5] w-full rounded-[1.5rem] bg-[#334155] object-cover"
              />
              {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[1.5rem] bg-gray-900/80">
                  <span className="text-sm font-medium text-gray-300">카메라 꺼짐</span>
                </div>
              )}
              <HandOverlay canvasRef={canvasRef} isVisible={isSignMode} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span>invite {room?.inviteCode ?? session.inviteCode}</span>
            <span>participants {room?.participants.length ?? 0}/2</span>
            {/* 마이크 토글 */}
            <button
              onClick={toggleMic}
              disabled={!isMediaReady}
              aria-label={isMicOn ? "마이크 끄기" : "마이크 켜기"}
              className={`rounded-full border px-4 py-2 font-medium ${
                !isMediaReady
                  ? "cursor-not-allowed border-gray-100 bg-gray-100 text-gray-400"
                  : isMicOn
                    ? "border-gray-200 bg-gray-50 text-gray-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {isMicOn ? "🎙️ 마이크" : "🎙️ 마이크 꺼짐"}
            </button>
            {/* 카메라 토글 */}
            <button
              onClick={handleToggleCamera}
              disabled={!isMediaReady}
              aria-label={isCameraOn ? "카메라 끄기" : "카메라 켜기"}
              className={`rounded-full border px-4 py-2 font-medium ${
                !isMediaReady
                  ? "cursor-not-allowed border-gray-100 bg-gray-100 text-gray-400"
                  : isCameraOn
                    ? "border-gray-200 bg-gray-50 text-gray-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {isCameraOn ? "📷 카메라" : "📷 카메라 꺼짐"}
            </button>
            {/* 수화 모드 토글 버튼 */}
            <SignModeButton
              isSignMode={isSignMode}
              isHandDetected={isHandDetected}
              onClick={toggleSignMode}
              disabled={!isCameraOn}
            />
            <button
              onClick={endCall}
              className="rounded-full border border-rose-400 bg-rose-600 px-4 py-2 font-medium text-white"
            >
              통화 종료
            </button>
          </div>
        </div>

        <CaptionPanel
          roomStatus={room?.status ?? "loading"}
          inviteCode={room?.inviteCode ?? session.inviteCode}
          entries={activityEntries}
        />
      </section>

      <aside className="grid gap-6">
        <ChatPanel messages={messageFeed} currentSessionId={session.sessionId} />
        <TextResponsePanel
          value={messageInput}
          onChange={setMessageInput}
          onSend={sendTextMessage}
          disabled={!socket}
        />
        <QuickRepliesPanel
          quickReplies={quickReplies}
          onSelect={sendQuickReply}
          disabled={!socket}
        />
      </aside>
    </main>
  );
}
