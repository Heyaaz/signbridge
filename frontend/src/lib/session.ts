import { RoomSession } from "@/types/signbridge";

const ROOM_SESSION_PREFIX = "signbridge:room:";

export function saveRoomSession(session: RoomSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    `${ROOM_SESSION_PREFIX}${session.roomId}`,
    JSON.stringify(session)
  );
}

export function loadRoomSession(roomId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(`${ROOM_SESSION_PREFIX}${roomId}`);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as RoomSession;
  } catch {
    return null;
  }
}
