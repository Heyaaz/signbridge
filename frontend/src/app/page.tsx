"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom, resolveInviteCode } from "@/lib/api";
import { saveRoomSession } from "@/lib/session";
import { Role } from "@/types/signbridge";

const roles: Array<{ value: Role; label: string }> = [
  { value: "speaker", label: "말하는 사용자" },
  { value: "deaf", label: "자막 중심 사용자" },
  { value: "guest", label: "게스트" }
];

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<Role>("speaker");
  const [inviteCode, setInviteCode] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("대기 중");

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("방 생성 중");
    setError(null);

    try {
      const response = await createRoom({ nickname, role });

      saveRoomSession({
        roomId: response.roomId,
        sessionId: response.sessionId,
        sessionToken: response.sessionToken,
        inviteCode: response.inviteCode,
        role,
        nickname
      });

      router.push(`/room/${response.roomId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "방 생성 실패");
      setStatus("실패");
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("방 입장 중");
    setError(null);

    try {
      const targetRoomId =
        joinRoomId.trim() ||
        (await resolveInviteCode(inviteCode)).roomId;

      const response = await joinRoom(targetRoomId, { nickname, role });

      saveRoomSession({
        roomId: response.roomId,
        sessionId: response.sessionId,
        sessionToken: response.sessionToken,
        inviteCode: response.inviteCode,
        role,
        nickname
      });

      router.push(`/room/${response.roomId}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "방 입장 실패");
      setStatus("실패");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_30px_80px_rgba(22,32,42,0.08)] backdrop-blur">
        <div className="mb-8 max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
            SignBridge
          </p>
          <h1 className="text-4xl font-semibold leading-tight">
            1:1 접근성 통화 시작
          </h1>
          <p className="mt-3 text-base text-[var(--muted)]">
            닉네임과 역할을 정하고 방을 만들거나, 초대 코드로 기존 방에 들어갑니다.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={handleCreateRoom}
            className="rounded-[1.75rem] border border-[var(--border)] bg-white/80 p-6"
          >
            <p className="text-sm text-[var(--muted)]">Create Room</p>
            <h2 className="mt-1 text-2xl font-semibold">새 통화방</h2>
            <label className="mt-5 block text-sm font-medium">
              닉네임
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--border)] px-4 outline-none"
                placeholder="예: 상담직원1"
                minLength={2}
                required
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              역할
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--border)] px-4 outline-none"
              >
                {roles.map((roleOption) => (
                  <option key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="mt-6 h-12 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]">
              방 생성
            </button>
          </form>

          <form
            onSubmit={handleJoinRoom}
            className="rounded-[1.75rem] border border-[var(--border)] bg-white/80 p-6"
          >
            <p className="text-sm text-[var(--muted)]">Join Room</p>
            <h2 className="mt-1 text-2xl font-semibold">기존 통화방</h2>
            <label className="mt-5 block text-sm font-medium">
              닉네임
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--border)] px-4 outline-none"
                placeholder="예: 환자1"
                minLength={2}
                required
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Room ID
              <input
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--border)] px-4 outline-none"
                placeholder="room id 직접 입력"
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Invite Code
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--border)] px-4 uppercase outline-none"
                placeholder="예: ABCD12"
              />
            </label>
            <button className="mt-6 h-12 w-full rounded-full border border-[var(--accent)] text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white">
              방 입장
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-[var(--border)] bg-[#f8fbff] px-5 py-4 text-sm text-[var(--muted)]">
          <strong className="mr-2 text-slate-900">상태</strong>
          {status}
          {error ? <span className="ml-3 text-rose-600">{error}</span> : null}
        </div>
      </section>
    </main>
  );
}
