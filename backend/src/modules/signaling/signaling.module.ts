import { Module } from "@nestjs/common";
import { RoomModule } from "../room/room.module";
import { SignalingGateway } from "./signaling.gateway";

@Module({
  imports: [RoomModule],
  providers: [SignalingGateway],
  exports: [SignalingGateway]
})
export class SignalingModule {}
