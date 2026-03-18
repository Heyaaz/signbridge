# Implementation Checklist

> 기준일: 2026-03-18
> 범위: 데이터셋 / 모델 학습 제외

---

## 1. 현재 상태 요약

- 구현 완료와 검증 완료는 다르다.
- 이 문서는 다음 4가지 상태를 구분한다.

### 상태 정의

- `[x]` 구현 및 검증 완료
- `[-]` 구현 완료, 브라우저 또는 수동 확인 필요
- `[ ]` 아직 미구현

---

## 2. 코어 플로우

### 방 / 세션 / 룸 진입

- [x] 랜딩 페이지에서 닉네임과 역할 선택
- [x] 방 생성 API
- [x] 초대 코드 조회 API
- [x] 방 입장 API
- [x] 세션 토큰 발급
- [x] `sessionStorage`에 세션 저장
- [x] 룸 정보 조회 API
- [x] 참가자 목록 렌더링

### 실시간 연결

- [x] Socket.IO 연결
- [x] `room:join` 처리
- [x] `room:user-joined` 브로드캐스트
- [x] `room:user-left` 브로드캐스트
- [x] WebRTC offer relay
- [x] WebRTC answer relay
- [x] WebRTC ICE candidate relay
- [-] 실제 브라우저 2개에서 영상/음성 스트림 연결 최종 확인
- [ ] TURN 서버 연동
- [ ] 외부망 / 모바일 환경 안정성 확인

### 텍스트 메시지 / 빠른 응답

- [x] 텍스트 메시지 전송
- [x] 빠른 응답 전송
- [x] `message:received` 브로드캐스트
- [x] `MessageEvent` DB 저장
- [-] 실제 브라우저 UI에서 송수신 UX 최종 확인

---

## 3. STT / 자막

### 현재 완료된 범위

- [x] `caption:partial` 소켓 이벤트 처리
- [x] `caption:final` 소켓 이벤트 처리
- [x] `caption:final` DB 저장
- [x] 자막 이벤트 브로드캐스트
- [x] 프론트에 브라우저 STT 훅 연결
- [x] 자막 패널에 음성 자막 반영
- [x] 서버 기준 partial / final end-to-end 검증

### 아직 남은 범위

- [-] 실제 브라우저에서 Web Speech API가 마이크 입력을 인식하는지 확인
- [-] Chrome 계열 브라우저에서 한국어 인식 품질 확인
- [ ] 브라우저 STT 미지원 환경 fallback 정책 정리
- [ ] 서버 STT provider 연동
- [ ] 오디오 chunk 업로드 기반 STT 경로
- [ ] `CaptionEvent` 히스토리 조회 API 필요 여부 결정

---

## 4. TTS / 음성 응답

### 현재 완료된 범위

- [x] `/tts` API 실제 응답 계약 정의
- [x] 브라우저 fallback TTS 응답
- [x] 프론트에서 `/tts` 호출 후 재생 분기 처리
- [x] 메시지 수신 시 TTS 재생 경로 연결
- [x] 서버 기준 `/tts` 응답 검증

### 아직 남은 범위

- [-] 실제 브라우저에서 `speechSynthesis` 음성 재생 확인
- [-] OS/브라우저별 음성 선택 및 발화 안정성 확인
- [ ] OpenAI TTS provider 실환경 검증
- [ ] 서버 생성 오디오 `dataUrl` 재생 브라우저 검증
- [ ] TTS 실패 시 UI fallback 문구 / 상태 처리 보강

---

## 5. 수화 모드

### 현재 완료된 범위

- [x] 수화 모드 토글 버튼
- [x] 손 랜드마크 오버레이
- [x] `sign:mode` / `sign:partial` / `sign:final` 이벤트 골격
- [x] TF.js 분류기 훅 초안
- [x] 링 버퍼 / 랜드마크 전처리 유틸

### 아직 남은 범위

- [ ] `useSignClassifier`를 통화 화면에 실제 연결
- [ ] 분류 결과를 소켓 이벤트로 emit
- [ ] 수화 final 결과 DB 저장
- [ ] 실제 모델 파일 배치
- [ ] 자막 영역과 수화 partial / final UX 정리
- [ ] 실제 브라우저에서 수화 모드 end-to-end 검증

---

## 6. 통화 종료 / 로그 / 상태 관리

- [x] `call:end` 이벤트 처리
- [x] 참가자 이탈 시 room 상태 갱신
- [x] room 상태 `waiting / active / ended` 전환
- [ ] `CallLog` 저장
- [ ] 통화 시간 집계
- [ ] 자막 수 / 메시지 수 집계
- [ ] 재접속 시나리오 검증

---

## 7. 운영 안정화

- [x] Prisma 스키마 및 migration 존재
- [x] 헬스 체크 API
- [x] 백엔드 빌드 통과
- [x] 프론트 타입 체크 통과
- [x] 프론트 프로덕션 빌드 통과
- [ ] DTO validation 적용
- [ ] 예외 응답 형식 정리
- [ ] 환경 변수 validation
- [ ] 통합 테스트
- [ ] E2E 테스트

---

## 8. 이번 턴에서 실제 검증한 항목

- [x] `GET /health`
- [x] `POST /rooms`
- [x] `POST /rooms/:roomId/join`
- [x] `GET /rooms/:roomId`
- [x] `GET /quick-replies`
- [x] `POST /tts`
- [x] Socket.IO `room:join`
- [x] Socket.IO `message:text`
- [x] Socket.IO `caption:partial`
- [x] Socket.IO `caption:final`
- [x] `MessageEvent` DB 저장 확인
- [x] `CaptionEvent` DB 저장 확인

---

## 9. 다음 우선순위

### Priority 1

- [ ] 실제 브라우저 2개에서 영상 / STT / TTS 수동 검증

### Priority 2

- [ ] 서버 STT provider 연동

### Priority 3

- [ ] `CallLog` 저장

### Priority 4

- [ ] TURN 서버 연동

### Priority 5

- [ ] DTO validation / 테스트 / 운영 안정화
