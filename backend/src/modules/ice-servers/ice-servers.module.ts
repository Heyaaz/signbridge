import { Module } from "@nestjs/common";
import { RoomModule } from "../room/room.module";
import { IceServersController } from "./ice-servers.controller";
import { IceServersService } from "./ice-servers.service";

@Module({
  imports: [RoomModule],
  controllers: [IceServersController],
  providers: [IceServersService]
})
export class IceServersModule {}
