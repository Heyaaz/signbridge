interface CaptionPanelProps {
  roomStatus: string;
  inviteCode: string;
  entries: string[];
}

export function CaptionPanel({ roomStatus, inviteCode, entries }: CaptionPanelProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">Captions</p>
          <h2 className="text-xl font-semibold">자막 및 시스템 로그</h2>
        </div>
        <div className="rounded-full border border-[var(--border)] px-4 py-2 text-sm">
          room {roomStatus} / invite {inviteCode}
        </div>
      </div>
      <div className="grid gap-3">
        {entries.map((caption) => (
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
