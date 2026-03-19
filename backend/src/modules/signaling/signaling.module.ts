import { Module } from "@nestjs/common";
import { CallLogModule } from "../call-log/call-log.module";
import { RoomModule } from "../room/room.module";
import { SignalingGateway } from "./signaling.gateway";

@Module({
  imports: [RoomModule, CallLogModule],
  providers: [SignalingGateway],
  exports: [SignalingGateway]
})
export class SignalingModule {}
