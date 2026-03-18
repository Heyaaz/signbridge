# Implementation Status

> 기준일: 2026-03-18
> 범위: 데이터셋 다운로드 / 모델 학습 제외

---

## 1. 문서 목적

이 문서는 SignBridge의 **현재 실제 구현 상태**와 **남은 구현 작업**을 정리한다.

기획 문서(PRD), 기술 설계 문서(TECH_SPEC), 워크플로우 문서를 그대로 반복하지 않고,
현재 코드 기준으로 무엇이 연결되어 있고 무엇이 아직 비어 있는지에 초점을 맞춘다.

---

## 2. 현재 구현된 범위

### 2.1 방 / 세션 / 입장 흐름

- 랜딩 페이지에서 닉네임 + 역할 선택
- 방 생성
- 방 입장
- invite code 조회
- 세션 토큰 발급
- 세션 정보를 `sessionStorage`에 저장
- `/room/{roomId}` 이동

### 2.2 룸 조회 / 기본 UI

- 룸 정보 조회
- 참가자 목록 조회
- 빠른 응답 목록 조회
- 연결 상태 표시
- 통화 화면 레이아웃

### 2.3 실시간 연결

- Socket.IO 연결
- `room:join` 처리
- 참가자 입장 / 이탈 브로드캐스트
- WebRTC offer / answer / ICE candidate relay
- 1:1 P2P 영상 통화 연결

### 2.4 텍스트 응답

- 텍스트 메시지 전송
- 빠른 응답 전송
- `MessageEvent` 저장
- `message:received` 브로드캐스트
- 상대방 브라우저 `speechSynthesis` fallback 재생

### 2.5 DB / 서버 기본 골격

- Prisma 스키마 정의
- Room / UserSession / RoomParticipant / MessageEvent / CaptionEvent / CallLog 모델 존재
- PostgreSQL + Prisma migration 파일 존재
- NestJS 모듈 구조 구성

---

## 3. 부분 구현 상태

### 3.1 수화 모드 UI / 브로드캐스트 뼈대

다음 항목은 일부 구현되어 있지만 아직 end-to-end로 완성되지 않았다.

- 수화 모드 토글 버튼
- 로컬 비디오 위 손 랜드마크 오버레이
- `sign:mode`, `sign:partial`, `sign:final` WebSocket 이벤트 골격
- TF.js 기반 수화 분류 훅 초안
- 링 버퍼 / 랜드마크 전처리 유틸

현재 상태 요약:

- 손 추적 UI는 존재
- 수화 분류 훅도 존재
- 하지만 통화 화면에 분류 훅이 실제로 연결되어 있지 않음
- 모델 파일 배치 경로(`frontend/public/models/sign/`)도 아직 없음
- 확정 수화 결과 DB 저장도 미구현

### 3.2 TTS 골격

- `POST /tts` 엔드포인트 존재
- 서비스는 현재 skeleton 응답만 반환

### 3.3 Caption 모듈 골격

- `caption` 모듈 / gateway / service 파일 존재
- 실제 STT 처리 로직은 비어 있음

---

## 4. 아직 미구현인 핵심 작업

### 4.1 STT 자막

가장 큰 미구현 영역이다.

- 브라우저 오디오 chunk 수집
- `caption:chunk` 전송 경로
- 서버 STT provider 연동
- `caption:partial` 브로드캐스트
- `caption:final` 브로드캐스트
- `CaptionEvent` 저장

### 4.2 TTS 실제 생성

- 텍스트 입력을 실제 오디오로 변환
- 외부 TTS provider 연동
- 오디오 응답 포맷 정리
- 필요 시 `tts:ready` 이벤트 연결

### 4.3 통화 로그 저장

- `CallLog` 생성
- 통화 시간 집계
- 메시지 수 / 자막 수 집계
- 종료 사유 정리

### 4.4 수화 모드 실통합

데이터/학습 제외 기준으로도 남아 있는 작업이다.

- `useSignClassifier`를 실제 통화 화면에 연결
- 분류 결과를 `sign:partial`, `sign:final`로 emit
- 확정 결과 저장 경로 구현
- STT 자막과 같은 자막 UX로 정리

### 4.5 실전 WebRTC 안정화

- TURN 서버 연동
- NAT 환경 실패 fallback 점검
- 모바일 / 외부망 연결 안정화

### 4.6 운영 안정화

- DTO validation
- 예외 응답 형식 정리
- 최소 통합 테스트 / E2E 테스트
- 환경 변수 검증
- 재접속 / 종료 상태 전이 보강

---

## 5. 데이터 제외 기준 권장 우선순위

### Priority 1

- STT 자막 end-to-end 연결

### Priority 2

- TTS 실제 오디오 생성

### Priority 3

- `CallLog` 저장 및 종료 / 재접속 상태 정리

### Priority 4

- TURN 연동 및 실전 네트워크 안정화

### Priority 5

- 수화 모드 실통합

### Priority 6

- 테스트 / validation / 운영 안정화

---

## 6. 문서와 실제 코드의 차이

### 6.1 문서보다 실제 구현이 더 진행된 부분

- 루트 `README.md`에는 비즈니스 로직이 거의 없다고 적혀 있으나,
  실제로는 방 생성/입장, 세션, 메시지 저장, WebRTC signaling까지 구현되어 있다.

### 6.2 문서보다 실제 구현이 덜 진행된 부분

- 수화 관련 문서는 확장 계획이 자세하지만,
  현재 코드는 UI / 훅 / 소켓 이벤트 골격 수준이며 실제 완성 경로는 아니다.

### 6.3 문서와 코드가 대체로 일치하는 부분

- `WORKFLOW.md`에 적힌 현재 구현 범위와 큰 방향은 실제 코드와 거의 맞다.
- 특히 "연결된 범위"와 "비어 있는 범위" 구분이 현재 상태를 잘 반영한다.

---

## 7. 참고 문서

- `docs/PRD.md`
- `docs/TECH_SPEC.md`
- `docs/WORKFLOW.md`
- `docs/HAND_TRACKING_PLAN.md`

## 8. 참고 코드 경로

- `frontend/src/app/page.tsx`
- `frontend/src/components/call/call-layout.tsx`
- `frontend/src/hooks/use-socket.ts`
- `frontend/src/hooks/use-webrtc.ts`
- `frontend/src/hooks/use-hand-tracking.ts`
- `frontend/src/hooks/use-sign-classifier.ts`
- `backend/src/modules/room/room.service.ts`
- `backend/src/modules/signaling/signaling.gateway.ts`
- `backend/src/modules/sign/sign.gateway.ts`
- `backend/src/modules/caption/caption.gateway.ts`
- `backend/src/modules/tts/tts.service.ts`
- `backend/prisma/schema.prisma`
