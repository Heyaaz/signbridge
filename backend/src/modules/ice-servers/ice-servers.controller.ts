import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { IceServersService } from "./ice-servers.service";
import { RoomService } from "../room/room.service";

@Controller("ice-servers")
export class IceServersController {
  constructor(
    private readonly iceServersService: IceServersService,
    private readonly roomService: RoomService
  ) {}

  @Get()
  async getIceServers(@Headers("x-session-token") sessionToken?: string) {
    if (!sessionToken) {
      throw new UnauthorizedException("Session token required");
    }

    const session = await this.roomService.findSessionByToken(sessionToken);

    if (!session) {
      throw new UnauthorizedException("Invalid session token");
    }

    return this.iceServersService.getIceServers();
  }
}
