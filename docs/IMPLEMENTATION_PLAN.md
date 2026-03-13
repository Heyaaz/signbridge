# SignBridge Implementation Plan

## 문서 목적

남아 있는 기능 구현 범위, 우선순위, 단계별 작업 계획 정리

## 현재 완료 상태

### 완료

- 방 생성 / 방 입장 / 방 조회
- invite code 조회
- quick reply 조회
- Socket.IO room join
- WebRTC 1:1 영상 연결
- 텍스트 메시지 저장 / 브로드캐스트
- 빠른 응답 저장 / 브로드캐스트
- Docker Compose 실행
- Prisma / PostgreSQL 연결

### 미완료

- STT 자막 파이프라인
- 서버 TTS 파이프라인
- 통화 로그 저장
- TURN 서버 연동
- 세션 / 초대 코드 운영 정책

## 우선순위

1. STT
2. TTS
3. CallLog
4. TURN / coturn
5. 세션 / 초대 코드 보강

## Phase 1. STT 구현 계획

### 목표

- 브라우저 음성을 서버로 전송
- partial / final 자막 표시
- final 자막 DB 저장

### 작업 항목

1. 프론트 오디오 캡처 경로 추가
2. `caption:chunk` 전송 훅 추가
3. 백엔드 `caption` gateway 이벤트 처리 추가
4. STT provider adapter 인터페이스 추가
5. provider별 요청 / 응답 포맷 분리
6. partial transcript 이벤트 브로드캐스트
7. final transcript 이벤트 브로드캐스트
8. `CaptionEvent` 저장
9. 자막 패널에서 partial / final 구분 렌더

### 필요 파일

- `frontend/src/hooks/use-captions.ts`
- `frontend/src/lib/socket.ts` 또는 기존 socket 훅
- `backend/src/modules/caption/*`
- `backend/src/modules/ai/*`

### 완료 기준

- 한 사용자가 말하면 상대 화면에 partial 자막 표시
- 확정 자막이 final 상태로 고정
- final 자막이 `CaptionEvent`에 저장

### 리스크

- chunk 크기와 전송 주기 조정 필요
- provider 응답 지연 편차 큼
- 브라우저 오디오 전처리 필요 가능성 있음

## Phase 2. TTS 구현 계획

### 목표

- 텍스트 입력을 서버 TTS로 변환
- 상대방 브라우저에서 생성 오디오 재생

### 작업 항목

1. `POST /tts` 요청 body 명세 확정
2. TTS provider adapter 인터페이스 추가
3. provider 오디오 생성 구현
4. blob / 임시 URL / base64 전달 방식 결정
5. `tts:ready` 이벤트 추가
6. 프론트에서 수신 오디오 재생
7. fallback `speechSynthesis` 사용 조건 정리
8. TTS 요청 이벤트 로그 저장

### 필요 파일

- `backend/src/modules/tts/*`
- `backend/src/modules/ai/*`
- `frontend/src/hooks/use-tts.ts`
- `frontend/src/components/chat/text-response-panel.tsx`

### 완료 기준

- 텍스트 입력 후 상대 브라우저에서 생성 오디오 재생
- provider 실패 시 fallback 동작

### 리스크

- 생성 속도 지연
- 브라우저 오디오 autoplay 정책
- 파일 저장 방식에 따른 비용 / 수명 관리

## Phase 3. CallLog 구현 계획

### 목표

- 통화 종료 시 기본 통계 저장

### 작업 항목

1. room 시작 시점 / 종료 시점 기준 정리
2. 메시지 수 집계
3. caption 수 집계
4. duration 계산
5. `call:end` 시 `CallLog` 저장
6. 비정상 종료 케이스 처리
7. 필요 시 `/rooms/:roomId/logs` 조회 API 추가

### 필요 파일

- `backend/src/modules/room/room.service.ts`
- `backend/src/modules/call-log/*`
- `backend/prisma/schema.prisma`

### 완료 기준

- 통화 1회 종료 후 `CallLog` 레코드 생성
- duration, captionCount, messageCount 값 저장

## Phase 4. TURN / coturn 계획

### 목표

- NAT 환경에서도 연결 성공률 확보

### 작업 항목

1. coturn 배포 방식 결정
2. TURN 계정 정책 결정
3. `RTCPeerConnection` ICE server 목록 확장
4. 환경 변수로 TURN 주소 / credential 주입
5. 연결 실패 fallback 시나리오 확인
6. Docker Compose 개발용 coturn 추가 여부 결정

### 필요 항목

- `docker-compose.yml`
- `.env.example`
- `frontend/src/hooks/use-webrtc.ts`

### 완료 기준

- STUN 실패 환경에서도 TURN relay 연결 확인

### 리스크

- 운영 비용
- credential 노출 방지
- 배포 환경별 네트워크 제약

## Phase 5. 세션 / 초대 코드 보강 계획

### 목표

- 익명 세션 구조 유지
- 최소한의 운영 안정성 확보

### 작업 항목

1. invite code 만료 시간 정의
2. session 만료 정책 추가
3. room 정원 / 재입장 정책 명확화
4. brute force 방지용 rate limit 추가
5. host / guest 권한 구분 필요 여부 결정
6. 초대 링크 복사 UI 추가
7. room 종료 후 세션 정리 정책 추가

### 완료 기준

- 초대 코드 남용 방지
- 오래된 세션 자동 정리
- 사용자가 초대 링크를 쉽게 공유 가능

## 추천 구현 순서

1. STT provider mock 버전 먼저 연결
2. STT 실제 provider 연결
3. TTS provider 연결
4. CallLog 저장
5. TURN 연동
6. 세션 / 초대 코드 보강

## 각 단계 테스트 계획

### STT

- 브라우저 2개에서 음성 입력
- partial / final 자막 순서 확인
- DB 저장 확인

### TTS

- 텍스트 입력 후 상대 브라우저 재생 확인
- fallback 재생 확인

### CallLog

- 통화 종료 후 DB 레코드 확인
- 비정상 종료 케이스 확인

### TURN

- 다른 네트워크 조건에서 연결 확인

### 세션 / 초대 코드

- 만료 처리
- 잘못된 코드 반복 입력
- 재입장 시나리오 확인
