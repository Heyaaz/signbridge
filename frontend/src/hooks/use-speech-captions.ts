"use client";

import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

interface UseSpeechCaptionsOptions {
  enabled: boolean;
  socket: Socket | null;
  lang?: string;
}

export function useSpeechCaptions({
  enabled,
  socket,
  lang = "ko-KR"
}: UseSpeechCaptionsOptions) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRef = useRef(false);
  const latestSocketRef = useRef<Socket | null>(socket);
  const lastPartialRef = useRef("");
  const [status, setStatus] = useState("stt idle");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    latestSocketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setSupported(false);
      setStatus("stt unsupported");
      return;
    }

    setSupported(true);

    if (!enabled || !socket) {
      shouldRestartRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setStatus("stt idle");
      return;
    }

    shouldRestartRef.current = true;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setStatus("stt listening");
    };

    recognition.onerror = (event) => {
      setStatus(`stt error: ${event.error ?? "unknown"}`);
    };

    recognition.onend = () => {
      if (!shouldRestartRef.current) {
        setStatus("stt stopped");
        return;
      }

      try {
        recognition.start();
      } catch {
        setStatus("stt restart waiting");
      }
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          latestSocketRef.current?.emit("caption:final", {
            content: transcript
          });
          interimTranscript = "";
          lastPartialRef.current = "";
        } else {
          interimTranscript = transcript;
        }
      }

      if (interimTranscript && interimTranscript !== lastPartialRef.current) {
        lastPartialRef.current = interimTranscript;
        latestSocketRef.current?.emit("caption:partial", {
          content: interimTranscript
        });
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setStatus("stt start failed");
    }

    return () => {
      shouldRestartRef.current = false;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [enabled, lang, socket]);

  return {
    supported,
    status
  };
}
