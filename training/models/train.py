"""
train.py

LSTM 기반 수어 분류 모델 정의 및 학습 스크립트.

입력 형태: (batch, 30, 126) — 30프레임, 양손 42포인트 × xyz
출력 클래스: 11개 (10개 수어 + idle)

사용법:
    python train.py

데이터:
    data/processed/ 디렉토리에 X.npy (샘플), y.npy (레이블), labels.json 이 있어야 한다.
    해당 파일이 없으면 data/raw/ 의 JSON을 자동으로 전처리한다.

결과:
    output/model.pt        — 학습된 PyTorch 모델 가중치
    output/labels.json     — 클래스 인덱스 ↔ 레이블 매핑
"""

import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

from model import SignLSTM

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR    = Path(__file__).resolve().parent
TRAINING_DIR  = SCRIPT_DIR.parent
DATA_RAW_DIR  = TRAINING_DIR / "data" / "raw"
DATA_PROC_DIR = TRAINING_DIR / "data" / "processed"
OUTPUT_DIR    = TRAINING_DIR / "output"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DATA_PROC_DIR.mkdir(parents=True, exist_ok=True)

# ── 하이퍼파라미터 ─────────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 30
INPUT_SIZE      = 126      # 양손 21포인트 × xyz × 2
HIDDEN_SIZE     = 128
NUM_LAYERS      = 2
DROPOUT         = 0.3
BATCH_SIZE      = 32
EPOCHS          = 60
LEARNING_RATE   = 1e-3
DEVICE          = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── 랜드마크 정규화 ────────────────────────────────────────────────────────────
def normalize_landmarks(hand_landmarks: list[dict]) -> list[dict] | None:
    """
    손 랜드마크를 손목 기준 좌표 + 스케일 정규화한다.

    - 위치 불변성: 손목(landmark 0)을 원점으로 모든 좌표에서 손목 좌표를 뺀다.
    - 크기 불변성: 손목 → 중지 MCP(landmark 9) 거리로 나눠 카메라 거리에 무관하게 만든다.

    반환: 정규화된 랜드마크 리스트. 스케일이 너무 작으면 None 반환.
    """
    if not hand_landmarks:
        return None

    wrist = hand_landmarks[0]       # landmark 0 = 손목
    middle_mcp = hand_landmarks[9]  # landmark 9 = 중지 MCP

    # 손목 → 중지 MCP 거리를 스케일 기준으로 사용
    scale = math.sqrt(
        (middle_mcp['x'] - wrist['x']) ** 2 +
        (middle_mcp['y'] - wrist['y']) ** 2 +
        (middle_mcp['z'] - wrist['z']) ** 2
    )

    # 스케일이 거의 0이면 정규화 불가 (손이 접혀 있거나 감지 오류)
    if scale < 1e-6:
        return None

    normalized = []
    for lm in hand_landmarks:
        normalized.append({
            'x': (lm['x'] - wrist['x']) / scale,
            'y': (lm['y'] - wrist['y']) / scale,
            'z': (lm['z'] - wrist['z']) / scale,
        })

    return normalized


def normalize_sequence(sequence: np.ndarray) -> np.ndarray:
    """
    (30, 126) 시퀀스 전체에 프레임 단위 정규화를 적용한다.
    collect_landmarks.py 가 생성한 raw JSON 데이터를 학습 시 재사용할 때 호환성을 위해 사용한다.

    각 프레임(126차원)은 [손0(63차원), 손1(63차원)] 구조이며
    21포인트 × xyz = 63 으로 구성된다.
    """
    NUM_LM = 21   # 한 손당 랜드마크 수
    DIMS   = 3    # x, y, z

    normalized_seq = np.zeros_like(sequence)

    for frame_idx, frame in enumerate(sequence):
        for hand_idx in range(2):
            offset = hand_idx * NUM_LM * DIMS

            # raw 좌표를 딕셔너리 리스트로 변환
            raw = []
            for lm_idx in range(NUM_LM):
                base = offset + lm_idx * DIMS
                raw.append({
                    'x': float(frame[base]),
                    'y': float(frame[base + 1]),
                    'z': float(frame[base + 2]),
                })

            # 손목이 모두 0이면 해당 손은 미감지 → 0 유지
            if raw[0]['x'] == 0.0 and raw[0]['y'] == 0.0 and raw[0]['z'] == 0.0:
                continue

            norm = normalize_landmarks(raw)
            if norm is None:
                continue

            for lm_idx, lm in enumerate(norm):
                base = offset + lm_idx * DIMS
                normalized_seq[frame_idx][base]     = lm['x']
                normalized_seq[frame_idx][base + 1] = lm['y']
                normalized_seq[frame_idx][base + 2] = lm['z']

    return normalized_seq


