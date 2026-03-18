# AI Hub 수어 데이터셋 활용 계획

## 1. 데이터셋 개요

- **출처**: AI Hub 수어 영상 데이터셋 (dataSetSn=103)
- **총 클립 수**: 536,000 클립
  - 수어단어: 3,000개
  - 수어문장: 2,000개
  - 지숫자/지문자: 1,000개
- **촬영 환경**: 스튜디오 촬영, 20명 언어제공자, 5각도 동시 촬영
  - F = 정면, D = 아래, L = 왼쪽, R = 오른쪽, U = 위
- **라벨링 데이터**: 프레임별 키포인트 JSON
  - 손 21개 포인트 × 양손 (2D/3D 좌표)
  - 몸 25개 포인트, 얼굴 70개 포인트
- **원천 데이터**: MP4 영상 (Full HD 1920×1080)

---

## 2. 데이터셋 선택 이유

| 항목 | 내용 |
|------|------|
| 직접 촬영 불가 | 수어를 모르기 때문 |
| 국립국어원 수어사전 | robots.txt 크롤링 차단 + CC BY-NC 변경금지 라이선스 (가공 불가) |
| AI Hub 선택 이유 | 키포인트가 이미 추출되어 있어 MediaPipe 없이 바로 학습 가능 |
| 규모 | 3,000개 단어 전체 학습 목표 (MVP 10개 제한 없음) |
| 접근 방식 | 오픈 API (aihubshell)로 필요한 파일만 선택 다운로드 가능 |

---

## 3. 단어 매핑 확인 결과 ✅ 완료

morpheme 파일(`01_real_word_morpheme.zip`, 110MB) 다운로드 및 분석 완료.

- **총 단어 수**: 3,000개 (WORD0001 ~ WORD3000)
- **구조**: 각 단어별 JSON에 수어 이름, 구간 정보(start/end), 영상 URL 포함

```json
{
  "metaData": { "name": "NIA_SL_WORD0001_REAL01_F.mp4", "duration": 4.867 },
  "data": [{ "start": 1.743, "end": 3.103, "attributes": [{ "name": "고민" }] }]
}
```

### MVP 관련 단어 포함 여부

| 단어 | WORD ID | 포함 여부 |
|------|---------|----------|
| 감사 | WORD1290 | ✅ |
| 죄송 | WORD1201 | ✅ |
| 괜찮다 | WORD1381 | ✅ |
| 모르다 | WORD1096, WORD2485 | ✅ |
| 이해 | WORD1207 | ✅ |
| 병원 | WORD1496 | ✅ |
| 네 / 아니요 / 도움 / 잠시만요 | — | ❌ (데이터셋에 없음) |

> 데이터셋은 전문 어휘 중심 구성. "네", "아니요" 같은 기본 단어는 포함되지 않음.
> 전략: 3,000개 전체를 학습시키고, 프론트엔드에서 인식 결과를 그대로 자막으로 표시.

---

## 4. 다운로드 전략

전체 2.63TB 중 키포인트 + morpheme만 선택 다운로드.

### 필수 파일 (약 197GB)

| 구분 | 파일 | 용량 | filekey |
|------|------|------|---------|
| Training WORD keypoint | 01~16_real_word_keypoint.zip | ~176GB | 39600, 39602~39616 |
| Training WORD morpheme | 01_real_word_morpheme.zip | 110MB | 39601 ✅ 완료 |
| Validation WORD keypoint | 09_real_word_keypoint.zip | 20.7GB | 39479 |
| Validation WORD morpheme | 01_real_word_morpheme.zip | 13.8MB | 39478 |

### 제외 항목

| 항목 | 이유 | 절약 용량 |
|------|------|----------|
| 원천데이터 (MP4) | 키포인트 있으므로 불필요 | ~1.5TB |
| SEN (문장) | 단어 인식이 목표 | ~250GB |
| CROWD | 통제 안 된 환경 | ~60GB |
| SYN (합성) | 우선순위 낮음 | ~3GB |

---

## 5. 다운로드 방법 (aihubshell)

### 설치

```bash
curl -o ~/aihubshell https://api.aihub.or.kr/api/aihubshell.do
chmod +x ~/aihubshell
```

### 외장 SSD에 다운로드

외장 SSD를 연결한 후 해당 경로를 지정하여 다운로드.

```bash
# Training morpheme (이미 완료)
./aihubshell -mode d -datasetkey 103 -filekey 39601 -aihubapikey 'YOUR_KEY'

# Training word keypoint (01~16번, 순차 진행)
./aihubshell -mode d -datasetkey 103 -filekey 39600 -aihubapikey 'YOUR_KEY'
./aihubshell -mode d -datasetkey 103 -filekey 39602 -aihubapikey 'YOUR_KEY'
# ... 39603 ~ 39616

# Validation word keypoint
./aihubshell -mode d -datasetkey 103 -filekey 39479 -aihubapikey 'YOUR_KEY'
```

---

## 6. 학습 환경

### 확정된 환경

