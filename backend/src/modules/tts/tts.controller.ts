import { Body, Controller, Post } from "@nestjs/common";
import { TtsService } from "./tts.service";

@Controller("tts")
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post()
  createAudio(@Body() body: unknown) {
    return this.ttsService.createAudio(body);
  }
}

