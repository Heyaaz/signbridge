"use client";

/**
 * use-sign-classifier.ts
 *
 * 실시간 수화 분류 파이프라인 훅.
 *
 * 동작 흐름:
 *   1. 수화 모드 ON 시 SignClassifier를 동적으로 초기화 (TF.js 지연 로드)
 *   2. rAF 기반 프레임 카운터로 매 10프레임마다 추론 실행 (~3 TPS at 30fps)
 *   3. preprocessLandmarks → RingBuffer.push → 분류 → 필터링 → 단어 버퍼 축적
 *   4. 1.5초 idle 연속 시 단어 버퍼를 문장으로 합쳐 onFinal 콜백 호출
 *   5. 모델 미존재 시 graceful 처리 — 에러 없이 분류만 비활성화
 *
 * 필터링 기준:
 *   - confidence >= 0.7
 *   - "idle" 레이블 제외
 *   - 직전 인식 단어와 중복이면 무시
 */

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmark } from "@/hooks/use-hand-tracking";
import { RingBuffer } from "@/lib/sign/ring-buffer";
import { preprocessLandmarks } from "@/lib/sign/preprocess";
import type { SignClassifier } from "@/lib/sign/classifier";

/** 단어 확정 판정 신뢰도 임계값 */
const CONFIDENCE_THRESHOLD = 0.7;

/** 추론 간격 (프레임 수) — 30fps 기준 매 10프레임 = ~3 TPS */
const INFER_EVERY_N_FRAMES = 10;

/** idle 연속 감지 시 문장화 트리거 타이머 (ms) */
const SENTENCE_IDLE_MS = 1500;

/** MediaPipe multiHandedness 타입 (use-hand-tracking에서 미노출 — 로컬 정의) */
interface Handedness {
  label: string;
  score: number;
}

interface UseSignClassifierOptions {
  /** useHandTracking에서 반환된 landmarks ref */
  landmarksRef: RefObject<HandLandmark[][]>;
  /**
   * MediaPipe handedness ref.
   * use-hand-tracking이 handedness를 노출하지 않으므로 외부에서 주입하거나 생략.
   * 생략 시 좌우 구분 없이 첫 번째 손을 오른손으로 처리.
   */
  handednessRef?: RefObject<Handedness[] | undefined>;
  /** 수화 모드 활성화 여부 */
  isSignMode: boolean;
  /** 문장이 확정되었을 때 호출되는 콜백 */
  onFinal?: (sentence: string) => void;
  /** 단어가 인식될 때마다 호출되는 콜백 (임시 표시용) */
  onPartial?: (word: string) => void;
}

interface UseSignClassifierReturn {
  /** 현재 추론 중인 임시 단어 */
  partialWord: string | null;
  /** 확정 전 축적된 단어 버퍼 */
  wordBuffer: string[];
  /** 가장 마지막으로 확정된 문장 */
  finalSentence: string | null;
  /** 분류기 로드 완료 여부 */
  classifierReady: boolean;
}

