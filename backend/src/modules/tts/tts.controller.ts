import { Body, Controller, Post } from "@nestjs/common";
import { TtsAudioResponse, TtsService } from "./tts.service";

interface CreateTtsBody {
  text?: unknown;
  lang?: unknown;
}

@Controller("tts")
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post()
  createAudio(@Body() body: CreateTtsBody): Promise<TtsAudioResponse> {
    return this.ttsService.createAudio(body);
  }
}
