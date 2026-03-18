import { BadRequestException, Injectable } from "@nestjs/common";

interface CreateAudioInput {
  text?: unknown;
  lang?: unknown;
}

export interface BrowserTtsResponse {
  ok: true;
  provider: "browser";
  mode: "client-speech-synthesis";
  text: string;
  lang: string;
  voice: string;
}

export interface OpenAiTtsResponse {
  ok: true;
  provider: "openai";
  mode: "audio-data-url";
  text: string;
  lang: string;
  voice: string;
  audio: {
    mimeType: string;
    base64: string;
    dataUrl: string;
  };
}

export type TtsAudioResponse = BrowserTtsResponse | OpenAiTtsResponse;

@Injectable()
export class TtsService {
  async createAudio(payload: CreateAudioInput): Promise<TtsAudioResponse> {
    const text = this.validateText(payload?.text);
    const lang = this.validateLang(payload?.lang);
    const provider = (process.env.TTS_PROVIDER ?? "browser").trim().toLowerCase();

    if (provider !== "openai" || !process.env.OPENAI_API_KEY) {
      return this.createBrowserFallback(text, lang);
    }

    return this.createOpenAiAudio(text, lang);
  }

  private validateText(value: unknown) {
    if (typeof value !== "string") {
      throw new BadRequestException("text must be a string");
    }

    const text = value.trim();

    if (!text) {
      throw new BadRequestException("text is required");
    }

    if (text.length > 500) {
      throw new BadRequestException("text must be 500 characters or fewer");
    }

    return text;
  }

  private validateLang(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
      return "ko-KR";
    }

    return value.trim();
  }

  private createBrowserFallback(text: string, lang: string): BrowserTtsResponse {
    return {
      ok: true,
      provider: "browser",
      mode: "client-speech-synthesis",
      text,
      lang,
      voice: process.env.TTS_BROWSER_VOICE ?? "default"
    };
  }

  private async createOpenAiAudio(
    text: string,
    lang: string
  ): Promise<TtsAudioResponse> {
    const apiKey = process.env.OPENAI_API_KEY;

    const voice = process.env.OPENAI_TTS_VOICE ?? "alloy";
    const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
    const responseFormat = process.env.OPENAI_TTS_FORMAT ?? "mp3";

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: responseFormat
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "TTS provider request failed");
      throw new BadRequestException(`TTS provider request failed: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      ok: true,
      provider: "openai",
      mode: "audio-data-url",
      text,
      lang,
      voice,
      audio: {
        mimeType,
        base64,
        dataUrl: `data:${mimeType};base64,${base64}`
      }
    };
  }
}
