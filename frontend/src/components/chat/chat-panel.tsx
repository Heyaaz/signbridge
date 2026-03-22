"use client";

import { useCallback, useEffect, useRef } from "react";
import { QuickReplyMessage } from "@/types/signbridge";

/** 하단에서 이 거리(px) 이내에 있으면 새 메시지 도착 시 자동 스크롤 */
const AUTO_SCROLL_THRESHOLD = 48;

interface ChatPanelProps {
  messages: QuickReplyMessage[];
  currentSessionId: string;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "--:--";
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function MessageTypeBadge({ messageType }: { messageType: QuickReplyMessage["messageType"] }) {
  if (messageType === "text") return null;
  if (messageType === "quick_reply") {
    return <span className="text-[10px] text-[var(--muted)] leading-none">⚡빠른응답</span>;
  }
  if (messageType === "sign_intent") {
    return <span className="text-[10px] text-[var(--muted)] leading-none">🤟수화</span>;
  }
  return null;
}

export function ChatPanel({ messages, currentSessionId }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScroll = useRef(true);

  const lastMessage = messages[messages.length - 1];

  // 사용자가 스크롤 위치를 변경하면 자동 스크롤 여부를 업데이트
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    shouldAutoScroll.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < AUTO_SCROLL_THRESHOLD;
  }, []);

  // lastMessage.id 기준으로 스크롤 — MAX 도달 후 길이가 동일해도 새 메시지 감지
  useEffect(() => {
    if (shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lastMessage?.id]);

  return (
    <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted)]">Chat</p>
      <h2 className="mb-3 text-lg font-semibold">채팅</h2>

      {/* 스크롤 가능한 메시지 목록 — live region 분리 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-64 overflow-y-auto space-y-3 pr-1"
        aria-label="채팅 메시지"
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm text-[var(--muted)] py-6">아직 메시지가 없습니다</p>
        ) : (
          messages.map((message) => {
            const isMine = message.sessionId === currentSessionId;
            return (
              <div
                key={message.id}
                className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}
              >
                {!isMine && (
                  <span className="text-xs text-[var(--muted)] px-1 truncate max-w-[200px]">{message.nickname}</span>
                )}
                <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`max-w-[70%] px-3 py-2 text-sm break-words ${
                      isMine
                        ? "bg-blue-500 text-white rounded-2xl rounded-br-sm"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-2xl rounded-bl-sm"
                    }`}
                  >
                    {message.content}
                  </div>
                  <div className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                    <MessageTypeBadge messageType={message.messageType} />
                    <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* 스크린리더 전용 live region — 마지막 메시지만 알림 (role="log"의 암묵적 aria-live 활용) */}
      <div role="log" aria-live="polite" className="sr-only">
        {lastMessage && (
          <p key={lastMessage.id}>
            {lastMessage.sessionId === currentSessionId ? "나" : lastMessage.nickname}:{" "}
            {lastMessage.content}
          </p>
        )}
      </div>
    </div>
  );
}
