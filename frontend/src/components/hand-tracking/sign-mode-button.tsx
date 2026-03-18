interface SignModeButtonProps {
  isSignMode: boolean;
  isHandDetected: boolean;
  onClick: () => void;
}

// 수화 모드 토글 버튼
// 기존 컨트롤 바(통화 종료 버튼 옆)에 배치
export function SignModeButton({ isSignMode, isHandDetected, onClick }: SignModeButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={isSignMode}
      aria-label={isSignMode ? "수화 모드 끄기" : "수화 모드 켜기"}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 font-medium transition-colors",
        isSignMode
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          : "border-[var(--border)] bg-white/80 text-[var(--muted)] hover:bg-[var(--surface)]",
      ].join(" ")}
    >
      {/* 손 이모지 아이콘 */}
      <span aria-hidden="true" className="text-base leading-none">
        ✋
      </span>
      <span className="text-sm">수화 모드</span>

      {/* 수화 모드 ON일 때 손 감지 여부 표시 */}
      {isSignMode && (
        <span
          aria-label={isHandDetected ? "손 감지됨" : "손 미감지"}
          className={[
            "h-2 w-2 rounded-full",
            isHandDetected ? "bg-indigo-500" : "bg-indigo-200",
          ].join(" ")}
        />
      )}
    </button>
  );
}
