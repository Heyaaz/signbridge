# 핸드 트래킹 → 수어 실시간 번역 구현 계획

> SignBridge 확장 기능: 수화 모드를 켜면 실시간으로 수어가 자막으로 번역된다

---

## 1. 컨셉

STT와 동일한 구조다. 말하면 자막이 나오듯, 수화하면 자막이 나온다.

```
[STT 흐름]  비장애인이 말한다 → 자동으로 자막 표시
[수화 흐름]  청각 장애인이 수화한다 → 자동으로 자막 표시
```

### 사용자 경험

```
청각 장애인이 [수화 모드 ON] 버튼을 누른다
  → 핸드 트래킹 시작 (손 랜드마크가 화면에 표시)
  → 수화를 한다
  → 실시간으로 인식된 단어가 자막 영역에 나타난다
  → 상대방 화면에도 자막이 표시된다
  → STT 자막과 동일한 위치, 동일한 UX
  → [수화 모드 OFF] 누르면 종료
```

확인/전송 버튼 없음. 자막처럼 자연스럽게 흘러간다.

---

## 2. 왜 가능한가 / 한계는 뭔가

| 구분 | 현실 |
|------|------|
| 핸드 트래킹 (랜드마크 추출) | 실시간 가능 (30fps, MediaPipe) |
| 단어 단위 인식 (5~10개) | 가능. 정확도 80~95%, 지연 0.3~1초 |
| 문장 단위 연속 인식 | 연구 단계. MVP 범위 밖 |
| 한국 수어 (KSL) 데이터 | 공개 데이터셋 부족. 자체 수집 필요 |

MVP에서는 **5~10개 핵심 단어를 실시간으로 인식**한다. 연속 문장 번역은 범위 밖.

---

## 3. 전체 아키텍처

STT와 대칭 구조로 설계한다.

```
┌─ STT 흐름 (비장애인 → 청각 장애인) ─────────────────┐
│                                                       │
│  마이크 → 오디오 chunk → NestJS → STT API → 자막      │
│                                                       │
└───────────────────────────────────────────────────────┘

┌─ 수화 흐름 (청각 장애인 → 비장애인) ─────────────────┐
│                                                       │
│  카메라 → MediaPipe Hands → 랜드마크 → 분류 모델       │
│    → 인식 결과 → WebSocket → 상대방 자막               │
│                                                       │
│  * 분류 모델은 브라우저에서 실행 (TF.js)                │
│  * 서버 왕복 없이 바로 인식 → 최소 지연                 │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 왜 브라우저 내 추론인가

| 항목 | 서버 추론 (Python) | 브라우저 추론 (TF.js) |
|------|---------------------|----------------------|
| 지연 | 네트워크 왕복 100~300ms | 즉시 (~50ms) |
| 인프라 | FastAPI 서버 필요 | 불필요 |
| 실시간 느낌 | 약간 끊김 | 자연스러움 |

5~10개 단어 모델은 < 5MB로 브라우저에서 충분히 돌아간다. 실시간 자막 경험을 위해 **브라우저 내 추론(TF.js)을 기본으로** 한다.

---

## 4. 실시간 인식 파이프라인

```
[수화 모드 ON]
    ↓
MediaPipe Hands (매 프레임)
    ↓
랜드마크 → Ring Buffer (최근 30프레임 유지)
    ↓
매 10프레임마다 슬라이딩 윈도우 분류 (TF.js)
    ↓
┌─ idle (수화 아님) → 무시
│
└─ 수어 감지 (confidence ≥ 0.7)
    ↓
  partial 자막 표시 (내 화면 + 상대방 화면)
    ↓
  같은 단어 3회 연속 인식 → final 자막 확정
    ↓
  쿨다운 (1.5초) → 다음 수어 대기