# ── 데이터 전처리 ──────────────────────────────────────────────────────────────
def preprocess_raw_data() -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    data/raw/ 의 JSON 파일들을 읽어서 numpy 배열로 변환한다.
    변환 결과를 data/processed/ 에 저장한다.

    반환: (X, y, label_names)
        X    : shape (N, 30, 126)
        y    : shape (N,) — 정수 레이블
        label_names: 인덱스에 대응하는 레이블 이름 리스트
    """
    label_dirs = sorted([d for d in DATA_RAW_DIR.iterdir() if d.is_dir()])
    if not label_dirs:
        print(f"[오류] {DATA_RAW_DIR} 에 수집된 데이터가 없습니다.")
        print("       collect/collect_landmarks.py 로 먼저 데이터를 수집하세요.")
        sys.exit(1)

    label_names = [d.name for d in label_dirs]
    print(f"[전처리] 발견된 레이블: {label_names}")

    X_list: list[np.ndarray] = []
    y_list: list[int] = []

    for label_idx, label_dir in enumerate(label_dirs):
        json_files = list(label_dir.glob("*.json"))
        print(f"  - '{label_dir.name}': {len(json_files)}개 샘플")

        for jf in json_files:
            with open(jf, encoding="utf-8") as f:
                data = json.load(f)

            sequence = np.array(data["sequence"], dtype=np.float32)

            # 시퀀스 길이가 30이 아닌 경우 스킵
            if sequence.shape[0] != SEQUENCE_LENGTH:
                print(f"    [경고] 길이 불일치 ({sequence.shape[0]}프레임) — 스킵: {jf.name}")
                continue

            # raw 데이터 호환을 위해 정규화 적용
            # (collect_landmarks.py 가 이미 정규화한 경우에도 손목=원점이므로 멱등성 보장)
            sequence = normalize_sequence(sequence)

            X_list.append(sequence)
            y_list.append(label_idx)

    if not X_list:
        print("[오류] 유효한 샘플이 없습니다.")
        sys.exit(1)

    X = np.stack(X_list, axis=0)        # (N, 30, 126)
    y = np.array(y_list, dtype=np.int64)

    # 전처리 결과 저장
    np.save(DATA_PROC_DIR / "X.npy", X)
    np.save(DATA_PROC_DIR / "y.npy", y)
    with open(DATA_PROC_DIR / "labels.json", "w", encoding="utf-8") as f:
        json.dump(label_names, f, ensure_ascii=False, indent=2)

    print(f"[전처리] 완료: X={X.shape}, y={y.shape}")
    return X, y, label_names


def load_processed_data() -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    data/processed/ 에서 전처리된 데이터를 로드한다.
    파일이 없으면 raw 데이터에서 자동 전처리한다.
    """
    X_path      = DATA_PROC_DIR / "X.npy"
    y_path      = DATA_PROC_DIR / "y.npy"
    labels_path = DATA_PROC_DIR / "labels.json"

    if X_path.exists() and y_path.exists() and labels_path.exists():
        print("[데이터] 전처리된 데이터를 로드합니다...")
        X = np.load(X_path)
        y = np.load(y_path)
        with open(labels_path, encoding="utf-8") as f:
            label_names = json.load(f)
        print(f"[데이터] X={X.shape}, y={y.shape}, 클래스={label_names}")
        return X, y, label_names
    else:
        print("[데이터] 전처리된 데이터가 없습니다. raw 데이터에서 전처리합니다...")
        return preprocess_raw_data()


