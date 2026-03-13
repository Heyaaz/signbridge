const quickReplies = [
  "다시 말씀해 주세요",
  "천천히 말씀해 주세요",
  "잠시만 기다려 주세요",
  "이해했습니다"
];

export function QuickRepliesPanel() {
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted)]">Quick Reply</p>
      <h2 className="mt-1 text-xl font-semibold">빠른 응답</h2>
      <div className="mt-4 grid gap-3">
        {quickReplies.map((item) => (
          <button
            key={item}
            disabled
            className="rounded-2xl border border-[var(--border)] bg-white/85 px-4 py-4 text-left text-sm font-medium"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

