interface TextResponsePanelProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function TextResponsePanel({
  value,
  onChange,
  onSend,
  disabled
}: TextResponsePanelProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted)]">Text to Speech</p>
      <h2 className="mt-1 text-xl font-semibold">텍스트 응답</h2>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="상대방에게 보낼 문장을 입력"
        className="mt-4 min-h-40 w-full resize-none rounded-3xl border border-[var(--border)] bg-white/80 p-4 text-base outline-none"
      />
      <button
        disabled={disabled}
        onClick={onSend}
        className="mt-4 h-12 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600"
      >
        텍스트 전송
      </button>
    </section>
  );
}
