interface QuickRepliesPanelProps {
  quickReplies: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function QuickRepliesPanel({
  quickReplies,
  onSelect,
  disabled
}: QuickRepliesPanelProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted)]">Quick Reply</p>
      <h2 className="mt-1 text-xl font-semibold">빠른 응답</h2>
      <div className="mt-4 grid gap-3">
        {quickReplies.map((item) => (
          <button
            key={item}
            disabled={disabled}
            onClick={() => onSelect(item)}
            className="rounded-2xl border border-[var(--border)] bg-white/85 px-4 py-4 text-left text-sm font-medium disabled:text-slate-400"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}
