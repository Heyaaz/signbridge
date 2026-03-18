# SignBridge 수어 인식 모델 학습

## 환경 설정

```bash
cd training
pip install -r requirements.txt
```

---

## 워크플로우

### 1단계: 데이터 수집

웹캠으로 수어 랜드마크를 수집합니다.

```bash
cd collect
python collect_landmarks.py --label "감사합니다" --samples 100
```

- 스페이스바: 녹화 시작 / 정지
- q: 종료
- 수집된 데이터는 `data/raw/{label}/{timestamp}.json` 에 저장됩니다.
- 각 샘플은 30프레임의 양손 랜드마크 시퀀스입니다.

지원 레이블 예시:
```
감사합니다, 안녕하세요, 죄송합니다, 도와주세요, 이름, 만나서반가워요, 괜찮아요, 좋아요, 싫어요, 몰라요
```

---

### 2단계: 모델 학습

수집한 데이터로 LSTM 모델을 학습합니다.

```bash
cd models
python train.py
```

- 입력 데이터: `data/processed/`
- 학습된 모델 저장: `output/model.pt`
- Train / Val = 85% / 15% 분리

---

### 3단계: 모델 평가

```bash
cd models
python evaluate.py
```

- 혼동 행렬 및 클래스별 정확도를 출력합니다.

---

### 4단계: TF.js 변환

프론트엔드에서 사용할 수 있도록 모델을 변환합니다.

```bash
cd models
python export_tfjs.py
```

- 변환 결과: `output/tfjs_model/model.json` + 가중치 파일
- 변환 후 모델 파일 크기가 출력됩니다.

---

## 디렉토리 구조

```
training/
  collect/
    collect_landmarks.py    # 랜드마크 수집 스크립트
  data/
    raw/                    # 수집된 원시 JSON 데이터
    processed/              # 학습용 전처리 데이터 (npy)
  models/
    train.py                # LSTM 모델 정의 + 학습
    evaluate.py             # 모델 평가
    export_tfjs.py          # TF.js 변환
  output/                   # 학습된 모델 및 변환 결과
  requirements.txt
```
