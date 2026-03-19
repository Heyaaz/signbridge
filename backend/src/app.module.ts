import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { CaptionModule } from "./modules/caption/caption.module";
import { IceServersModule } from "./modules/ice-servers/ice-servers.module";
import { QuickReplyModule } from "./modules/quick-reply/quick-reply.module";
import { RoomModule } from "./modules/room/room.module";
import { SignalingModule } from "./modules/signaling/signaling.module";
import { SignModule } from "./modules/sign/sign.module";
import { SttModule } from "./modules/stt/stt.module";
import { TtsModule } from "./modules/tts/tts.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../.env"]
    }),
    PrismaModule,
    RoomModule,
    SignalingModule,
    SignModule,
    CaptionModule,
    IceServersModule,
    SttModule,
    TtsModule,
    QuickReplyModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
