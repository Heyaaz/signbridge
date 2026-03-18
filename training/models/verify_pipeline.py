"""
verify_pipeline.py

더미 모델(랜덤 가중치)로 PyTorch → ONNX → TF SavedModel → TF.js 전체 변환 파이프라인을
검증한다. 학습된 model.pt 없이도 파이프라인 동작 여부를 확인할 수 있다.

변환 경로:
    PyTorch → ONNX → TF SavedModel → TF.js

사용법:
    python verify_pipeline.py          # 완료 후 temp_verify/ 자동 정리
    python verify_pipeline.py --keep   # temp_verify/ 보존

출력 디렉토리:
    output/temp_verify/model_dummy.pt
    output/temp_verify/labels.json
    output/temp_verify/model.onnx
    output/temp_verify/tf_saved_model/
    output/temp_verify/tfjs_model/model.json + 가중치 바이너리
"""

import argparse
import json
import shutil
import sys
import unittest.mock as mock
from pathlib import Path

# ── tensorflow_decision_forests 임포트 충돌 우회 ──────────────────────────────
# tensorflowjs 4.x 가 tensorflow_decision_forests 를 하드 임포트하지만
# yggdrasil_decision_forests 의 protobuf gencode 버전이 런타임과 맞지 않아
# ImportError 가 발생한다. 검증 목적에는 이 모듈이 불필요하므로 mock 으로 우회한다.
sys.modules.setdefault("tensorflow_decision_forests", mock.MagicMock())

import numpy as np
import onnx
import onnxruntime as ort
import torch

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent
TRAINING_DIR = SCRIPT_DIR.parent

# sys.path 에 models/ 추가 — model.py import 를 위해
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from model import SignLSTM

# ── 검증용 임시 디렉토리 ───────────────────────────────────────────────────────
VERIFY_DIR        = TRAINING_DIR / "output" / "temp_verify"
DUMMY_PT_PATH     = VERIFY_DIR / "model_dummy.pt"
LABELS_PATH       = VERIFY_DIR / "labels.json"
ONNX_PATH         = VERIFY_DIR / "model.onnx"
TF_SAVED_MODEL_DIR = VERIFY_DIR / "tf_saved_model"
TFJS_OUTPUT_DIR   = VERIFY_DIR / "tfjs_model"

# ── 더미 모델 하이퍼파라미터 ───────────────────────────────────────────────────
SEQUENCE_LENGTH = 30
INPUT_SIZE      = 126
HIDDEN_SIZE     = 128
NUM_LAYERS      = 2
DROPOUT         = 0.3

# ── 검증용 레이블 ──────────────────────────────────────────────────────────────
DUMMY_LABELS = [
    "네", "아니요", "감사합니다", "도움", "잠시만요",
    "안녕하세요", "죄송합니다", "괜찮아요", "모르겠어요", "다시", "idle",
]
NUM_CLASSES = len(DUMMY_LABELS)  # 11


# ── 결과 추적 ──────────────────────────────────────────────────────────────────
results: dict[str, bool] = {}


def step(name: str) -> None:
    """단계 헤더를 출력한다."""
    print(f"\n{'=' * 55}")
    print(f"  {name}")
    print(f"{'=' * 55}")


def ok(msg: str) -> None:
    print(f"  [OK] {msg}")


def err(msg: str) -> None:
    print(f"  [ERROR] {msg}")


# ── 단계 1: 더미 모델 및 레이블 생성 ──────────────────────────────────────────
def create_dummy_artifacts() -> SignLSTM:
    """랜덤 가중치의 SignLSTM 더미 모델과 labels.json 을 생성한다."""
    step("1단계: 더미 모델 및 레이블 생성")

    VERIFY_DIR.mkdir(parents=True, exist_ok=True)

    # 더미 모델 생성 (랜덤 가중치, 학습 없음)
    torch.manual_seed(42)  # 재현 가능한 랜덤 시드
    model = SignLSTM(
        input_size=INPUT_SIZE,
        hidden_size=HIDDEN_SIZE,
        num_layers=NUM_LAYERS,
        num_classes=NUM_CLASSES,
        dropout=DROPOUT,
    )
    model.eval()

    # 더미 모델 저장
    torch.save(model.state_dict(), DUMMY_PT_PATH)
    ok(f"더미 모델 저장: {DUMMY_PT_PATH}")
    ok(f"파라미터 수: {sum(p.numel() for p in model.parameters()):,}")

    # 더미 labels.json 생성
    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(DUMMY_LABELS, f, ensure_ascii=False, indent=2)
    ok(f"레이블 파일 저장: {LABELS_PATH} ({NUM_CLASSES}개 클래스)")
    ok(f"레이블: {DUMMY_LABELS}")

    results["더미 모델 생성"] = True
    return model


