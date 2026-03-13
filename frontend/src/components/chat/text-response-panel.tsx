export function TextResponsePanel() {
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted)]">Text to Speech</p>
      <h2 className="mt-1 text-xl font-semibold">텍스트 응답</h2>
      <textarea
        disabled
        placeholder="TTS 요청 로직은 아직 구현하지 않았습니다."
        className="mt-4 min-h-40 w-full resize-none rounded-3xl border border-[var(--border)] bg-white/80 p-4 text-base outline-none"
      />
      <button
        disabled
        className="mt-4 h-12 w-full rounded-full bg-slate-300 text-sm font-semibold text-slate-600"
      >
        음성으로 전달 예정
      </button>
    </section>
  );
}

