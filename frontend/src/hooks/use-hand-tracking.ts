"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";

// MediaPipe Hands 랜드마크 포인트 타입 (x, y, z 정규화 좌표)
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

// MediaPipe onResults 콜백에서 받는 결과 타입
interface HandsResults {
  multiHandLandmarks?: HandLandmark[][];
  multiHandedness?: Array<{
    label: string;
    score: number;
  }>;
  image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap;
}

// MediaPipe Hands 인스턴스 타입 (라이브러리 타입 대신 필요한 부분만 정의)
interface MediaPipeHands {
  setOptions: (options: {
    maxNumHands?: number;
    modelComplexity?: number;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }) => void;
  onResults: (callback: (results: HandsResults) => void) => void;
  send: (inputs: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
}

interface UseHandTrackingOptions {
  localVideoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

interface UseHandTrackingReturn {
  isSignMode: boolean;
  toggleSignMode: () => void;
  landmarks: RefObject<HandLandmark[][]>;
  isHandDetected: boolean;
}

// 손 랜드마크 연결선 정의 (MediaPipe Hands 21포인트 skeleton)
const HAND_CONNECTIONS: [number, number][] = [
  // 손목 ~ 엄지
  [0, 1], [1, 2], [2, 3], [3, 4],
  // 손목 ~ 검지
  [0, 5], [5, 6], [6, 7], [7, 8],
  // 손목 ~ 중지
  [0, 9], [9, 10], [10, 11], [11, 12],
  // 손목 ~ 약지
  [0, 13], [13, 14], [14, 15], [15, 16],
  // 손목 ~ 소지
  [0, 17], [17, 18], [18, 19], [19, 20],
  // 손바닥 가로 연결
  [5, 9], [9, 13], [13, 17],
];

export function useHandTracking({
  localVideoRef,
  canvasRef,
}: UseHandTrackingOptions): UseHandTrackingReturn {
  const [isSignMode, setIsSignMode] = useState(false);
  const [isHandDetected, setIsHandDetected] = useState(false);

  // landmarks는 ref로 관리 — 매 프레임 setState를 피해 리렌더링 방지 (이슈 4)
  const landmarksRef = useRef<HandLandmark[][]>([]);
  // isHandDetected 동기 비교용 ref (이슈 4)
  const isHandDetectedRef = useRef(false);

  // MediaPipe 인스턴스 참조 (리렌더링 없이 유지)
  const handsRef = useRef<MediaPipeHands | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // 랜드마크를 캔버스에 그리는 함수
  const drawLandmarks = useCallback(
    (detectedLandmarks: HandLandmark[][], videoEl: HTMLVideoElement) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 캔버스 크기를 비디오 크기에 맞춤 — 변경된 경우에만 재할당 (이슈 7)
      const newWidth = videoEl.videoWidth || videoEl.clientWidth;
      const newHeight = videoEl.videoHeight || videoEl.clientHeight;
      if (canvas.width !== newWidth) canvas.width = newWidth;
      if (canvas.height !== newHeight) canvas.height = newHeight;

      // 이전 프레임 지우기
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      detectedLandmarks.forEach((handLandmarks) => {
        // 연결선(skeleton) 그리기
        ctx.strokeStyle = "rgba(99, 179, 237, 0.85)"; // 파란빛 선
        ctx.lineWidth = 2;

        HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
          const start = handLandmarks[startIdx];
          const end = handLandmarks[endIdx];

          if (!start || !end) return;

          ctx.beginPath();
          ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
          ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
          ctx.stroke();
        });

        // 랜드마크 포인트 그리기
        handLandmarks.forEach((point, index) => {
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;

          ctx.beginPath();
          ctx.arc(x, y, index === 0 ? 5 : 3, 0, Math.PI * 2); // 손목(0번)은 크게

          // 손가락 끝(4, 8, 12, 16, 20번)은 강조색
          const isFingerTip = [4, 8, 12, 16, 20].includes(index);
          ctx.fillStyle = isFingerTip
            ? "rgba(252, 211, 77, 0.95)" // 노란색 (손가락 끝)
            : "rgba(255, 255, 255, 0.9)"; // 흰색 (관절)

          ctx.fill();
          ctx.strokeStyle = "rgba(30, 64, 175, 0.8)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      });
    },
    [canvasRef]
  );

  // MediaPipe Hands 결과 콜백
  const onResults = useCallback(
    (results: HandsResults) => {
      const detectedLandmarks = results.multiHandLandmarks ?? [];

      // landmarks는 ref에만 저장 — 리렌더링 없이 최신 값 유지 (이슈 4)
      landmarksRef.current = detectedLandmarks;

      // isHandDetected는 값이 실제로 변경된 경우에만 setState (이슈 4)
      const nowDetected = detectedLandmarks.length > 0;
      if (isHandDetectedRef.current !== nowDetected) {
        setIsHandDetected(nowDetected);
        isHandDetectedRef.current = nowDetected;
      }

      const videoEl = localVideoRef.current;
      if (videoEl) {
        drawLandmarks(detectedLandmarks, videoEl);
      }
    },
    [localVideoRef, drawLandmarks]
  );

  // 수화 모드 시작: MediaPipe 초기화 및 rAF 루프 시작
  const startHandTracking = useCallback(async (abortSignal: { aborted: boolean }) => {
    const videoEl = localVideoRef.current;
    if (!videoEl || isRunningRef.current) return;

    try {
      // MediaPipe 라이브러리 동적 로드 (CDN 방식)
      // camera_utils는 WebRTC srcObject를 덮어쓸 위험이 있어 import하지 않음 (이슈 2)
      const { Hands } = await import("@mediapipe/hands");

      // 비동기 로드 완료 전에 모드가 꺼졌으면 즉시 중단 (이슈 9)
      if (abortSignal.aborted) return;

      const hands = new Hands({
        // 설치된 @mediapipe/hands 버전과 CDN URL 버전을 일치시킴 (이슈 3)
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
      }) as unknown as MediaPipeHands;

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });

      hands.onResults(onResults);
      handsRef.current = hands;
      isRunningRef.current = true;

      // Camera 유틸 대신 rAF 루프로 직접 프레임 전달 — srcObject 덮어쓰기 방지 (이슈 2)
      const processFrame = async () => {
        if (!isRunningRef.current || !handsRef.current || !videoEl) return;
        if (videoEl.readyState >= 2) {
          await handsRef.current.send({ image: videoEl });
        }
        animationFrameRef.current = requestAnimationFrame(processFrame);
      };
      animationFrameRef.current = requestAnimationFrame(processFrame);
    } catch (error) {
      console.error("[useHandTracking] MediaPipe 초기화 실패:", error);
      isRunningRef.current = false;
      // 초기화 실패 시 수화 모드 상태도 함께 복구 (이슈 6)
      setIsSignMode(false);
    }
  }, [localVideoRef, onResults]);

