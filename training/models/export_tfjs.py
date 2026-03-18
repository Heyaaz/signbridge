"""
export_tfjs.py

학습된 PyTorch 모델을 TensorFlow.js 포맷으로 변환한다.

변환 파이프라인:
    PyTorch (.pt) → ONNX (.onnx) → TF SavedModel → TF.js

tensorflowjs 4.x 에서 --input_format=onnx 가 제거되었으므로,
ONNX → TF SavedModel → TF.js 의 2단계 경로를 사용한다.
TF SavedModel 변환은 onnxruntime 세션을 tf.py_function 으로 래핑하는 방식을 사용한다.

출력:
    output/model.onnx
    output/tf_saved_model/          (중간 결과물)
    output/tfjs_model/model.json + 가중치 바이너리 파일

사용법:
    python export_tfjs.py

사전 조건:
    pip install onnx onnxruntime tensorflowjs tensorflow
"""

import json
import shutil
import sys
import unittest.mock as mock
from pathlib import Path

# ── tensorflow_decision_forests 임포트 충돌 우회 ──────────────────────────────
# tensorflowjs 4.x 가 tensorflow_decision_forests 를 하드 임포트하지만
# yggdrasil_decision_forests 의 protobuf gencode 버전이 런타임과 맞지 않아
# ImportError 가 발생한다. 변환 목적에는 이 모듈이 불필요하므로 mock 으로 우회한다.
sys.modules.setdefault("tensorflow_decision_forests", mock.MagicMock())

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn  # noqa: F401 — SignLSTM 타입 힌트에 사용

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


def export_onnx_to_saved_model(num_classes: int) -> None:
    """
    ONNX 모델을 TensorFlow SavedModel 포맷으로 변환한다.

    tensorflowjs 4.x 에서 --input_format=onnx 가 제거되어 SavedModel 경유가 필요하다.
    onnxruntime InferenceSession 을 tf.py_function 으로 래핑한 tf.Module 을
    SavedModel 로 저장하는 방식을 사용한다.

    Args:
        num_classes: 분류 클래스 수 (출력 텐서 shape 명시에 사용)
    """
    print("\n[2단계] ONNX → TF SavedModel 변환 중...")

    import tensorflow as tf

    # ONNX 세션 초기화 및 입출력 이름 확인
    sess = ort.InferenceSession(str(ONNX_MODEL_PATH))
    input_name  = sess.get_inputs()[0].name   # "landmarks"
    output_name = sess.get_outputs()[0].name  # "logits"
    print(f"    ONNX 입력: {input_name}, 출력: {output_name}")

    # ONNX 추론을 tf.py_function 으로 래핑하는 tf.Module
    # SavedModel 저장 시 ort.InferenceSession 은 직렬화 불가능하므로
    # __call__ 내부에서 매번 새 세션을 생성한다.
    class OnnxWrapper(tf.Module):
        """ONNX 추론을 tf.function 으로 래핑하여 SavedModel 로 저장한다."""

        def __init__(self, onnx_path: str):
            super().__init__()
            self._onnx_path = onnx_path  # 직렬화 가능한 경로만 보관

        @tf.function(input_signature=[
            tf.TensorSpec(
                shape=[None, SEQUENCE_LENGTH, INPUT_SIZE],
                dtype=tf.float32,
                name="landmarks",
            )
        ])
        def __call__(self, landmarks: tf.Tensor) -> tf.Tensor:
            # tf.py_function 으로 onnxruntime 추론을 감싼다
            def _run_ort(x_np):
                _sess = ort.InferenceSession(self._onnx_path)
                return _sess.run(None, {input_name: x_np})[0]

            result = tf.py_function(
                func=lambda x: _run_ort(x.numpy()),
                inp=[landmarks],
                Tout=tf.float32,
            )
            # SavedModel signature 에 필요한 shape 명시
            result.set_shape([None, num_classes])
            return result

    # 기존 SavedModel 디렉토리 초기화
    if TF_SAVED_MODEL_DIR.exists():
        shutil.rmtree(TF_SAVED_MODEL_DIR)
    TF_SAVED_MODEL_DIR.mkdir(parents=True)

    module = OnnxWrapper(str(ONNX_MODEL_PATH))
    tf.saved_model.save(module, str(TF_SAVED_MODEL_DIR))

    saved_size_mb = sum(
        f.stat().st_size for f in TF_SAVED_MODEL_DIR.rglob("*") if f.is_file()
    ) / (1024 * 1024)
    print(f"    TF SavedModel 저장: {TF_SAVED_MODEL_DIR}")
    print(f"    SavedModel 크기: {saved_size_mb:.2f} MB")


def export_saved_model_to_tfjs() -> None:
    """
    TF SavedModel 을 TF.js graph model 포맷으로 변환한다.

    tensorflowjs Python API 를 직접 사용하며,
    float16 양자화를 적용해 모델 크기를 절반으로 줄인다.
    py_function 을 포함하므로 skip_op_check=True 로 설정한다.
    """
    print("\n[3단계] TF SavedModel → TF.js 변환 중...")

    from tensorflowjs.converters import tf_saved_model_conversion_v2

    # 기존 TF.js 출력 디렉토리 초기화
    if TFJS_OUTPUT_DIR.exists():
        shutil.rmtree(TFJS_OUTPUT_DIR)
    TFJS_OUTPUT_DIR.mkdir(parents=True)

    tf_saved_model_conversion_v2.convert_tf_saved_model(
        saved_model_dir=str(TF_SAVED_MODEL_DIR),
        output_dir=str(TFJS_OUTPUT_DIR),
        signature_def="serving_default",
        saved_model_tags="serve",
        quantization_dtype_map={"float16": "*"},  # float16 양자화 — 모델 크기 절반
        skip_op_check=True,                       # py_function 포함 시 필요
    )

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
    export_onnx_to_saved_model(num_classes)  # ONNX → TF SavedModel
    export_saved_model_to_tfjs()             # TF SavedModel → TF.js
    print_model_summary()

    # TF.js 와 함께 레이블 파일도 output/tfjs_model/ 에 복사
    shutil.copy2(LABELS_PATH, TFJS_OUTPUT_DIR / "labels.json")
    print(f"\n[저장] 레이블 파일 복사: {TFJS_OUTPUT_DIR / 'labels.json'}")


if __name__ == "__main__":
    main()
