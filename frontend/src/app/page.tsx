import Link from "next/link";

const sections = [
  "영상 통화 레이아웃",
  "실시간 자막 패널",
  "텍스트 입력 / TTS 영역",
  "빠른 응답 영역",
  "연결 상태 표시"
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_30px_80px_rgba(22,32,42,0.08)] backdrop-blur">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
              SignBridge
            </p>
            <h1 className="text-4xl font-semibold leading-tight">
              문서 기준 프로젝트 뼈대
            </h1>
            <p className="mt-3 max-w-2xl text-base text-[var(--muted)]">
              실제 통화 로직 없이 프론트엔드 구조와 주요 화면 배치를 먼저 구성한 상태다.
            </p>
          </div>
          <Link
            href="/room/sample-room"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
          >
            Room 화면 보기
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {sections.map((section) => (
            <article
              key={section}
              className="rounded-3xl border border-[var(--border)] bg-white/80 p-5"
            >
              <p className="text-sm font-medium text-[var(--muted)]">Planned Area</p>
              <h2 className="mt-2 text-lg font-semibold">{section}</h2>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