export function useSignClassifier({
  landmarksRef,
  handednessRef,
  isSignMode,
  onFinal,
  onPartial,
}: UseSignClassifierOptions): UseSignClassifierReturn {
  const [partialWord, setPartialWord] = useState<string | null>(null);
  const [wordBuffer, setWordBuffer] = useState<string[]>([]);
  const [finalSentence, setFinalSentence] = useState<string | null>(null);
  const [classifierReady, setClassifierReady] = useState(false);

  // 내부 ref — 리렌더링 없이 최신 상태 추적
  const classifierRef = useRef<SignClassifier | null>(null);
  const ringBufferRef = useRef<RingBuffer>(new RingBuffer());
  const frameCounterRef = useRef(0);
  const rafHandleRef = useRef<number | null>(null);
  const isInferringRef = useRef(false); // 추론 중 중복 실행 방지

  /** 직전 인식 단어 (중복 방지용) */
  const lastWordRef = useRef<string | null>(null);
  /** 현재 축적된 단어 버퍼 (setState 없이 관리 — 타이머 콜백에서 읽기 위해) */
  const wordBufferRef = useRef<string[]>([]);
  /** idle 문장화 타이머 */
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 단어 버퍼를 문장으로 합쳐 확정한다.
   * AI API 미구현이므로 fallback: 단어를 쉼표로 연결
   */
  const commitSentence = useCallback(() => {
    const words = wordBufferRef.current;
    if (words.length === 0) return;

    // fallback 문장화: 단어를 쉼표로 연결
    const sentence = words.join(", ");

    setFinalSentence(sentence);
    setWordBuffer([]);
    setPartialWord(null);
    wordBufferRef.current = [];
    lastWordRef.current = null;

    onFinal?.(sentence);
  }, [onFinal]);

  /**
   * idle 타이머를 리셋한다.
   * 단어가 인식될 때마다 호출하여 1.5초 뒤 문장화를 트리거한다.
   */
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      commitSentence();
    }, SENTENCE_IDLE_MS);
  }, [commitSentence]);

  /**
   * 분류 결과를 처리하여 단어 버퍼에 추가하고 상태를 업데이트한다.
   */
  const handleClassifyResult = useCallback(
    (label: string, confidence: number) => {
      // idle 클래스 필터링
      if (label === "idle") return;

      // 신뢰도 필터링
      if (confidence < CONFIDENCE_THRESHOLD) return;

      // 임시 단어 업데이트 (partial)
      setPartialWord(label);
      onPartial?.(label);

      // 직전과 동일한 단어면 중복 무시
      if (label === lastWordRef.current) return;

      // 새 단어 확정
      lastWordRef.current = label;
      const newBuffer = [...wordBufferRef.current, label];
      wordBufferRef.current = newBuffer;
      setWordBuffer([...newBuffer]);

      // idle 타이머 리셋 (1.5초 후 문장화)
      resetIdleTimer();
    },
    [onPartial, resetIdleTimer]
  );

  /**
   * rAF 루프 — 매 N 프레임마다 랜드마크를 전처리하고 분류를 실행한다.
   * 추론은 비동기로 처리하여 UI를 블록하지 않는다.
   */
  const runLoop = useCallback(() => {
    rafHandleRef.current = requestAnimationFrame(runLoop);

    frameCounterRef.current++;
    if (frameCounterRef.current % INFER_EVERY_N_FRAMES !== 0) return;

    // 분류기 미준비 시 스킵
    if (!classifierRef.current?.loaded) return;

    // 이전 추론이 아직 실행 중이면 스킵 (비동기 중첩 방지)
    if (isInferringRef.current) return;

    const landmarks = landmarksRef.current;
    const handedness = handednessRef?.current;

    // 프레임 전처리 후 버퍼에 추가
    const frame = preprocessLandmarks(
      landmarks.length > 0 ? landmarks : undefined,
      handedness
    );
    ringBufferRef.current.push(frame);

    // 추론 실행 (비동기 — UI 블록 없음)
    const windowData = ringBufferRef.current.getWindow();
    isInferringRef.current = true;

    void classifierRef.current.classify(windowData).then((result) => {
      isInferringRef.current = false;
      if (result) {
        handleClassifyResult(result.label, result.confidence);
      }
    });
  }, [landmarksRef, handednessRef, handleClassifyResult]);

  // 수화 모드 ON/OFF에 따라 분류기 초기화 및 루프 시작/종료
  useEffect(() => {
    if (!isSignMode) {
      // 수화 모드 OFF: 루프 정지 및 리소스 해제
      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = null;
      }
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      classifierRef.current?.dispose();
      classifierRef.current = null;
      ringBufferRef.current.reset();
      frameCounterRef.current = 0;
      lastWordRef.current = null;
      wordBufferRef.current = [];
      setPartialWord(null);
      setWordBuffer([]);
      setClassifierReady(false);
      return;
    }

    // 수화 모드 ON: 분류기 초기화 (동적 import)
    let cancelled = false;

    async function initClassifier() {
      try {
        // SignClassifier도 동적 import로 처리 (TF.js 포함 번들 분리)
        const { SignClassifier } = await import("@/lib/sign/classifier");

        if (cancelled) return;

        const classifier = new SignClassifier();
        await classifier.load();

        if (cancelled) {
          classifier.dispose();
          return;
        }

        classifierRef.current = classifier;
        setClassifierReady(classifier.loaded);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[useSignClassifier] 분류기 초기화 실패: ${message}`);
        setClassifierReady(false);
      }
    }

    void initClassifier();

    // rAF 루프 시작
    rafHandleRef.current = requestAnimationFrame(runLoop);

    return () => {
      cancelled = true;

      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = null;
      }
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      classifierRef.current?.dispose();
      classifierRef.current = null;
      ringBufferRef.current.reset();
      frameCounterRef.current = 0;
      lastWordRef.current = null;
      wordBufferRef.current = [];
    };
  }, [isSignMode]); // runLoop는 의도적으로 제외 (의존성 변경 시 루프 재시작 방지)

  return {
    partialWord,
    wordBuffer,
    finalSentence,
    classifierReady,
  };
}