```

### STT와의 대칭

| | STT (음성 → 자막) | 수화 (수어 → 자막) |
|---|---|---|
| 입력 | 마이크 오디오 | 카메라 랜드마크 |
| 처리 | STT API (서버) | TF.js 분류 모델 (브라우저) |
| partial | 중간 자막 (바뀔 수 있음) | 인식 중인 단어 (바뀔 수 있음) |
| final | 확정 자막 | 3회 연속 인식으로 확정 |
| 이벤트 | `caption:partial` / `caption:final` | `sign:partial` / `sign:final` |
| 표시 | 자막 영역 | 동일한 자막 영역 |

---

## 5. 구현 단계

### Phase 1: 핸드 트래킹 + 시각화

**목표**: 수화 모드 ON 시 카메라 영상에서 손 랜드마크를 실시간 추출하여 표시

**작업 목록**

- [ ] MediaPipe Hands 패키지 설치 (`@mediapipe/hands`, `@mediapipe/camera_utils`, `@mediapipe/drawing_utils`)
- [ ] `useHandTracking` 커스텀 hook 생성
  - 수화 모드 ON/OFF 상태 관리
  - localVideoRef에서 비디오 스트림 연결
  - MediaPipe Hands 인스턴스 초기화/정리
  - 프레임별 랜드마크 콜백
  - OFF 시 리소스 해제
- [ ] Canvas 오버레이 컴포넌트
  - 비디오 위에 손 랜드마크 + skeleton 렌더링
  - 수화 모드 OFF면 숨김
- [ ] [수화 모드] 토글 버튼
  - 기존 컨트롤 바(마이크/카메라 옆)에 배치
  - ON/OFF 상태 시각적 표시

**코드 구조**

```
frontend/src/
  hooks/
    use-hand-tracking.ts        # MediaPipe Hands + 모드 관리
  components/
    hand-tracking/
      hand-overlay.tsx          # Canvas 오버레이
      sign-mode-button.tsx      # 수화 모드 토글 버튼
```

**성능 기준**

| 항목 | 목표 |
|------|------|
| FPS | 15fps+ (모바일), 25fps+ (데스크톱) |
| WebRTC 동시 실행 | 안정적 |
| 모드 전환 | ON/OFF 즉시 반응 |

---

### Phase 2: 실시간 분류 파이프라인

**목표**: 랜드마크 스트림을 실시간으로 분류하여 자막처럼 표시

**작업 목록**

- [ ] Ring Buffer 구현
  - 최근 30프레임 랜드마크 유지
  - 프레임별 타임스탬프 기록
- [ ] 랜드마크 전처리
  - 손목 기준 좌표 정규화 (위치 불변)
  - 손 크기 정규화 (스케일 불변)
  - 고정 길이 시퀀스 (패딩/트리밍)
- [ ] TF.js 분류 모델 로드 및 추론
  - 모델 파일 로드 (public 디렉토리)
  - 슬라이딩 윈도우: 매 10프레임마다 추론 실행
  - idle 클래스로 비수어 동작 필터링
  - 움직임 임계값: 손이 정지 상태면 추론 스킵
- [ ] partial / final 로직
  - 인식된 단어 → `sign:partial` 이벤트 (자막 영역에 표시)
  - 같은 단어 3회 연속 → `sign:final` 이벤트 (확정)
  - 쿨다운 1.5초 후 다음 수어 대기
- [ ] 자막 영역 통합
  - STT 자막과 같은 영역에 표시
  - 수화 자막 구분 표시 (아이콘 또는 색상)
  - 예: 🤟 "감사합니다" (수화) vs 🎤 "네 알겠습니다" (음성)

**데이터 형식**

```typescript
// 프레임 단위 랜드마크
interface LandmarkFrame {
  timestamp: number;
  leftHand: { x: number; y: number; z: number }[] | null;   // 21 포인트
  rightHand: { x: number; y: number; z: number }[] | null;  // 21 포인트
}

