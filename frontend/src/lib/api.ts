import {
  CreateRoomResponse,
  JoinRoomResponse,
  Role,
  RoomSummary,
  TtsResponse
} from "@/types/signbridge";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface SessionPayload {
  nickname: string;
  role: Role;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(errorBody?.message ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function createRoom(payload: SessionPayload) {
  return request<CreateRoomResponse>("/rooms", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function joinRoom(roomId: string, payload: SessionPayload) {
  return request<JoinRoomResponse>(`/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function resolveInviteCode(inviteCode: string) {
  return request<{ roomId: string; inviteCode: string; status: string }>(
    `/rooms/invite/${inviteCode.trim().toUpperCase()}`
  );
}

export async function getRoom(roomId: string) {
  return request<RoomSummary>(`/rooms/${roomId}`);
}

export async function getQuickReplies() {
  return request<string[]>("/quick-replies");
}

export async function createTtsAudio(payload: { text: string; lang?: string }) {
  return request<TtsResponse>("/tts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
