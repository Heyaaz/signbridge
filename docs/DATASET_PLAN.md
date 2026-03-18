# AI Hub 수어 데이터셋 활용 계획

## 1. 데이터셋 개요

- **출처**: AI Hub 수어 영상 데이터셋 (dataSetSn=103)
- **총 클립 수**: 536,000 클립
  - 수어문장: 2,000개
  - 수어단어: 3,000개
  - 지숫자/지문자: 1,000개
- **촬영 환경**: 스튜디오 촬영, 20명 언어제공자, 5각도 동시 촬영
  - F = 정면, D = 아래, L = 왼쪽, R = 오른쪽, U = 위
- **라벨링 데이터**: 프레임별 키포인트 JSON
  - 손 21개 포인트 × 양손 (2D/3D 좌표)
  - 몸 25개 포인트
  - 얼굴 70개 포인트
- **원천 데이터**: MP4 영상 (Full HD 1920×1080)

---

## 2. 왜 이 데이터셋을 선택했는가

| 항목 | 내용 |
|------|------|
| 직접 촬영 | 수어를 모르기 때문에 직접 촬영 불가 |
| 국립국어원 한국수어사전 | robots.txt 크롤링 차단 + CC BY-NC 변경금지 라이선스로 가공 불가 |
| AI Hub 선택 이유 1 | 키포인트가 이미 추출되어 있어 MediaPipe 없이 바로 학습 가능 |
| AI Hub 선택 이유 2 | 3,000개 단어로 MVP 10개가 아닌 대규모 학습 가능 |
| AI Hub 선택 이유 3 | 오픈 API (aihubshell)로 필요한 파일만 선택 다운로드 가능 |

---

## 3. 샘플 데이터 분석 결과

### 샘플 위치
```
~/Downloads/New_sample/
```

### 디렉토리 구조
```
New_sample/
├── 원천데이터/REAL/WORD/01/          → MP4 영상
└── 라벨링데이터/REAL/WORD/01_real_word_keypoint/  → 프레임별 키포인트 JSON
```

### 샘플 내용
- 단어: WORD1501~WORD1520 (20개 단어)
- 제공자: 1명 (REAL01), 5각도 모두 포함
- 프레임 수: 약 140프레임/샘플

### 키포인트 JSON 구조
```json
{
  "version": "1.3",
  "people": [
    {
      "hand_left_keypoints_2d":  [x, y, confidence, ...],  // 21개 포인트
      "hand_right_keypoints_2d": [x, y, confidence, ...],  // 21개 포인트
      "hand_left_keypoints_3d":  [x, y, z, confidence, ...],  // 21개 포인트
      "hand_right_keypoints_3d": [x, y, z, confidence, ...],  // 21개 포인트
      "pose_keypoints_2d":       [x, y, confidence, ...],  // 25개 포인트
      "pose_keypoints_3d":       [x, y, z, confidence, ...],
      "face_keypoints_2d":       [x, y, confidence, ...],  // 70개 포인트
      "face_keypoints_3d":       [x, y, z, confidence, ...]
    }
  ],
  "camparam": {
    "intrinsics": [...],
    "distortion": [...]
  }
}
```

---

## 4. 다운로드 전략

전체 데이터셋 크기는 약 2.63TB이므로, 필요한 파일만 선택 다운로드한다.

### 필수 파일 (약 197GB)

**Training 라벨링데이터 REAL WORD**

| 파일 | 용량 | 비고 |
|------|------|------|
| 01_real_word_keypoint.zip ~ 16_real_word_keypoint.zip | 각 ~10~13GB, 총 ~176GB | 키포인트 학습 데이터 |
| 01_real_word_morpheme.zip | 110MB | 단어 번호 ↔ 수어 이름 매핑 |

**Validation 라벨링데이터 REAL WORD**

| 파일 | 용량 | 비고 |
|------|------|------|
| 09_real_word_keypoint.zip | 20.7GB | 검증용 키포인트 데이터 |
| 01_real_word_morpheme.zip | 13.8MB | 검증용 단어 매핑 |

### 제외 항목 (용량 절약)

| 항목 | 이유 |
|------|------|
| 원천데이터 (MP4 영상) | ~1.5TB, 키포인트가 있으므로 불필요 |
| SEN (문장) | 단어 인식이 목표이므로 제외 |
| CROWD | 통제되지 않은 환경으로 품질 불균일 |
| SYN (합성) | 보조용, 우선순위 낮음 |

---

## 5. 다운로드 방법 (aihubshell 오픈 API)

### API Key 발급

