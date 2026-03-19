import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SttService, SttTranscriptResponse } from "./stt.service";

@Controller("stt")
export class SttController {
  constructor(private readonly sttService: SttService) {}

  @Post()
  @UseInterceptors(FileInterceptor("audio"))
  transcribe(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("lang") lang?: string
  ): Promise<SttTranscriptResponse> {
    if (!file?.buffer) {
      throw new BadRequestException("audio file is required");
    }

    return this.sttService.transcribe({
      audioBuffer: file.buffer,
      mimeType: file.mimetype || "audio/webm",
      lang
    });
  }
}
