import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CaptionModule } from "./modules/caption/caption.module";
import { QuickReplyModule } from "./modules/quick-reply/quick-reply.module";
import { RoomModule } from "./modules/room/room.module";
import { SignalingModule } from "./modules/signaling/signaling.module";
import { TtsModule } from "./modules/tts/tts.module";

@Module({
  imports: [RoomModule, SignalingModule, CaptionModule, TtsModule, QuickReplyModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}