# ── 학습 루프 ──────────────────────────────────────────────────────────────────
def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
) -> tuple[float, float]:
    """한 epoch 학습 후 (loss, accuracy) 반환."""
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for X_batch, y_batch in loader:
        X_batch = X_batch.to(DEVICE)
        y_batch = y_batch.to(DEVICE)

        optimizer.zero_grad()
        logits = model(X_batch)
        loss = criterion(logits, y_batch)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * len(y_batch)
        preds = logits.argmax(dim=1)
        correct += (preds == y_batch).sum().item()
        total += len(y_batch)

    return total_loss / total, correct / total


def eval_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
) -> tuple[float, float]:
    """Validation set 평가 후 (loss, accuracy) 반환."""
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for X_batch, y_batch in loader:
            X_batch = X_batch.to(DEVICE)
            y_batch = y_batch.to(DEVICE)

            logits = model(X_batch)
            loss = criterion(logits, y_batch)

            total_loss += loss.item() * len(y_batch)
            preds = logits.argmax(dim=1)
            correct += (preds == y_batch).sum().item()
            total += len(y_batch)

    return total_loss / total, correct / total


def main() -> None:
    print(f"[학습] 디바이스: {DEVICE}")

    # ── 데이터 로드 ────────────────────────────────────────────────────────
    X, y, label_names = load_processed_data()
    num_classes = len(label_names)
    print(f"[학습] 클래스 수: {num_classes} | 전체 샘플: {len(X)}")

    # ── Train / Val / Test 3-way 분리 (70 / 15 / 15) ─────────────────────
    # 먼저 test 분리 (전체의 15%)
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )
    # 나머지에서 val 분리 (trainval의 약 17.6% ≈ 전체의 15%)
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval, y_trainval, test_size=0.176, random_state=42, stratify=y_trainval
    )
    print(f"[학습] Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

    # ── DataLoader 생성 ────────────────────────────────────────────────────
    train_ds = TensorDataset(
        torch.tensor(X_train, dtype=torch.float32),
        torch.tensor(y_train, dtype=torch.long),
    )
    val_ds = TensorDataset(
        torch.tensor(X_val, dtype=torch.float32),
        torch.tensor(y_val, dtype=torch.long),
    )
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  drop_last=True)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False)

    # ── 모델 / 옵티마이저 / 손실 함수 ─────────────────────────────────────
    model = SignLSTM(
        input_size=INPUT_SIZE,
        hidden_size=HIDDEN_SIZE,
        num_layers=NUM_LAYERS,
        num_classes=num_classes,
        dropout=DROPOUT,
    ).to(DEVICE)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    # 학습률 스케줄러: Val loss 개선이 없으면 LR을 절반으로
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )

    best_val_loss = float("inf")
    best_epoch    = 0

    print(f"\n{'Epoch':>6} {'Train Loss':>12} {'Train Acc':>10} {'Val Loss':>10} {'Val Acc':>10}")
    print("-" * 55)

    # ── 학습 루프 ──────────────────────────────────────────────────────────
    for epoch in range(1, EPOCHS + 1):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer)
        val_loss,   val_acc   = eval_epoch(model, val_loader, criterion)

        scheduler.step(val_loss)

        print(
            f"{epoch:>6} {train_loss:>12.4f} {train_acc:>9.2%} {val_loss:>10.4f} {val_acc:>9.2%}"
        )

        # 최적 모델 저장
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_epoch    = epoch
            torch.save(model.state_dict(), OUTPUT_DIR / "model.pt")

    print(f"\n[완료] 최적 모델: epoch {best_epoch} (val_loss={best_val_loss:.4f})")
    print(f"[저장] {OUTPUT_DIR / 'model.pt'}")

    # 레이블 매핑 저장 (evaluate / export 에서 사용)
    with open(OUTPUT_DIR / "labels.json", "w", encoding="utf-8") as f:
        json.dump(label_names, f, ensure_ascii=False, indent=2)
    print(f"[저장] {OUTPUT_DIR / 'labels.json'}")


if __name__ == "__main__":
    main()
