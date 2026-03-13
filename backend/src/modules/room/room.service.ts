import { Injectable } from "@nestjs/common";

@Injectable()
export class RoomService {
  createRoom(_payload: unknown) {
    return {
      message: "Room creation skeleton only"
    };
  }

  joinRoom(_roomId: string, _payload: unknown) {
    return {
      message: "Room join skeleton only"
    };
  }

  getRoom(roomId: string) {
    return {
      roomId,
      message: "Room detail skeleton only"
    };
  }
}

