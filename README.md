# SignBridge Workspace

문서(`docs/`) 기준으로 프론트엔드와 백엔드를 분리한 프로젝트 뼈대다.

## Structure

- `frontend`: Next.js App Router 기반 UI 골격
- `backend`: NestJS 기반 API / WebSocket 서버 골격
- `docs`: PRD, 기술 명세

## Notes

- 비즈니스 로직은 구현하지 않았다.
- 외부 STT/TTS 연동은 추후 추가 대상이다.
- 데이터베이스/Prisma 설정은 폴더 구조만 고려하고 아직 포함하지 않았다.

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
