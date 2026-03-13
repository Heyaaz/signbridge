import { Injectable } from "@nestjs/common";

@Injectable()
export class TtsService {
  createAudio(_payload: unknown) {
    return {
      message: "TTS skeleton only"
    };
  }
}