1. [aihub.or.kr](https://aihub.or.kr) 회원가입/로그인
2. 오픈 API 페이지에서 API key 발급 (이메일로 전송)

### aihubshell 설치

```bash
curl -o aihubshell https://api.aihub.or.kr/api/aihubshell.do
chmod +x aihubshell
```

### 다운로드 명령어

**morpheme 먼저 다운로드 (단어 매핑 확인용)**

```bash
# Training morpheme (filekey: 39601)
./aihubshell -mode d -datasetkey 103 -filekey 39601 -aihubapikey 'YOUR_KEY'

# Validation morpheme (filekey: 39478)
./aihubshell -mode d -datasetkey 103 -filekey 39478 -aihubapikey 'YOUR_KEY'
```

**이후 keypoint 순차 다운로드**

```bash
# Training word keypoint (filekey: 39600, 39602 ~ 39616)
./aihubshell -mode d -datasetkey 103 -filekey 39600 -aihubapikey 'YOUR_KEY'
./aihubshell -mode d -datasetkey 103 -filekey 39602 -aihubapikey 'YOUR_KEY'
./aihubshell -mode d -datasetkey 103 -filekey 39603 -aihubapikey 'YOUR_KEY'
# ... 39604 ~ 39616 순차 진행

# Validation word keypoint (filekey: 39479)
./aihubshell -mode d -datasetkey 103 -filekey 39479 -aihubapikey 'YOUR_KEY'
```

---

## 6. 우리 파이프라인과의 호환성

### 현재 파이프라인

- **입력**: MediaPipe Hands 랜드마크 21포인트 × 양손 × xyz = **126값**
- **전처리**: 손목 기준 좌표 정규화 + 스케일 정규화
- **모델**: SignLSTM (input_size=126, seq_len=30)

### AI Hub 데이터 특성

- **키포인트**: 손 21개 × 양손 × (x, y, z, confidence) = 168값 (xyz만 추출 시 126값)
- **프레임 제공 방식**: 30fps 프레임별 JSON
- **좌표계**: 절대 픽셀 좌표 (2D) 또는 카메라 좌표계 (3D)

### 변환 필요사항

| 항목 | 내용 |
|------|------|
| 포맷 변환 | AI Hub JSON → 학습용 numpy 포맷 변환 스크립트 필요 |
| 차원 축소 | 3D 좌표에서 xyz만 추출 (confidence 제외) → 126값 |
| 정규화 | 손목 기준 정규화 적용 (현재 `collect_landmarks.py`와 동일 방식) |
| 시퀀스 정렬 | 가변 프레임 → 고정 30프레임 (서브샘플링 또는 슬라이딩 윈도우) |
| 라벨링 | morpheme 데이터에서 단어 이름 추출하여 라벨 매핑 생성 |

---

## 7. 앞으로 해야 할 일 (순서대로)

### Step 1: 단어 매핑 확인

- morpheme 파일 다운로드 (110MB)
- WORD 번호 ↔ 수어 단어 이름 매핑 파악
- MVP 대상 단어(네, 아니요, 감사합니다 등)가 포함되어 있는지 확인
- 전체 3,000 단어 중 학습 대상 선정

### Step 2: 키포인트 데이터 다운로드

- aihubshell로 WORD keypoint zip 파일 순차 다운로드 (~197GB)
- 압축 해제 후 디렉토리 구조 확인

### Step 3: 데이터 변환 스크립트 개발

- 변환 스크립트 위치: `training/scripts/convert_aihub.py`
- AI Hub JSON → 학습용 포맷 변환
- 3D 손 키포인트 추출 → 정규화 → numpy 배열 저장
- 가변 프레임 → 고정 시퀀스 길이 변환 로직
- 라벨 매핑 생성

### Step 4: 학습 파이프라인 수정

- `train.py`를 AI Hub 데이터 포맷에 맞게 업데이트
- 3,000개 단어로 확장 시 모델 아키텍처 검토 (num_classes 증가)
- 데이터 로더 최적화 (대용량 데이터 처리)

### Step 5: 모델 학습 & 평가

- Train/Val/Test 분할 (AI Hub 자체 Train/Validation 활용)
- 학습 실행 + 하이퍼파라미터 튜닝
- 정확도 평가 (목표: 수어 클래스별 정확도 ≥ 85%)

### Step 6: TF.js 변환 & 프론트엔드 연동

- `export_tfjs.py`로 TF.js 변환 (이미 파이프라인 검증 완료)
- 배치 위치: `frontend/public/models/sign/`
- Phase 2 분류 파이프라인 (`use-sign-classifier.ts`)과 연동 테스트

### Step 7: Phase 4 AI 문장화 API 구현

- 엔드포인트: `POST /sign/compose` (NestJS)
- 기능: 단어 배열 → AI API → 자연스러운 문장 생성 (SSE 스트리밍)
- 전체 캡션 UI 통합

---

## 8. 기술 고려사항

### 10개 → 3,000개 단어 확장 시

| 항목 | 내용 |
|------|------|
| 모델 크기 | num_classes: 11 → 3,001 (idle 포함)로 증가 |
| 아키텍처 | hidden_size 증가 또는 모델 아키텍처 변경 검토 필요 |
| TF.js 용량 | 5MB 초과 가능 → 양자화 강화 또는 모델 경량화 필요 |
| 추론 속도 | 클래스 수 증가에 따른 softmax 부하는 미미한 수준 |

### idle 클래스 처리

- AI Hub 데이터에는 idle 클래스 없음
- 별도 수집 필요: 일상 손 동작 (비수어) 데이터
- 대안: 랜덤 노이즈 + 다른 단어 시퀀스의 일부를 idle로 활용

### 좌표계 차이 처리

| 항목 | AI Hub | MediaPipe (프론트엔드) |
|------|--------|----------------------|
| 좌표 방식 | 절대 좌표 (픽셀 또는 카메라 좌표계) | 정규화 좌표 (0~1) |
| 처리 방법 | 변환 스크립트에서 손목 기준 + 스케일 정규화 적용 | 동일 방식 적용으로 호환성 확보 |
