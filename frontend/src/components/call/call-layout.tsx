"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CaptionPanel } from "@/components/caption/caption-panel";
import { TextResponsePanel } from "@/components/chat/text-response-panel";
import { ConnectionStatus } from "@/components/controls/connection-status";
import { QuickRepliesPanel } from "@/components/quick-replies/quick-replies-panel";
import { useSocket } from "@/hooks/use-socket";
import { useWebRtc } from "@/hooks/use-webrtc";
import { getQuickReplies, getRoom } from "@/lib/api";
import { loadRoomSession } from "@/lib/session";
import { QuickReplyMessage, RoomSession, RoomSummary } from "@/types/signbridge";

interface CallLayoutProps {
  roomId: string;
}

export function CallLayout({ roomId }: CallLayoutProps) {
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messageFeed, setMessageFeed] = useState<QuickReplyMessage[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

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
            setMessageFeed((currentFeed) => [...currentFeed.slice(-7), payload]);
            if (
              typeof window !== "undefined" &&
              "speechSynthesis" in window &&
              payload.sessionId !== session.sessionId
            ) {
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(payload.content));
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

  const { localVideoRef, remoteVideoRef, mediaStatus } = useWebRtc({
    roomId,
    sessionId: session?.sessionId ?? "",
    socket,
    participantCount: room?.participants.length ?? 0,
    shouldCreateOffer
  });

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

  const activityEntries = [
    `socket ${status}`,
    `media ${mediaStatus}`,
    `room ${room?.status ?? "loading"}`,
    ...(socketError ? [`error ${socketError}`] : []),
    ...(pageError ? [`error ${pageError}`] : []),
    ...messageFeed.map((message) => `${message.nickname}: ${message.content}`)
  ].slice(-6);

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
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="aspect-[4/5] w-full rounded-[1.5rem] bg-[#334155] object-cover"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span>invite {room?.inviteCode ?? session.inviteCode}</span>
            <span>participants {room?.participants.length ?? 0}/2</span>
            <button
              onClick={endCall}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 font-medium text-rose-700"
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
