# SignBridge Workspace

`frontend` Next.js App Router 구조
`backend` NestJS 모듈 폴더 구성
실시간 통화 / STT / TTS 로직 미구현

## Structure

- `frontend`: 화면 구조, 라우트, 컴포넌트 배치
- `backend`: API 경로, WebSocket 모듈 자리, 서비스 스텁
- `docs`: PRD, 기술 명세

## Notes

- 비즈니스 로직 없음
- 외부 STT/TTS 연동 없음
- 데이터베이스/Prisma 실제 설정 없음

## Local Setup

```bash
nvm use
npm install
```

## Run

```bash
npm run dev:frontend
npm run dev:backend
```