| 항목 | 내용 |
|------|------|
| 학습 데이터 저장 | 외장 SSD (~197GB) |
| 전처리 결과 저장 | Google Drive 2TB (numpy 배열 ~10~20GB) |
| 학습 환경 | Google Colab T4 GPU (Google AI Pro에 포함) |
| 예상 학습 시간 | T4 GPU 기준 6~8시간 |
| 로컬 머신 | M1 MacBook Air (발열 문제로 학습에 사용 안 함) |

### 왜 Colab인가

- M1 Air는 팬이 없어 장시간 학습 시 열 조절로 성능이 절반 이하로 떨어짐
- Google AI Pro ($19.99/월)에 Colab T4 GPU가 포함되어 추가 비용 없음
- Google Drive 2TB로 전처리 데이터 보관 가능

### 사용 가능한 GPU

| GPU | 학습 시간 | 비용 |
|-----|----------|------|
| T4 | 6~8시간 | 무료 (포함) |
| L4 | 3~5시간 | 추가 컴퓨팅 단위 필요 |
| A100 | 1~2시간 | 추가 컴퓨팅 단위 필요 |

> T4로 진행. 학습 시간은 충분히 감당 가능.

---

## 7. 전체 학습 파이프라인

```
[외장 SSD]
  197GB keypoint JSON 다운로드
      ↓
[맥북 - 전처리]
  convert_aihub.py 실행
  JSON → numpy 변환 + 정규화
  결과물: ~10~20GB .npy 파일
      ↓
[Google Drive 업로드]
  전처리된 numpy 파일만 업로드
      ↓
[Google Colab T4 GPU]
  Drive 마운트 → train.py 실행
  6~8시간 학습
  model.pt 저장
      ↓
[export_tfjs.py]
  PyTorch → ONNX → TF SavedModel → TF.js
  결과물: model.json + weights.bin (~5MB)
      ↓
[프로젝트 배포]
  frontend/public/models/sign/ 에 복사
  서버 배포 (model.json 5MB만 올라감)
  학습 데이터 197GB는 외장 SSD에서 삭제 가능
```

---

## 8. 배포 비용

수화 인식이 브라우저에서 실행되기 때문에 서버 비용이 거의 없음.

| 기능 | 처리 위치 | 서버 비용 |
|------|----------|----------|
| 수화 인식 (LSTM) | 브라우저 TF.js | **없음** |
| 핸드 트래킹 (MediaPipe) | 브라우저 | **없음** |
| model.json 파일 서빙 | CDN/정적 파일 | 거의 0 |
| WebRTC 시그널링 | NestJS | 매우 저렴 |
| AI 문장화 API | Claude/GPT | 호출당 과금 (수어 멈출 때만, 소량) |

---

## 9. 파이프라인 호환성

### 현재 파이프라인 (프론트엔드)

- **입력**: MediaPipe Hands 21포인트 × 양손 × xyz = 126값
- **전처리**: 손목 기준 좌표 정규화 + 스케일 정규화
- **모델**: SignLSTM (input_size=126, seq_len=30)

### AI Hub 데이터 특성

- **키포인트**: 손 21개 × 양손 × (x, y, z, confidence) → xyz만 추출 시 126값
- **프레임**: 30fps 프레임별 JSON, 샘플당 평균 ~140프레임
- **좌표계**: 절대 픽셀 좌표 → 정규화 필요

### 변환 시 처리사항

| 항목 | 처리 방법 |
|------|----------|
| 포맷 변환 | JSON → numpy (convert_aihub.py) |
| 차원 | xyz만 추출, confidence 제외 → 126값 |
| 정규화 | 손목(0번) 기준 이동 + 손목~중지MCP(9번) 거리 스케일 정규화 |
| 시퀀스 길이 | 가변 프레임 → 고정 30프레임 (균등 서브샘플링) |
| 라벨 | morpheme JSON에서 단어명 추출 → 정수 레이블 매핑 |
| num_classes | 11 → 3,001 (3,000단어 + idle) |

### idle 클래스 처리

AI Hub 데이터에 idle 클래스 없음. 다음 방법으로 생성:
- 단어 시퀀스의 앞뒤 여백 구간 (수어 동작 전후)
- 랜덤 노이즈 시퀀스

---

## 10. 앞으로 해야 할 일

| 단계 | 작업 | 상태 |
|------|------|------|
| Step 1 | morpheme 다운로드 + 단어 매핑 확인 | ✅ 완료 |
| Step 2 | 외장 SSD에 keypoint 데이터 다운로드 (~197GB) | ⏳ 대기 |
| Step 3 | convert_aihub.py 개발 (JSON → numpy 변환) | ⏳ 대기 |
| Step 4 | numpy 파일 Google Drive 업로드 | ⏳ 대기 |
| Step 5 | Colab T4 GPU에서 학습 (6~8시간) | ⏳ 대기 |
| Step 6 | TF.js 변환 + 프론트엔드 배치 | ⏳ 대기 |
| Step 7 | Phase 4 AI 문장화 API 구현 | ⏳ 대기 |
