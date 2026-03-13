# SignBridge Workflow

## 문서 목적

현재 구현 기준 사용자 흐름, 서버 흐름, 실시간 연결 흐름 정리

## 1. 사용자 시작 흐름

### 방 생성

1. 랜딩 페이지 접속
2. 닉네임 입력
3. 역할 선택
4. `POST /rooms` 호출
5. 서버에서 `Room`, `UserSession`, `RoomParticipant` 생성
6. 응답으로 `roomId`, `inviteCode`, `sessionToken`, `sessionId` 반환
7. 프론트에서 세션 정보를 `sessionStorage`에 저장
8. `/room/{roomId}` 이동

### 방 입장

1. 랜딩 페이지 접속
2. 닉네임 입력
3. 역할 선택
4. `roomId` 직접 입력 또는 초대 코드 입력
5. 초대 코드 입력 시 `GET /rooms/invite/:inviteCode` 호출
6. `POST /rooms/:roomId/join` 호출
7. 서버에서 `UserSession`, `RoomParticipant` 생성
8. 참가자 2명 충족 시 `Room.status`를 `active`로 변경
9. 응답으로 `roomId`, `inviteCode`, `sessionToken`, `sessionId` 반환
10. 프론트에서 세션 정보를 `sessionStorage`에 저장
11. `/room/{roomId}` 이동

## 2. 룸 화면 진입 흐름

1. `/room/{roomId}` 접속
2. 프론트에서 `sessionStorage` 기준 세션 조회
3. 세션 정보 없으면 랜딩 복귀 유도
4. `GET /rooms/:roomId` 호출
5. `GET /quick-replies` 호출
6. 룸 상태, 참가자 목록, 빠른 응답 목록 렌더
7. Socket.IO 연결 시작
8. 브라우저 카메라/마이크 권한 요청
9. 로컬 비디오 미리보기 연결

## 3. 실시간 연결 흐름

### Socket 입장

1. 소켓 연결 성공
2. `room:join` 이벤트 전송
3. 서버에서 `sessionToken` 검증
4. 해당 세션이 실제 참가자인지 확인
5. 소켓을 해당 room에 join
6. 참가자 연결 상태를 `connected`로 갱신
7. 상대방에게 `room:user-joined` 브로드캐스트

### WebRTC 연결

1. 참가자 2명 이상 확인
2. 첫 참가자 기준 offer 생성
3. `webrtc:offer` 전송
4. 상대방에서 offer 수신 후 answer 생성
5. `webrtc:answer` 전송
6. 양쪽에서 `webrtc:ice-candidate` 교환
7. P2P 연결 수립
8. 원격 비디오 스트림 렌더

## 4. 텍스트 메시지 흐름

1. 룸 화면 텍스트 입력
2. `message:text` 이벤트 전송
3. 서버에서 `MessageEvent` 저장
4. room 전체에 `message:received` 브로드캐스트
5. 프론트에서 메시지 피드 반영
6. 상대방 브라우저 기준 `speechSynthesis` fallback 재생

## 5. 빠른 응답 흐름

1. 빠른 응답 버튼 클릭
2. `message:quick-reply` 이벤트 전송
3. 서버에서 `MessageEvent` 저장
4. room 전체에 `message:received` 브로드캐스트
5. 프론트에서 메시지 피드 반영
6. 상대방 브라우저 기준 `speechSynthesis` fallback 재생

## 6. 종료 / 이탈 흐름

### 통화 종료 버튼

1. `call:end` 이벤트 전송
2. 서버에서 참가자 `leftAt`, `connectionState` 갱신
3. 남은 참가자 수 기준 room 상태 갱신
4. room 전체에 `call:ended` 브로드캐스트
5. 프론트에서 room 상태 `ended` 반영

### 소켓 끊김

1. 브라우저 종료 또는 새로고침
2. 서버에서 참가자 상태만 `disconnected`로 갱신
3. room 전체에 `room:user-left` 브로드캐스트
4. 세션 자체 삭제 없음
5. 같은 세션 기준 재접속 가능 상태 유지

## 7. 서버 저장 데이터

### 현재 저장

- `Room`
- `UserSession`
- `RoomParticipant`
- `MessageEvent`

### 아직 미연결

- `CaptionEvent`
- `CallLog`
- 외부 STT provider
- 외부 TTS provider

## 8. 현재 구현 범위

### 연결된 범위

- 방 생성 / 방 입장 / 방 조회
- invite code 조회
- quick reply 조회
- 소켓 room join
- WebRTC offer / answer / ice candidate relay
- 텍스트 메시지 저장 및 브로드캐스트
- 빠른 응답 저장 및 브로드캐스트
- 브라우저 `speechSynthesis` fallback

### 비어 있는 범위

- 음성 chunk 업로드
- STT partial / final 처리
- 서버 TTS 오디오 생성
- `tts:ready` 이벤트
- caption 로그 저장
- call log 저장
- TURN 서버 연동

## 9. 다음 작업 우선순위

1. `caption:chunk` 수신 경로 추가
2. STT provider adapter 연결
3. `caption:partial`, `caption:final` 브로드캐스트
4. `CaptionEvent` 저장
5. `POST /tts` 실제 오디오 생성
6. `tts:ready` 이벤트 연결
7. `CallLog` 집계 저장
