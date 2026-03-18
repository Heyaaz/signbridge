# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SignBridge는 청각 장애인과 비장애인이 영상 통화를 통해 의사소통할 수 있도록 지원하는 웹 플랫폼이다. npm workspace 기반 monorepo로 frontend/backend를 관리한다.

## Commands

### Development
```bash
npm run dev:frontend       # Next.js 개발 서버 (포트 3000)
npm run dev:backend        # NestJS 개발 서버 (포트 4000, watch mode)
```

### Build
```bash
npm run build:frontend     # Next.js 프로덕션 빌드
npm run build:backend      # NestJS TypeScript 컴파일
```

### Docker
```bash
npm run docker:up          # 전체 스택 (frontend + backend + PostgreSQL)
npm run docker:down
```

### Database (backend 디렉토리)
```bash
npm run prisma:generate        # Prisma 클라이언트 생성
npm run prisma:migrate:dev     # 개발 마이그레이션
npm run prisma:migrate:deploy  # 배포 마이그레이션
```

### Lint
```bash
cd frontend && npm run lint
cd backend && npm run lint
```

## Architecture

### 기술 스택
- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS
- **Backend**: NestJS 11 + TypeScript + Prisma + PostgreSQL 16
- **Realtime**: WebRTC (P2P 영상/음성) + Socket.IO (시그널링/메시징)
- **Hand Tracking**: MediaPipe Hands (브라우저 내 실행)
- **Node.js**: v22.13.0 (.nvmrc)

### 데이터 흐름
```
Frontend (Next.js)                    Backend (NestJS)
├─ WebRTC P2P ◄──────────────────────── Signaling Gateway (offer/answer/ICE 릴레이)
├─ Socket.IO Client ◄───────────────── Room/Caption/Sign Gateway (이벤트 브로드캐스트)
├─ MediaPipe Hands → TF.js 분류
└─ REST API calls ──────────────────── Room/TTS/QuickReply Controller
                                           │
                                           └─ Prisma → PostgreSQL
```

### WebSocket 이벤트 네임스페이스
- **기본 (`/`)**: signaling (webrtc:offer/answer/ice-candidate), room (join/leave), message, call, sign (mode/partial/final)
- **`/caption`**: caption (partial/final)

sign 이벤트는 기본 네임스페이스에서 동작해야 한다 — `room:join` 시 설정되는 `socket.data.roomId`와 `socket.data.sessionId`에 의존하기 때문.

### Frontend Hooks 구조
- `use-webrtc.ts` — RTCPeerConnection 생성, MediaStream 관리, ICE 처리
- `use-socket.ts` — Socket.IO 연결, 이벤트 리스너 등록/해제
- `use-hand-tracking.ts` — MediaPipe Hands 초기화, rAF 루프로 프레임 전달, 수화 모드 ON/OFF

### Backend 모듈 구조
NestJS 모듈은 기능 단위로 분리: room, signaling, caption, tts, quick-reply, call-log, sign. 각 모듈은 독립적인 gateway/controller/service를 가진다.

### 수화 인식 파이프라인 (확장 기능)
```
카메라 → MediaPipe Hands (랜드마크 추출) → 슬라이딩 윈도우 → TF.js LSTM 모델 (브라우저 내 추론)
→ partial/final 자막 → WebSocket → 상대방 화면
```
모델 학습 코드는 `training/` 디렉토리에 있으며 별도 레포로 분리 예정.

## Key Patterns

### WebSocket Gateway 보안
모든 WebSocket 핸들러에서 `socket.data.roomId`와 `socket.data.sessionId`를 사용한다. 클라이언트 payload의 roomId/sessionId를 신뢰하지 않는다.

### 동적 import
MediaPipe 라이브러리는 수화 모드 ON 시에만 동적 import로 로드한다. 초기 번들에 포함되지 않는다.

### Prisma 모델
UserSession(세션 기반 인증, sessionToken), Room(inviteCode 기반 입장), RoomParticipant, CaptionEvent, MessageEvent(text/quick_reply/sign_intent), CallLog.

## Environment Variables
`.env.example` 참조. 주요 변수: `DATABASE_URL`, `NEXT_PUBLIC_API_BASE_URL` (기본 http://localhost:4000).

## Conventions
- 한국어 주석 사용
- 커밋 메시지 한국어 (feat/fix/chore/docs/ref/style/test 타입)
- Frontend path alias: `@/*` → `./src/*`
