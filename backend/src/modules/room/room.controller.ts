import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RoomService } from "./room.service";

@Controller("rooms")
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  createRoom(@Body() body: unknown) {
    return this.roomService.createRoom(body);
  }

  @Post(":roomId/join")
  joinRoom(@Param("roomId") roomId: string, @Body() body: unknown) {
    return this.roomService.joinRoom(roomId, body);
  }

  @Get(":roomId")
  getRoom(@Param("roomId") roomId: string) {
    return this.roomService.getRoom(roomId);
  }
}

