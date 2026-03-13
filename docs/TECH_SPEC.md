# Tech Spec — SignBridge

> 청각 장애인을 위한 영상 기반 의사소통 보조 플랫폼

---

## 1. 문서 목적

이 문서는 SignBridge MVP를 구현하기 위한 기술 설계 문서다.

**MVP 핵심 목표**

- 1:1 영상 통화
- 음성 → 실시간 자막 (STT)
- 텍스트 → 음성 (TTS)
- 빠른 응답 버튼
- 접근성 중심 UI

> 수화 → 텍스트 기능은 실험적 확장 기능으로 정의하며, MVP 핵심 경로에서는 제외한다.

---

## 2. 기술 스택

### Frontend

| 항목 | 선택 |
|------|------|
| 프레임워크 | Next.js (App Router) |
| UI 라이브러리 | React |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS |
| 실시간 통신 | WebRTC API, WebSocket |

> Next.js는 React 기반 프레임워크다. React를 Next.js 안에서 사용하는 구조이며, 별도로 분리된 개념이 아니다.
> Next.js가 라우팅, SSR, 빌드, 배포 편의성을 제공한다.

### Backend

| 항목 | 선택 |
|------|------|
| 프레임워크 | NestJS |
| 언어 | TypeScript |
| ORM | Prisma |
| 실시간 | WebSocket Gateway |

> NestJS를 선택한 이유: 이 서비스는 단순 REST API가 아니라 WebSocket Gateway, 외부 AI API orchestration, 룸 상태 관리가 함께 필요하다. NestJS는 모듈 단위 구조화가 쉽고 TypeScript 일관성을 유지할 수 있어 적합하다.

### Database

| 항목 | 선택 |
|------|------|
| DB | PostgreSQL |
| 이유 | 명확한 관계형 데이터 구조, 안정성, Prisma 호환성 |

**PostgreSQL을 선택한 이유**

이 서비스의 데이터는 다음과 같이 명확한 관계를 가진다.

```
UserSession
  └─ RoomParticipant
      └─ Room
          ├─ CaptionEvent
          ├─ MessageEvent
          └─ CallLog
```

관계형 데이터이므로 PostgreSQL이 자연스럽다. 추후 pgvector, Full-text search, JSON 컬럼 등으로 확장도 가능하다.

### External Services

| 항목 | 선택 |
|------|------|
| STT | Whisper API 계열 또는 Google Speech-to-Text |
| TTS | Google Cloud TTS 또는 OpenAI TTS |
| STUN | 공인 STUN 서버 |
| TURN | coturn (NAT traversal 실패 시 fallback) |

---

## 3. 시스템 아키텍처

```
[Next.js Frontend]
    ├─ WebRTC Peer Connection
    ├─ WebSocket Client
    ├─ Caption UI
    └─ Text Input / TTS Playback

         │ HTTPS / WSS
         ▼

[NestJS Backend]
    ├─ Room Service
    ├─ WebRTC Signaling Gateway
    ├─ Caption (STT) Service
    ├─ TTS Service
    └─ AI Integration Layer

         │
         ├─ PostgreSQL
         ├─ STT API
         └─ TTS API
```

---

## 4. NestJS 모듈 설계

### 4.1 모듈 구조

```
src/
  app.module.ts
  main.ts
  config/
  common/
    dto/
    guards/
    filters/
    interceptors/
  modules/
    auth/          # 세션 발급, 닉네임 관리
    room/          # 방 생성/조회/상태 관리
    signaling/     # WebRTC offer/answer/ICE 교환
    caption/       # STT 처리, 자막 브로드캐스트
    tts/           # 텍스트 → 음성 변환
    quick-reply/   # 빠른 응답 템플릿 관리
    call-log/      # 통화 로그 저장
    ai/            # STT/TTS provider adapter
  infra/
    prisma/
    redis/         # optional
```

### 4.2 각 모듈 역할

