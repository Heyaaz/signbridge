import { Module } from "@nestjs/common";
import { CaptionGateway } from "./caption.gateway";
import { CaptionService } from "./caption.service";

@Module({
  providers: [CaptionGateway, CaptionService]
})
export class CaptionModule {}