  // 수화 모드 종료: 리소스 해제 및 캔버스 초기화
  const stopHandTracking = useCallback(() => {
    isRunningRef.current = false;

    // MediaPipe 인스턴스 닫기
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }

    // 애니메이션 프레임 취소
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 캔버스 초기화
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 상태 초기화
    landmarksRef.current = [];
    if (isHandDetectedRef.current) {
      setIsHandDetected(false);
      isHandDetectedRef.current = false;
    }
  }, [canvasRef]);

  // isSignMode 변경 시 트래킹 시작/종료
  // mounted 가드로 언마운트 후 비동기 완료 시 자동 정리 (이슈 5)
  useEffect(() => {
    let mounted = true;

    if (isSignMode) {
      // abort 플래그 객체 — 빠른 ON/OFF 경쟁 조건 방지 (이슈 9)
      const abortSignal = { aborted: false };
      void startHandTracking(abortSignal).then(() => {
        if (!mounted) {
          abortSignal.aborted = true;
          stopHandTracking();
        }
      });
      return () => {
        mounted = false;
        abortSignal.aborted = true;
        stopHandTracking();
      };
    } else {
      stopHandTracking();
      return () => {
        mounted = false;
        stopHandTracking();
      };
    }
  }, [isSignMode]); // startHandTracking, stopHandTracking는 의도적으로 제외 (무한루프 방지)

  const toggleSignMode = useCallback(() => {
    setIsSignMode((prev) => !prev);
  }, []);

  return {
    isSignMode,
    toggleSignMode,
    landmarks: landmarksRef,
    isHandDetected,
  };
}