| 모듈 | 역할 |
|------|------|
| auth | 익명 세션 발급, 닉네임 저장, room join 토큰 생성 |
| room | 룸 생성/조회, 참가자 입장/퇴장, 방 상태 관리 |
| signaling | WebRTC offer/answer/ICE candidate 전달 |
| caption | STT 결과 수신, partial/final 자막 브로드캐스트, 로그 저장 |
| tts | 텍스트 → 음성 변환, 오디오 응답 처리 |
| quick-reply | 자주 쓰는 문장 템플릿 관리 및 제공 |
| call-log | 통화 세션/자막/메시지 이벤트 기록 |
| ai | STT/TTS provider 추상화 (adapter 패턴) |

---

## 5. Frontend 구조

```
src/
  app/
    room/[roomId]/page.tsx
    landing/page.tsx
  components/
    call/
    caption/
    chat/
    controls/
    quick-replies/
  hooks/
    useWebRTC.ts
    useSocket.ts
    useCaptions.ts
    useTTS.ts
  lib/
    api.ts
    socket.ts
    rtc.ts
  stores/
    roomStore.ts
    captionStore.ts
  types/
```

### 주요 UI 영역

- 상대 영상
- 내 영상 미리보기
- 실시간 자막 패널
- 텍스트 입력 패널
- 빠른 응답 버튼 영역
- 연결 상태 표시

### 접근성 요구사항

- 자막 글자 크기 확대 가능
- 고대비 모드
- 버튼 터치 영역 충분한 크기
- 핵심 상태를 텍스트로 명시

---

## 6. WebRTC 설계

### 6.1 통화 방식

MVP는 **1:1 P2P WebRTC**로 구현한다.

### 6.2 Signaling 흐름

WebRTC 연결 전 협상 정보 교환은 NestJS WebSocket Gateway가 담당한다.

```
User A                NestJS              User B
   |                    |                   |
   |--- room:join ----->|                   |
   |                    |<-- room:join -----|
   |                    |                   |
   |--- webrtc:offer -->|--- webrtc:offer ->|
   |                    |<- webrtc:answer --|
   |<-- webrtc:answer --|                   |
   |                    |                   |
   |--- ice:candidate ->|--- ice:candidate->|
   |<-- ice:candidate --|<-- ice:candidate--|
   |                    |                   |
   |<====== WebRTC P2P Connection =========>|
```

**역할 분리**

| 기술 | 역할 |
|------|------|
| WebSocket | signaling 정보 교환, 상태 이벤트 |
| WebRTC | 실제 영상/음성 스트림 전달 |

### 6.3 NAT Traversal

| 방식 | 역할 |
|------|------|
| STUN | 공인 주소 확인 |
| TURN | direct 연결 실패 시 relay (coturn) |

---

## 7. 실시간 자막 (STT) 설계

### 7.1 처리 흐름

```
브라우저 마이크 캡처
  → 오디오 chunk 생성
  → WebSocket으로 NestJS 전송
  → STT API 호출
  → partial transcript 수신
  → caption:partial 이벤트 전송
  → final transcript 수신
  → caption:final 이벤트 전송 + DB 저장
```

### 7.2 Partial / Final 분리 이유

| 구분 | 설명 |
|------|------|
| partial | 실시간에 가깝게 먼저 표시, 내용이 바뀔 수 있음 |
| final | 확정된 자막, 로그 저장 대상 |

partial을 먼저 보여줌으로써 사용자 체감 지연을 줄인다.

---

## 8. TTS 설계

### 8.1 처리 흐름

```
청각 장애인 텍스트 입력
  → NestJS TTS Service
  → 외부 TTS API 호출
  → 오디오 생성
  → 상대방 브라우저에서 재생
  → 이벤트 로그 저장
```

### 8.2 오디오 전달 방식

MVP는 짧은 오디오 blob 또는 임시 URL 방식을 사용한다.

---

## 9. 수화 인식 설계 (확장 기능)

MVP 핵심 기능에서 제외하며, **플러그인형 별도 서비스**로 설계한다.

### 9.1 처리 방식

수화 인식은 원본 영상을 직접 번역하는 것이 아니라, 손/몸 landmark를 추출하고 그 시퀀스를 분류하는 방식을 사용한다.