// 인식 결과 (WebSocket 전송)
interface SignCaptionEvent {
  roomId: string;
  sessionId: string;
  content: string;       // 인식된 단어
  confidence: number;    // 신뢰도
  isFinal: boolean;      // partial / final
}
```

---

### Phase 3: 수어 분류 모델 학습

**목표**: 5~10개 한국 수어 단어 + idle 클래스를 분류하는 경량 모델

**작업 목록**

- [ ] 학습 데이터 수집 도구
  - 웹 기반 데이터 수집 페이지 (MediaPipe + 녹화)
  - 단어 선택 → 수어 동작 → 랜드마크 자동 저장
  - 단어당 최소 50~100개 샘플
- [ ] idle 클래스 데이터 수집
  - 일상적인 손 동작 (머리 만지기, 턱 괴기 등)
  - 가만히 있기, 손 흔들기 등
  - 수어로 오인식되면 안 되는 동작들
- [ ] 데이터 증강
  - 노이즈 추가
  - 속도 변형 (0.8x ~ 1.2x)
  - 좌우 반전
  - 좌표 미세 이동
- [ ] 모델 학습
  - 아키텍처: LSTM (MVP) → 데이터 많아지면 1D-CNN + LSTM
  - 입력: (30, 42×3) — 30프레임, 양손 42포인트, xyz
  - 출력: 11개 클래스 (10개 수어 + idle)
  - Train/Val/Test: 70/15/15
- [ ] TF.js 변환
  - PyTorch → ONNX → TF.js 또는
  - TensorFlow → TF.js 직접 변환
  - 모델 크기 < 5MB 목표
- [ ] 정확도 기준
  - 수어 클래스 정확도: ≥ 85%
  - idle 클래스 재현율: ≥ 95% (오인식 최소화)

**프로젝트 분리**

모델 학습은 메인 프로젝트와 **별도 레포지토리**로 관리한다.

```
# 메인 프로젝트 (signbridge)
signbridge/
  frontend/                 # Next.js
  backend/                  # NestJS
  docs/

# 별도 레포 (signbridge-model)
signbridge-model/
  collect/
    collect_landmarks.py    # 웹캠 랜드마크 수집
  data/
    raw/                    # 수집된 랜드마크 JSON (.gitignore)
    processed/              # 전처리된 학습 데이터 (.gitignore)
  models/
    train.py                # LSTM 학습
    evaluate.py             # 평가
    export_tfjs.py          # TF.js 변환
  output/
    tfjs_model/             # 변환된 모델 (.gitignore)
  requirements.txt
  README.md
```

**왜 분리하는가**

| 문제 | 설명 |
|------|------|
| Python 의존성 무거움 | PyTorch 2GB+, OpenCV, MediaPipe 등 |
| 배포 시 불필요 | 학습 코드는 프로덕션에 포함되면 안 됨 |
| git 히스토리 오염 | 모델 파일(.pt, .onnx), 학습 데이터가 커밋되면 repo 크기 폭증 |
| CI/CD 충돌 | Node.js 프로젝트에 Python 린팅/테스트 혼재 |

**연결 포인트는 딱 하나**

```
signbridge-model 에서 학습 완료
  → output/tfjs_model/model.json + weights
  → signbridge/frontend/public/models/ 에 복사
  → 브라우저에서 tf.loadGraphModel('/models/model.json')
```

---

### Phase 4: WebSocket 연동 + 자막 통합

**목표**: 인식된 수어를 STT 자막과 동일한 흐름으로 상대방에게 전달

**작업 목록**

- [ ] WebSocket 이벤트 추가 (NestJS)
  - `sign:partial` — 중간 인식 결과 브로드캐스트
  - `sign:final` — 확정 인식 결과 브로드캐스트 + DB 저장
- [ ] 자막 UI 통합
  - STT 자막과 수화 자막을 동일한 자막 패널에 표시
  - 소스 구분: 음성(🎤) / 수화(🤟)
  - 시간순 정렬
- [ ] (선택) 수화 자막 → TTS
  - 인식된 수어 텍스트를 TTS로 음성 변환
  - 비장애인에게 음성으로도 전달
- [ ] 수화 모드 상태 공유
  - 상대방에게 "수화 모드 켜짐" 알림
  - 상대방 화면에 수화 인식 중 표시

**전체 데이터 흐름**

```
[청각 장애인 브라우저]
  카메라 → MediaPipe → 랜드마크 → TF.js 분류
    → "감사합니다" (partial, 87%)
    → sign:partial 이벤트 → WebSocket → NestJS