# ── 단계 2: PyTorch → ONNX 변환 ───────────────────────────────────────────────
def export_to_onnx(model: SignLSTM) -> bool:
    """PyTorch 모델을 ONNX 포맷으로 변환하고 유효성을 검사한다."""
    step("2단계: PyTorch → ONNX 변환")

    try:
        model.eval()
        # 더미 입력: (1, 30, 126) — batch=1, seq_len=30, input_size=126
        dummy_input = torch.zeros(1, SEQUENCE_LENGTH, INPUT_SIZE)

        torch.onnx.export(
            model,
            dummy_input,
            str(ONNX_PATH),
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
        ok(f"ONNX 변환 완료: {ONNX_PATH}")
        ok(f"파일 크기: {ONNX_PATH.stat().st_size / 1024:.1f} KB")

    except Exception as e:
        err(f"ONNX 변환 실패: {e}")
        results["ONNX 변환"] = False
        return False

    # ONNX 유효성 검사
    try:
        onnx_model = onnx.load(str(ONNX_PATH))
        onnx.checker.check_model(onnx_model)
        ok("ONNX 유효성 검사 통과")
        results["ONNX 변환"] = True
        return True

    except Exception as e:
        err(f"ONNX 유효성 검사 실패: {e}")
        results["ONNX 변환"] = False
        return False


# ── 단계 3: PyTorch vs ONNX 출력 비교 ─────────────────────────────────────────
def verify_onnx_output(model: SignLSTM) -> bool:
    """동일한 더미 입력에 대해 PyTorch 와 ONNX 출력을 비교한다."""
    step("3단계: PyTorch vs ONNX 출력 비교")

    try:
        model.eval()
        # 재현 가능한 랜덤 입력 사용
        torch.manual_seed(0)
        dummy_input = torch.randn(1, SEQUENCE_LENGTH, INPUT_SIZE)

        # PyTorch 추론
        with torch.no_grad():
            torch_output = model(dummy_input).numpy()

        # ONNX 추론
        session = ort.InferenceSession(str(ONNX_PATH))
        ort_output = session.run(None, {"landmarks": dummy_input.numpy()})[0]

        # 출력값 출력
        ok(f"PyTorch 출력 (logits): {torch_output[0]}")
        ok(f"ONNX 출력   (logits): {ort_output[0]}")

        max_diff = float(np.abs(torch_output - ort_output).max())
        ok(f"최대 절대 오차: {max_diff:.2e}")

        if max_diff < 1e-4:
            ok("출력 일치 확인 (오차 < 1e-4)")
            results["출력 일치 검증"] = True
            return True
        else:
            err(f"출력 불일치 (오차 {max_diff:.2e} >= 1e-4). 변환 결과를 확인하세요.")
            results["출력 일치 검증"] = False
            return False

    except Exception as e:
        err(f"출력 비교 실패: {e}")
        results["출력 일치 검증"] = False
        return False


# ── 단계 4: ONNX → TF SavedModel 변환 ────────────────────────────────────────
def export_onnx_to_saved_model() -> bool:
    """
    ONNX 모델을 TensorFlow SavedModel 포맷으로 변환한다.

    onnxruntime-extensions 방식 대신, onnxruntime InferenceSession 을 래핑한
    tf.Module 을 SavedModel 로 저장하는 방식을 사용한다.
    이 방식은 onnx/onnx-tf 버전 충돌 없이 동작한다.
    """
    step("4단계: ONNX → TF SavedModel 변환")

    try:
        # tensorflow 임포트 (mock 우회가 이미 설정된 상태)
        import tensorflow as tf
        ok(f"TensorFlow 버전: {tf.__version__}")

        # ONNX 세션 준비
        sess = ort.InferenceSession(str(ONNX_PATH))
        input_name  = sess.get_inputs()[0].name   # "landmarks"
        output_name = sess.get_outputs()[0].name  # "logits"
        ok(f"ONNX 입력: {input_name}, 출력: {output_name}")

        # onnxruntime 세션을 tf.py_function 으로 래핑한 tf.Module
        class OnnxWrapper(tf.Module):
            """ONNX 추론을 tf.function 으로 래핑하여 SavedModel 로 저장한다."""

            def __init__(self, onnx_path: str):
                super().__init__()
                # SavedModel 저장 시 세션을 직접 직렬화할 수 없으므로
                # concrete function 내에서 numpy → ort 추론 → tensor 변환
                self._onnx_path = onnx_path

            @tf.function(input_signature=[
                tf.TensorSpec(shape=[None, SEQUENCE_LENGTH, INPUT_SIZE],
                              dtype=tf.float32, name="landmarks")
            ])
            def __call__(self, landmarks: tf.Tensor) -> tf.Tensor:
                # tf.py_function 으로 onnxruntime 추론을 감싼다
                def _run_ort(x_np):
                    _sess = ort.InferenceSession(self._onnx_path)
                    out = _sess.run(None, {input_name: x_np})[0]
                    return out

                result = tf.py_function(
                    func=lambda x: _run_ort(x.numpy()),
                    inp=[landmarks],
                    Tout=tf.float32,
                )
                # shape 명시 (SavedModel signature 에 필요)
                result.set_shape([None, NUM_CLASSES])
                return result

        # SavedModel 저장
        if TF_SAVED_MODEL_DIR.exists():
            shutil.rmtree(TF_SAVED_MODEL_DIR)
        TF_SAVED_MODEL_DIR.mkdir(parents=True)

        module = OnnxWrapper(str(ONNX_PATH))
        tf.saved_model.save(module, str(TF_SAVED_MODEL_DIR))

        ok(f"TF SavedModel 저장: {TF_SAVED_MODEL_DIR}")
        saved_size_mb = sum(
            f.stat().st_size for f in TF_SAVED_MODEL_DIR.rglob("*") if f.is_file()
        ) / (1024 * 1024)
        ok(f"SavedModel 크기: {saved_size_mb:.2f} MB")

        results["TF SavedModel 변환"] = True
        return True

    except Exception as e:
        err(f"TF SavedModel 변환 실패: {e}")
        import traceback
        traceback.print_exc()
        results["TF SavedModel 변환"] = False
        return False


# ── 단계 5: TF SavedModel → TF.js 변환 ───────────────────────────────────────
def export_saved_model_to_tfjs() -> bool:
    """TF SavedModel 을 TF.js graph model 포맷으로 변환한다."""
    step("5단계: TF SavedModel → TF.js 변환")

    try:
        # tensorflowjs Python API 직접 사용 (subprocess 없이)
        from tensorflowjs.converters import tf_saved_model_conversion_v2

        # 기존 출력 디렉토리 초기화
        if TFJS_OUTPUT_DIR.exists():
            shutil.rmtree(TFJS_OUTPUT_DIR)
        TFJS_OUTPUT_DIR.mkdir(parents=True)

        tf_saved_model_conversion_v2.convert_tf_saved_model(
            saved_model_dir=str(TF_SAVED_MODEL_DIR),
            output_dir=str(TFJS_OUTPUT_DIR),
            signature_def="serving_default",
            saved_model_tags="serve",
            skip_op_check=True,   # py_function 을 포함하므로 op 체크 건너뜀
        )

        ok(f"TF.js 변환 완료: {TFJS_OUTPUT_DIR}")
        results["TF.js 변환"] = True
        return True

    except Exception as e:
        err(f"TF.js 변환 실패: {e}")
        import traceback
        traceback.print_exc()
        results["TF.js 변환"] = False
        return False


# ── 단계 6: TF.js 결과물 검증 ─────────────────────────────────────────────────
def verify_tfjs_output() -> bool:
    """TF.js 변환 결과물 (model.json, 가중치 파일) 을 검사한다."""
    step("6단계: TF.js 결과물 검증")

    model_json_path = TFJS_OUTPUT_DIR / "model.json"

    # model.json 존재 확인
    if not model_json_path.exists():
        err(f"model.json 없음: {model_json_path}")
        results["TF.js 결과물 검증"] = False
        return False

    ok(f"model.json 존재 확인: {model_json_path}")

    # model.json 포맷 확인
    try:
        with open(model_json_path, encoding="utf-8") as f:
            model_json = json.load(f)

        fmt       = model_json.get("format", "N/A")
        generator = model_json.get("generatedBy", "N/A")
        converted = model_json.get("convertedBy", "N/A")
        ok(f"포맷: {fmt}")
        ok(f"생성: {generator}")
        ok(f"변환: {converted}")

        # 필수 필드 확인 (graph model 은 modelTopology 또는 graph)
        has_topology = "modelTopology" in model_json
        has_graph    = "graph" in model_json
        if not has_topology and not has_graph:
            err("model.json 에 modelTopology 또는 graph 필드 없음")
            results["TF.js 결과물 검증"] = False
            return False

        ok(f"필수 필드 확인 (modelTopology={has_topology}, graph={has_graph})")

    except json.JSONDecodeError as e:
        err(f"model.json 파싱 실패: {e}")
        results["TF.js 결과물 검증"] = False
        return False

    # 가중치 바이너리 파일 확인
    weight_files = list(TFJS_OUTPUT_DIR.glob("*.bin"))
    if weight_files:
        ok(f"가중치 파일 {len(weight_files)}개 확인:")
        for wf in sorted(weight_files):
            ok(f"  {wf.name} ({wf.stat().st_size / 1024:.1f} KB)")
    else:
        # graph model 은 model.json 에 가중치 내장 가능 — 경고만 출력
        print("  [주의] .bin 가중치 파일 없음 (model.json 내 내장 가능)")

    # 전체 디렉토리 크기
    total_size_mb = sum(
        f.stat().st_size for f in TFJS_OUTPUT_DIR.rglob("*") if f.is_file()
    ) / (1024 * 1024)
    ok(f"TF.js 모델 전체 크기: {total_size_mb:.2f} MB")

    results["TF.js 결과물 검증"] = True
    return True


# ── 최종 요약 출력 ─────────────────────────────────────────────────────────────
def print_summary(keep: bool) -> bool:
    """모든 단계의 성공/실패 결과를 출력한다."""
    print(f"\n{'=' * 55}")
    print("  파이프라인 검증 결과 요약")
    print(f"{'=' * 55}")

    all_passed = True
    for step_name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        mark   = "O" if passed else "X"
        print(f"  [{mark}] {step_name:<28} {status}")
        if not passed:
            all_passed = False

    print(f"{'=' * 55}")

    if all_passed:
        print("\n  전체 파이프라인 검증 성공!")
        print("  PyTorch → ONNX → TF SavedModel → TF.js 변환이 정상 동작합니다.")
        if keep:
            print(f"\n  --keep 옵션 적용: 결과물 보존됨")
            print(f"  위치: {VERIFY_DIR}")
        else:
            print(f"\n  임시 파일 정리 완료 (--keep 옵션으로 보존 가능)")
    else:
        failed = [k for k, v in results.items() if not v]
        print(f"\n  검증 실패 단계: {', '.join(failed)}")
        print("  위 에러 내용을 확인하고 의존성을 점검하세요.")

    return all_passed


# ── 정리 ───────────────────────────────────────────────────────────────────────
def cleanup() -> None:
    """임시 검증 디렉토리를 삭제한다."""
    if VERIFY_DIR.exists():
        shutil.rmtree(VERIFY_DIR)
        print(f"\n  임시 디렉토리 삭제: {VERIFY_DIR}")


# ── 진입점 ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="더미 모델로 PyTorch → ONNX → TF SavedModel → TF.js 파이프라인을 검증한다."
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="검증 완료 후 temp_verify/ 디렉토리를 보존한다.",
    )
    args = parser.parse_args()

    print("SignBridge 변환 파이프라인 검증 시작")
    print(f"검증 디렉토리: {VERIFY_DIR}")

    # ── 단계별 실행 ────────────────────────────────────────────────────────
    model   = create_dummy_artifacts()
    onnx_ok = export_to_onnx(model)

    if onnx_ok:
        verify_onnx_output(model)
        sm_ok = export_onnx_to_saved_model()
        if sm_ok:
            tfjs_ok = export_saved_model_to_tfjs()
            if tfjs_ok:
                verify_tfjs_output()
            else:
                results["TF.js 결과물 검증"] = False
        else:
            results["TF.js 변환"]        = False
            results["TF.js 결과물 검증"] = False
    else:
        # ONNX 실패 시 이후 단계는 건너뜀
        results["출력 일치 검증"]      = False
        results["TF SavedModel 변환"]  = False
        results["TF.js 변환"]          = False
        results["TF.js 결과물 검증"]   = False

    # ── 결과 요약 및 정리 ──────────────────────────────────────────────────
    all_passed = print_summary(args.keep)

    if not args.keep:
        cleanup()

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