```
카메라 영상
  → MediaPipe Holistic (landmark 추출)
      - 왼손 21 포인트
      - 오른손 21 포인트
      - 신체 포즈 포인트
  → 프레임 시퀀스 버퍼 (N개 프레임)
  → 분류 모델 (LSTM / GRU)
  → 확률 기반 label 출력
  → NestJS로 전달
  → 자막/메시지 흐름에 합산
```

### 9.2 MVP 인식 대상 (5~10개 단어)

| 수화 | 출력 |
|------|------|
| 네 | 네 |
| 아니요 | 아니요 |
| 감사합니다 | 감사합니다 |
| 잠시만요 | 잠시만 기다려 주세요 |
| 다시 | 다시 말씀해 주세요 |

### 9.3 인식 UX

완전 자동 인식보다 **반자동 방식**이 더 안정적이다.

```
[수화 입력 시작] 버튼 누름
  → 2초간 landmark 수집
  → 분류 모델 실행
  → 결과 확인 ("감사합니다" 맞습니까?)
  → 확정 후 전송
```

### 9.4 서비스 분리 구조

```
Next.js
  → MediaPipe landmark 추출
  → gesture payload 전송
  → Python recognition service (FastAPI)
  → recognized intent 반환
  → NestJS
  → 상대방 UI 표시
```

| 서비스 | 역할 |
|--------|------|
| NestJS | 룸, signaling, 메시지, 자막, TTS |
| Python (FastAPI) | 수화/제스처 인식 |

---

## 10. 데이터 모델

### UserSession

```
id          String   @id
nickname    String
role        Role     // deaf | speaker | guest
createdAt   DateTime
lastSeenAt  DateTime
```

### Room

```
id          String      @id
inviteCode  String      @unique
status      RoomStatus  // waiting | active | ended
createdAt   DateTime
startedAt   DateTime?
endedAt     DateTime?
```

### RoomParticipant

```
id               String   @id
roomId           String
sessionId        String
joinedAt         DateTime
leftAt           DateTime?
connectionState  String
```

### CaptionEvent

```
id               String   @id
roomId           String
speakerSessionId String
content          String
isFinal          Boolean
sequence         Int
createdAt        DateTime
```

### MessageEvent

```
id               String      @id
roomId           String
senderSessionId  String
content          String
messageType      MessageType // text | quick_reply | sign_intent
createdAt        DateTime
```

### CallLog

```
id            String   @id
roomId        String
durationSec   Int
captionCount  Int
messageCount  Int
endReason     String?
createdAt     DateTime
```

---

## 11. API 설계

### POST /rooms — 방 생성

**Request**
```json
{
  "nickname": "user1",
  "role": "speaker"
}
```

**Response**
```json
{
  "roomId": "room_xxx",
  "inviteCode": "ABCD12",
  "sessionToken": "token_xxx"
}
```

### POST /rooms/:roomId/join — 방 입장

**Request**
```json
{
  "nickname": "user2",
  "role": "deaf"
}
```

**Response**
```json
{
  "roomId": "room_xxx",
  "sessionToken": "token_yyy"
}
```

### GET /rooms/:roomId — 방 정보 조회

**Response**
```json
{
  "id": "room_xxx",
  "status": "active",
  "participants": [
    { "sessionId": "sess_1", "nickname": "user1", "role": "speaker" },
    { "sessionId": "sess_2", "nickname": "user2", "role": "deaf" }
  ]
}
```

### GET /quick-replies — 빠른 응답 목록

**Response**
```json
[
  "다시 말씀해 주세요",
  "천천히 말씀해 주세요",
  "잠시만 기다려 주세요",
  "이해했습니다"
]
```

### POST /tts — 텍스트 → 음성 변환

**Request**
```json
{
  "roomId": "room_xxx",
  "text": "다시 말씀해 주세요"
}
```

**Response**
```json
{
  "audioUrl": "https://..."
}
```

---

## 12. WebSocket 이벤트

### Client → Server

