"""
evaluate.py

저장된 LSTM 모델을 Test set에서 평가한다.

- 전체 정확도
- 혼동 행렬 (Confusion Matrix)
- 클래스별 Precision / Recall / F1

사용법:
    python evaluate.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

from model import SignLSTM

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR    = Path(__file__).resolve().parent
TRAINING_DIR  = SCRIPT_DIR.parent
DATA_PROC_DIR = TRAINING_DIR / "data" / "processed"
OUTPUT_DIR    = TRAINING_DIR / "output"

# ── 하이퍼파라미터 (train.py 와 동일해야 함) ───────────────────────────────────
SEQUENCE_LENGTH = 30
INPUT_SIZE      = 126
HIDDEN_SIZE     = 128
NUM_LAYERS      = 2
DROPOUT         = 0.3
BATCH_SIZE      = 64
DEVICE          = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def print_confusion_matrix(cm: np.ndarray, label_names: list[str]) -> None:
    """혼동 행렬을 가독성 있게 출력한다."""
    n = len(label_names)
    col_width = max(len(name) for name in label_names) + 2
    header_width = max(col_width, 8)

    # 헤더 행
    header = "예측 →".ljust(header_width)
    for name in label_names:
        header += name[:col_width - 1].ljust(col_width)
    print(header)
    print("-" * (header_width + col_width * n))

    # 데이터 행
    for i, name in enumerate(label_names):
        row = f"실제: {name[:col_width - 7]}".ljust(header_width)
        for j in range(n):
            cell = str(cm[i, j])
            # 대각선(정답)은 강조
            if i == j:
                cell = f"[{cell}]"
            row += cell.ljust(col_width)
        print(row)


def main() -> None:
    # ── 모델 및 레이블 로드 ────────────────────────────────────────────────
    model_path  = OUTPUT_DIR / "model.pt"
    labels_path = OUTPUT_DIR / "labels.json"

    if not model_path.exists():
        print(f"[오류] 모델 파일이 없습니다: {model_path}")
        print("       train.py 로 먼저 모델을 학습하세요.")
        sys.exit(1)

    if not labels_path.exists():
        print(f"[오류] 레이블 파일이 없습니다: {labels_path}")
        sys.exit(1)

    with open(labels_path, encoding="utf-8") as f:
        label_names: list[str] = json.load(f)

    num_classes = len(label_names)
    print(f"[평가] 클래스: {label_names}")

    model = SignLSTM(
        input_size=INPUT_SIZE,
        hidden_size=HIDDEN_SIZE,
        num_layers=NUM_LAYERS,
        num_classes=num_classes,
        dropout=DROPOUT,
    ).to(DEVICE)

    model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    model.eval()
    print(f"[평가] 모델 로드 완료: {model_path}")

    # ── 데이터 로드 ────────────────────────────────────────────────────────
    X_path = DATA_PROC_DIR / "X.npy"
    y_path = DATA_PROC_DIR / "y.npy"

    if not X_path.exists() or not y_path.exists():
        print(f"[오류] 전처리된 데이터가 없습니다: {DATA_PROC_DIR}")
        print("       train.py 를 먼저 실행하세요.")
        sys.exit(1)

    X = np.load(X_path)
    y = np.load(y_path)
    print(f"[평가] 전체 데이터: {X.shape}")

    # train.py 와 동일한 3-way split (70/15/15) 으로 test set 추출
    # 첫 번째 split 만 재현하면 X_test 가 동일하게 결정된다
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )
    print(f"[평가] Test set: {len(X_test)}개 샘플")

    # ── DataLoader ─────────────────────────────────────────────────────────
    test_ds = TensorDataset(
        torch.tensor(X_test, dtype=torch.float32),
        torch.tensor(y_test, dtype=torch.long),
    )
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)

    # ── 추론 ───────────────────────────────────────────────────────────────
    all_preds: list[int] = []
    all_labels: list[int] = []
    all_probs: list[np.ndarray] = []

    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(DEVICE)
            logits  = model(X_batch)
            probs   = torch.softmax(logits, dim=1).cpu().numpy()
            preds   = logits.argmax(dim=1).cpu().numpy()

            all_preds.extend(preds.tolist())
            all_labels.extend(y_batch.numpy().tolist())
            all_probs.append(probs)

    all_preds  = np.array(all_preds)
    all_labels = np.array(all_labels)

    # ── 전체 정확도 ────────────────────────────────────────────────────────
    accuracy = (all_preds == all_labels).mean()
    print(f"\n{'=' * 55}")
    print(f"  전체 정확도: {accuracy:.2%}  ({(all_preds == all_labels).sum()}/{len(all_labels)})")
    print(f"{'=' * 55}\n")

    # ── 혼동 행렬 ──────────────────────────────────────────────────────────
    cm = confusion_matrix(all_labels, all_preds)
    print("[ 혼동 행렬 ]")
    print_confusion_matrix(cm, label_names)
    print()

    # ── 클래스별 Precision / Recall / F1 ──────────────────────────────────
    print("[ 클래스별 성능 ]")
    report = classification_report(
        all_labels,
        all_preds,
        target_names=label_names,
        zero_division=0,
    )
    print(report)

    # ── 클래스별 정확도 (개별 출력) ────────────────────────────────────────
    print("[ 클래스별 정확도 ]")
    for idx, name in enumerate(label_names):
        mask     = all_labels == idx
        n_total  = mask.sum()
        n_correct = (all_preds[mask] == idx).sum() if n_total > 0 else 0
        acc = n_correct / n_total if n_total > 0 else 0.0
        bar = "█" * int(acc * 20) + "░" * (20 - int(acc * 20))
        print(f"  {name:<16} {bar} {acc:>6.1%}  ({n_correct}/{n_total})")


if __name__ == "__main__":
    main()
