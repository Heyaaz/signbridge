import { BadRequestException, Injectable } from "@nestjs/common";

export interface BrowserSttResponse {
  ok: true;
  provider: "browser";
  text: "";
}

export interface OpenAiSttResponse {
  ok: true;
  provider: "openai";
  text: string;
}

export type SttTranscriptResponse = BrowserSttResponse | OpenAiSttResponse;

@Injectable()
export class SttService {
  async transcribe(input: {
    audioBuffer: Buffer;
    mimeType: string;
    lang?: string;
  }): Promise<SttTranscriptResponse> {
    const provider = (process.env.STT_PROVIDER ?? "browser").trim().toLowerCase();

    if (provider !== "openai" || !process.env.OPENAI_API_KEY) {
      return { ok: true, provider: "browser", text: "" };
    }

    return this.transcribeWithWhisper(input);
  }

  private async transcribeWithWhisper(input: {
    audioBuffer: Buffer;
    mimeType: string;
    lang?: string;
  }): Promise<OpenAiSttResponse> {
    const apiKey = process.env.OPENAI_API_KEY as string;
    const model = process.env.OPENAI_STT_MODEL ?? "whisper-1";
    const langCode = (input.lang ?? "ko-KR").split("-")[0] ?? "ko";
    const ext = this.extFromMime(input.mimeType);

    const form = new FormData();
    const blob = new Blob([input.audioBuffer.buffer as ArrayBuffer], { type: input.mimeType });
    form.append("file", blob, `audio.${ext}`);
    form.append("model", model);
    form.append("language", langCode);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "STT provider request failed");
      throw new BadRequestException(`STT provider request failed: ${errorText}`);
    }

    const data = (await response.json()) as { text?: string };

    return {
      ok: true,
      provider: "openai",
      text: data.text?.trim() ?? ""
    };
  }

  private extFromMime(mimeType: string): string {
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("wav")) return "wav";
    return "webm";
  }
}
