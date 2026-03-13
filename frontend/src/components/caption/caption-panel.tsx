const captions = [
  "partial caption placeholder",
  "final caption placeholder",
  "large-text accessibility preview"
];

export function CaptionPanel() {
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">Captions</p>
          <h2 className="text-xl font-semibold">실시간 자막 패널</h2>
        </div>
        <button className="rounded-full border border-[var(--border)] px-4 py-2 text-sm">
          글자 확대
        </button>
      </div>
      <div className="grid gap-3">
        {captions.map((caption) => (
          <div
            key={caption}
            className="rounded-2xl border border-[var(--border)] bg-white/80 p-4 text-lg"
          >
            {caption}
          </div>
        ))}
      </div>
    </section>
  );
}

