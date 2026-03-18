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

> 상세 구현 계획은 `docs/HAND_TRACKING_PLAN.md` 참조

### 9.1 처리 방식 (하이브리드)

수화 인식은 **브라우저 내 단어 인식 + AI API 문장화** 하이브리드 방식을 사용한다.

```
카메라 영상
  → MediaPipe Hands (브라우저, 손 랜드마크 추출)
      - 왼손 21 포인트
      - 오른손 21 포인트
  → 좌표 정규화 (손목 기준, 스케일 불변)
  → 슬라이딩 윈도우 (30프레임)
  → LSTM 분류 모델 (TF.js, 브라우저 내 추론)
  → 단어 단위 partial 자막 즉시 표시      ← ~0.3초
  → 동작 멈춤 감지 (1.5초 idle)
  → 축적된 단어 → NestJS → AI API 문장화
  → SSE 스트리밍으로 final 자막 표시       ← ~1.5~2.5초
```

### 9.2 MVP 인식 대상 (10개 단어 + idle)

| 수화 | 출력 |
|------|------|
| idle | (표시 안 함) |
| 네 | 네 |
| 아니요 | 아니요 |
| 감사합니다 | 감사합니다 |
| 잠시만요 | 잠시만 기다려 주세요 |
| 다시 | 다시 말씀해 주세요 |
| 도움 | 도움이 필요합니다 |
| 괜찮아요 | 괜찮습니다 |
| 모르겠어요 | 잘 모르겠습니다 |
| 안녕하세요 | 안녕하세요 |
| 죄송합니다 | 죄송합니다 |

### 9.3 인식 UX

**자동 방식**으로 구현한다. STT 자막과 동일한 UX.

```
[수화 모드 ON] 토글 버튼
  → 핸드 트래킹 시작
  → 수어 동작 시 단어 단위 partial 자막 자동 표시
  → 동작 멈추면 AI가 문장화하여 final 자막 표시
  → 상대방 화면에도 동일하게 표시
```

### 9.4 아키텍처

```
Next.js (브라우저)
  → MediaPipe Hands (랜드마크 추출)
  → TF.js LSTM (단어 분류, 브라우저 내)
  → sign:partial WebSocket (단어 단위 자막)
  → POST /sign/compose (단어 축적 → AI 문장화)
  → sign:final WebSocket (확정 자막)

NestJS
  → Sign Gateway (sign:mode, sign:partial, sign:final 이벤트)
  → Sign Compose API (AI API 호출, SSE 스트리밍 응답)
  → DB 저장 (MessageEvent, type: sign_intent)
```

| 처리 | 위치 | 지연 |
|------|------|------|
| 랜드마크 추출 | 브라우저 (MediaPipe) | 실시간 |
| 단어 분류 | 브라우저 (TF.js) | ~0.3초 |
| 문장화 | 서버 (AI API) | ~1~2초 |

모델 학습 코드는 별도 레포지토리(signbridge-model)에서 관리한다.

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