[NestJS]
  → 상대방에게 sign:partial 브로드캐스트

[비장애인 브라우저]
  → 자막 영역: 🤟 감사합니다... (인식 중)

[청각 장애인 브라우저]
  → 3회 연속 인식 → "감사합니다" (final, 92%)
  → sign:final 이벤트 → WebSocket → NestJS

[NestJS]
  → DB 저장 (CaptionEvent, source: 'sign')
  → 상대방에게 sign:final 브로드캐스트

[비장애인 브라우저]
  → 자막 영역: 🤟 감사합니다 (확정)
  → (선택) TTS 재생
```

---

## 6. WebSocket 이벤트

### Client → Server

| 이벤트 | 설명 |
|--------|------|
| `sign:mode` | 수화 모드 ON/OFF 상태 변경 |
| `sign:partial` | 중간 인식 결과 (partial 자막) |
| `sign:final` | 확정 인식 결과 (final 자막) |

### Server → Client

| 이벤트 | 설명 |
|--------|------|
| `sign:mode-changed` | 상대방 수화 모드 상태 알림 |
| `sign:partial` | 중간 인식 자막 전달 |
| `sign:final` | 확정 인식 자막 전달 |

---

## 7. MVP 인식 대상 수어 (5~10개 + idle)

| 클래스 | 출력 텍스트 | 비고 |
|--------|-------------|------|
| idle | (표시 안 함) | 수어가 아닌 일반 동작 |
| 네 | 네 | |
| 아니요 | 아니요 | |
| 감사합니다 | 감사합니다 | |
| 잠시만요 | 잠시만 기다려 주세요 | |
| 다시 | 다시 말씀해 주세요 | |
| 도움 | 도움이 필요합니다 | |
| 괜찮아요 | 괜찮습니다 | |
| 모르겠어요 | 잘 모르겠습니다 | |
| 안녕하세요 | 안녕하세요 | |
| 죄송합니다 | 죄송합니다 | |

---

## 8. 기술 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| MediaPipe + WebRTC + TF.js 동시 실행 성능 | 트래킹 15fps 제한, 추론 주기 조절 (매 10프레임) |
| idle 오인식 (일반 동작을 수어로 인식) | idle 학습 데이터 충분히 확보, confidence threshold 조절 |
| 한국 수어 학습 데이터 부족 | 자체 수집 도구 만들어서 팀 내 수집, 데이터 증강 |
| 사용자별 수어 동작 차이 | 좌표 정규화, 다양한 사람 데이터 수집 |
| 모바일 성능 | 모바일에서는 추론 주기 낮추기 (매 15프레임) |

---

## 9. 개발 순서

| 순서 | Phase | 핵심 결과물 |
|------|-------|------------|
| 1 | Phase 1: 핸드 트래킹 | 수화 모드 버튼 + 손 랜드마크 시각화 |
| 2 | Phase 3: 모델 학습 | 데이터 수집 + LSTM 모델 + TF.js 변환 |
| 3 | Phase 2: 실시간 분류 | 슬라이딩 윈도우 + partial/final 자막 |
| 4 | Phase 4: 연동 | WebSocket + 자막 통합 + (선택) TTS |

> Phase 3(모델)을 Phase 2보다 먼저 하는 이유: 분류 모델이 있어야 실시간 파이프라인을 테스트할 수 있다.
> Phase 1은 모델 없이 독립적으로 바로 시작 가능.

---

## 10. 시작하기

Phase 1부터 바로 시작할 수 있다:

1. MediaPipe Hands 설치
2. `useHandTracking` hook 구현
3. 수화 모드 버튼 추가
4. 손 랜드마크가 화면에 잘 그려지는지 확인
5. WebRTC + 핸드 트래킹 동시 실행 성능 확인
