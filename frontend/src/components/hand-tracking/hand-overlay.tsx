import { RefObject } from "react";

interface HandOverlayProps {
  // 캔버스 ref (useHandTracking에서 전달받음)
  canvasRef: RefObject<HTMLCanvasElement | null>;
  // 수화 모드가 꺼지면 오버레이 숨김
  isVisible: boolean;
}

// 로컬 비디오 위에 absolute로 겹치는 캔버스 오버레이
// 부모 요소에 position: relative 가 있어야 함
// isVisible=false일 때 return null 대신 CSS hidden 처리 — ref가 항상 DOM에 유지됨 (이슈 8)
export function HandOverlay({ canvasRef, isVisible }: HandOverlayProps) {
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full rounded-[1.5rem] ${isVisible ? "" : "hidden"}`}
    />
  );
}
