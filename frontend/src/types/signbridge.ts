export type Role = "speaker" | "deaf" | "guest";

export type RoomStatus = "waiting" | "active" | "ended";

export interface ParticipantSummary {
  sessionId: string;
  nickname: string;
  role: Role;
  connectionState: string;
  joinedAt: string;
}

export interface RoomSummary {
  id: string;
  inviteCode: string;
  status: RoomStatus;
  startedAt: string | null;
  endedAt: string | null;
  participants: ParticipantSummary[];
}

export interface RoomSession {
  roomId: string;
  sessionId: string;
  sessionToken: string;
  inviteCode: string;
  role?: Role;
  nickname?: string;
}

export interface CreateRoomResponse {
  roomId: string;
  inviteCode: string;
  sessionToken: string;
  sessionId: string;
}

export interface JoinRoomResponse extends CreateRoomResponse {
  status: RoomStatus;
}

export interface QuickReplyMessage {
  id: string;
  roomId: string;
  sessionId: string;
  nickname: string;
  content: string;
  messageType: "text" | "quick_reply" | "sign_intent";
  createdAt: string;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServer[];
}

export type TtsResponse =
  | {
      ok: true;
      provider: "browser";
      mode: "client-speech-synthesis";
      text: string;
      lang: string;
      voice: string;
    }
  | {
      ok: true;
      provider: "openai";
      mode: "audio-data-url";
      text: string;
      lang: string;
      voice: string;
      audio: {
        mimeType: string;
        base64: string;
        dataUrl: string;
      };
    };