| 이벤트 | 설명 |
|--------|------|
| `room:join` | 방 입장 |
| `webrtc:offer` | WebRTC offer 전달 |
| `webrtc:answer` | WebRTC answer 전달 |
| `webrtc:ice-candidate` | ICE candidate 전달 |
| `caption:chunk` | 오디오 chunk 전송 |
| `message:text` | 텍스트 메시지 전송 |
| `message:quick-reply` | 빠른 응답 전송 |
| `call:end` | 통화 종료 |

### Server → Client

| 이벤트 | 설명 |
|--------|------|
| `room:user-joined` | 상대방 입장 알림 |
| `room:user-left` | 상대방 퇴장 알림 |
| `webrtc:offer` | WebRTC offer 전달 |
| `webrtc:answer` | WebRTC answer 전달 |
| `webrtc:ice-candidate` | ICE candidate 전달 |
| `caption:partial` | 중간 자막 |
| `caption:final` | 확정 자막 |
| `message:received` | 메시지 수신 |
| `tts:ready` | 음성 준비 완료 |
| `call:ended` | 통화 종료 알림 |

---

## 13. MVP Scope

### 포함

- 1:1 영상 통화 (WebRTC)
- 실시간 자막 (STT)
- 텍스트 → 음성 (TTS)
- 빠른 응답 버튼
- 기본 통화 로그

### 제외

- 다자간 통화
- 완전한 수화 번역
- 다국어 번역
- 회원가입 / 로그인
- 관리자 페이지

---

## 14. 개발 우선순위

| Phase | 기능 |
|-------|------|
| Phase 1 | 방 생성/입장, WebSocket 연결, 1:1 WebRTC 통화 |
| Phase 2 | STT partial/final 자막, 자막 UI, 기본 로그 |
| Phase 3 | TTS, 빠른 응답, 연결 에러 핸들링 |
| Phase 4 | 통화 기록 개선, 접근성 UI 강화, 수화 확장 인터페이스 정의 |

---

## 15. 배포 구성

| 항목 | 선택 |
|------|------|
| Frontend | Vercel |
| Backend | Railway / Render / EC2 |
| Database | Neon / Supabase / RDS |
| TURN Server | coturn |

---

## 16. 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| WebRTC 연결 불안정 | TURN fallback 적용, 연결 상태 UI 표시 |
| STT 지연 | partial transcript 활용, provider 교체 가능한 구조 유지 |
| TTS 응답 지연 | 짧은 문장 중심 사용, 빠른 응답 버튼 우선 제공 |
| 수화 인식 범위 과대화 | MVP 핵심에서 제외, 추후 별도 서비스로 확장 |

---

## 17. MVP 완료 기준

- [ ] 두 사용자가 브라우저에서 같은 룸에 접속 가능
- [ ] 영상/음성 통화 가능
- [ ] 한 사용자의 음성이 상대 화면에 자막으로 표시됨
- [ ] 다른 사용자가 텍스트 입력 시 음성으로 재생됨
- [ ] 빠른 응답 버튼으로 대표 문장 전송 가능
- [ ] 기본 통화 로그 저장 가능

---

## 18. 포트폴리오/면접 포인트

이 프로젝트로 설명 가능한 기술 포인트:

1. 왜 REST만이 아니라 WebSocket Gateway가 필요한가
2. WebRTC와 signaling의 역할 분리
3. STT/TTS provider를 adapter 패턴으로 분리한 이유
4. 실시간 자막에서 partial/final transcript를 분리한 이유
5. 향후 수화 인식을 별도 서비스로 분리한 이유
6. 접근성 요구사항을 UI/시스템 설계에 어떻게 반영했는가

---

## 19. Summary

SignBridge MVP는 **영상 통화 + 실시간 자막 + 텍스트 음성 변환**에 집중한다.

- **Frontend**: Next.js + React + TypeScript
- **Backend**: NestJS + TypeScript
- **DB**: PostgreSQL
- **Realtime**: WebSocket Gateway + WebRTC
- **AI**: STT/TTS 외부 API 연동
- **Gesture**: 추후 Python FastAPI 서비스로 분리
