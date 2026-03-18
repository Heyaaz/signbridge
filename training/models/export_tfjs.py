"""
export_tfjs.py

학습된 PyTorch 모델을 TensorFlow.js 포맷으로 변환한다.

변환 파이프라인:
    PyTorch (.pt) → ONNX (.onnx) → TensorFlow SavedModel → TF.js

출력:
    output/model.onnx
    output/tfjs_model/model.json + 가중치 바이너리 파일

사용법:
    python export_tfjs.py

사전 조건:
    pip install onnx onnxruntime tensorflowjs tensorflow
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn

from model import SignLSTM

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent
TRAINING_DIR = SCRIPT_DIR.parent
OUTPUT_DIR   = TRAINING_DIR / "output"

PYTORCH_MODEL_PATH = OUTPUT_DIR / "model.pt"
LABELS_PATH        = OUTPUT_DIR / "labels.json"
ONNX_MODEL_PATH    = OUTPUT_DIR / "model.onnx"
TFJS_OUTPUT_DIR    = OUTPUT_DIR / "tfjs_model"
TF_SAVED_MODEL_DIR = OUTPUT_DIR / "tf_saved_model"  # 중간 결과물

# ── 모델 하이퍼파라미터 (train.py 와 동일) ─────────────────────────────────────
SEQUENCE_LENGTH = 30
INPUT_SIZE      = 126
HIDDEN_SIZE     = 128
NUM_LAYERS      = 2
DROPOUT         = 0.3


def get_dir_size_mb(path: Path) -> float:
    """디렉토리 내 전체 파일 크기를 MB 단위로 반환한다."""
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return total / (1024 * 1024)


def export_to_onnx(model: nn.Module) -> None:
    """PyTorch 모델을 ONNX 포맷으로 변환한다."""
    print("\n[1단계] PyTorch → ONNX 변환 중...")

    model.eval()
    # 더미 입력: (1, 30, 126)
    dummy_input = torch.zeros(1, SEQUENCE_LENGTH, INPUT_SIZE)

    torch.onnx.export(
        model,
        dummy_input,
        str(ONNX_MODEL_PATH),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["landmarks"],
        output_names=["logits"],
        dynamic_axes={
            "landmarks": {0: "batch_size"},
            "logits":    {0: "batch_size"},
        },
    )

    # ONNX 모델 유효성 검사
    onnx_model = onnx.load(str(ONNX_MODEL_PATH))
    onnx.checker.check_model(onnx_model)
    print(f"    ONNX 모델 저장: {ONNX_MODEL_PATH}")
    print(f"    ONNX 파일 크기: {ONNX_MODEL_PATH.stat().st_size / 1024:.1f} KB")


def verify_onnx(model: nn.Module) -> None:
    """ONNX 모델 출력이 PyTorch 모델과 동일한지 검증한다."""
    print("\n[검증] ONNX 출력 검증 중...")

    model.eval()
    dummy_input = torch.zeros(1, SEQUENCE_LENGTH, INPUT_SIZE)

    with torch.no_grad():
        torch_output = model(dummy_input).numpy()

    session = ort.InferenceSession(str(ONNX_MODEL_PATH))
    ort_output = session.run(None, {"landmarks": dummy_input.numpy()})[0]

    max_diff = np.abs(torch_output - ort_output).max()
    print(f"    PyTorch vs ONNX 최대 오차: {max_diff:.2e}")

    if max_diff < 1e-4:
        print("    검증 통과: 출력이 일치합니다.")
    else:
        print("    [경고] 출력 불일치가 큽니다. 변환 결과를 확인하세요.")


def export_to_tfjs() -> None:
    """
    ONNX 모델을 TensorFlow.js 포맷으로 변환한다.

    tensorflowjs_converter CLI 를 사용한다:
        tensorflowjs_converter --input_format=onnx ...
    """
    print("\n[2단계] ONNX → TF.js 변환 중...")

    # 기존 출력 디렉토리 초기화
    if TFJS_OUTPUT_DIR.exists():
        shutil.rmtree(TFJS_OUTPUT_DIR)
    TFJS_OUTPUT_DIR.mkdir(parents=True)

    cmd = [
        sys.executable, "-m", "tensorflowjs.converters.converter",
        "--input_format", "onnx",
        "--output_format", "tfjs_graph_model",
        "--quantize_float16", "true",        # 모델 크기 절반으로 줄이기 (float16 양자화)
        str(ONNX_MODEL_PATH),
        str(TFJS_OUTPUT_DIR),
    ]

    print(f"    실행 명령: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("[오류] TF.js 변환 실패:")
        print(result.stderr)
        # 대안: tensorflowjs_converter 직접 호출 시도
        alt_cmd = [
            "tensorflowjs_converter",
            "--input_format", "onnx",
            "--output_format", "tfjs_graph_model",
            str(ONNX_MODEL_PATH),
            str(TFJS_OUTPUT_DIR),
        ]
        print(f"\n    대안 명령 시도: {' '.join(alt_cmd)}")
        alt_result = subprocess.run(alt_cmd, capture_output=True, text=True)

        if alt_result.returncode != 0:
            print("[오류] 대안 명령도 실패했습니다:")
            print(alt_result.stderr)
            print("\n수동 변환 방법:")
            print(f"  tensorflowjs_converter --input_format=onnx {ONNX_MODEL_PATH} {TFJS_OUTPUT_DIR}")
            sys.exit(1)

    print(f"    TF.js 모델 저장: {TFJS_OUTPUT_DIR}")


def print_model_summary() -> None:
    """변환 결과 파일 목록과 크기를 출력한다."""
    print("\n" + "=" * 55)
    print("  변환 완료 요약")
    print("=" * 55)

    files = {
        "ONNX 모델": ONNX_MODEL_PATH,
    }

    for name, path in files.items():
        if path.exists():
            size_kb = path.stat().st_size / 1024
            print(f"  {name:<20}: {size_kb:>8.1f} KB  {path}")

    if TFJS_OUTPUT_DIR.exists():
        tfjs_files = list(TFJS_OUTPUT_DIR.rglob("*"))
        tfjs_files_count = sum(1 for f in tfjs_files if f.is_file())
        tfjs_size_mb = get_dir_size_mb(TFJS_OUTPUT_DIR)
        print(f"  {'TF.js 모델':<20}: {tfjs_size_mb:>7.2f} MB  {TFJS_OUTPUT_DIR}/ ({tfjs_files_count}개 파일)")

        # model.json 내 메타정보 출력
        model_json_path = TFJS_OUTPUT_DIR / "model.json"
        if model_json_path.exists():
            with open(model_json_path) as f:
                model_json = json.load(f)
            print(f"\n  모델 포맷: {model_json.get('format', 'N/A')}")

    print("=" * 55)
    print(f"\n프론트엔드 연동:")
    print(f"  모델 경로: {TFJS_OUTPUT_DIR}/model.json")
    print("  tf.loadGraphModel() 으로 로드하세요.")


def main() -> None:
    # ── 사전 조건 확인 ─────────────────────────────────────────────────────
    if not PYTORCH_MODEL_PATH.exists():
        print(f"[오류] PyTorch 모델이 없습니다: {PYTORCH_MODEL_PATH}")
        print("       train.py 로 먼저 모델을 학습하세요.")
        sys.exit(1)

    if not LABELS_PATH.exists():
        print(f"[오류] 레이블 파일이 없습니다: {LABELS_PATH}")
        sys.exit(1)

    with open(LABELS_PATH, encoding="utf-8") as f:
        label_names: list[str] = json.load(f)

    num_classes = len(label_names)
    print(f"[변환] 클래스 수: {num_classes} — {label_names}")

    # ── PyTorch 모델 로드 ──────────────────────────────────────────────────
    model = SignLSTM(
        input_size=INPUT_SIZE,
        hidden_size=HIDDEN_SIZE,
        num_layers=NUM_LAYERS,
        num_classes=num_classes,
        dropout=DROPOUT,
    )
    model.load_state_dict(torch.load(PYTORCH_MODEL_PATH, map_location="cpu"))
    model.eval()
    print(f"[변환] 모델 로드: {PYTORCH_MODEL_PATH}")

    # ── 변환 실행 ──────────────────────────────────────────────────────────
    export_to_onnx(model)
    verify_onnx(model)
    export_to_tfjs()
    print_model_summary()

    # TF.js 와 함께 레이블 파일도 output/tfjs_model/ 에 복사
    shutil.copy2(LABELS_PATH, TFJS_OUTPUT_DIR / "labels.json")
    print(f"\n[저장] 레이블 파일 복사: {TFJS_OUTPUT_DIR / 'labels.json'}")


if __name__ == "__main__":
    main()
