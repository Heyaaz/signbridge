import { CaptionPanel } from "@/components/caption/caption-panel";
import { ConnectionStatus } from "@/components/controls/connection-status";
import { QuickRepliesPanel } from "@/components/quick-replies/quick-replies-panel";
import { TextResponsePanel } from "@/components/chat/text-response-panel";

interface CallLayoutProps {
  roomId: string;
}

export function CallLayout({ roomId }: CallLayoutProps) {
  return (
    <main className="mx-auto grid min-h-screen max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1.45fr_0.95fr]">
      <section className="grid gap-6">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--muted)]">Room</p>
              <h1 className="text-2xl font-semibold">{roomId}</h1>
            </div>
            <ConnectionStatus />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
            <div className="flex aspect-video items-center justify-center rounded-[1.5rem] bg-[#1f2937] text-sm text-white/70">
              Remote video placeholder
            </div>
            <div className="flex aspect-[4/5] items-center justify-center rounded-[1.5rem] bg-[#334155] text-sm text-white/70">
              Local preview
            </div>
          </div>
        </div>

        <CaptionPanel />
      </section>

      <aside className="grid gap-6">
        <TextResponsePanel />
        <QuickRepliesPanel />
      </aside>
    </main>
  );
}

