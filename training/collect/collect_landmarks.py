"""
collect_landmarks.py

웹캠에서 MediaPipe 손 랜드마크를 수집하여 JSON으로 저장하는 스크립트.

사용법:
    python collect_landmarks.py --label "감사합니다" --samples 100

조작:
    스페이스바 : 녹화 시작 / 정지
    q          : 종료
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

# ── 상수 ──────────────────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 30          # 샘플 1개당 프레임 수
NUM_HAND_LANDMARKS = 21       # MediaPipe 손 랜드마크 개수 (한 손)
LANDMARK_DIMS = 3             # x, y, z

# data/raw 경로: 이 스크립트 기준으로 두 단계 위 → data/raw
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_RAW_DIR = SCRIPT_DIR.parent / "data" / "raw"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="수어 랜드마크 데이터 수집기")
    parser.add_argument(
        "--label",
        type=str,
        required=True,
        help="수집할 수어 레이블 (예: '감사합니다')",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=100,
        help="수집할 샘플 수 (기본값: 100)",
    )
    return parser.parse_args()


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


def extract_landmarks(hand_landmarks_list) -> np.ndarray:
    """
    MediaPipe 손 랜드마크 목록(최대 2개)에서 정규화된 좌표 배열을 추출한다.
    각 손에 대해 손목 기준 좌표 정규화 + 스케일 정규화를 적용한다.
    손이 감지되지 않거나 정규화에 실패한 경우 0으로 채운다.

    반환: shape (126,) — 양손 각 21포인트 × xyz (정규화된 값)
    """
    result = np.zeros(NUM_HAND_LANDMARKS * LANDMARK_DIMS * 2, dtype=np.float32)

    for hand_idx, hand_landmarks in enumerate(hand_landmarks_list[:2]):
        # MediaPipe landmark 객체를 딕셔너리 리스트로 변환
        raw = [{'x': lm.x, 'y': lm.y, 'z': lm.z} for lm in hand_landmarks.landmark]

        # 정규화 적용
        normalized = normalize_landmarks(raw)
        if normalized is None:
            # 정규화 실패 시 해당 손 좌표는 0으로 유지
            continue

        offset = hand_idx * NUM_HAND_LANDMARKS * LANDMARK_DIMS
        for lm_idx, lm in enumerate(normalized):
            base = offset + lm_idx * LANDMARK_DIMS
            result[base]     = lm['x']
            result[base + 1] = lm['y']
            result[base + 2] = lm['z']

    return result


def save_sample(label: str, sequence: list[np.ndarray]) -> Path:
    """
    30프레임 시퀀스를 JSON 파일로 저장한다.
    저장 경로: data/raw/{label}/{timestamp}.json
    """
    save_dir = DATA_RAW_DIR / label
    save_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    file_path = save_dir / f"{timestamp}.json"

    # numpy float32 → Python float 변환 후 직렬화
    data = {
        "label": label,
        "sequence_length": SEQUENCE_LENGTH,
        "landmarks_per_frame": NUM_HAND_LANDMARKS * 2,
        "dims": LANDMARK_DIMS,
        "sequence": [frame.tolist() for frame in sequence],
    }

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    return file_path


def draw_ui(
    frame: np.ndarray,
    label: str,
    collected: int,
    total: int,
    recording: bool,
    buffer_len: int,
) -> np.ndarray:
    """화면에 상태 정보를 렌더링한다."""
    h, w = frame.shape[:2]
    overlay = frame.copy()

    # 상단 반투명 배경
    cv2.rectangle(overlay, (0, 0), (w, 90), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

    # 레이블 및 진행 상태
    cv2.putText(
        frame,
        f"Label: {label}  [{collected}/{total}]",
        (10, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
    )

    # 녹화 상태 표시
    if recording:
        status_color = (0, 0, 255)   # 빨간색 = 녹화 중
        status_text = f"REC  {buffer_len}/{SEQUENCE_LENGTH} frames"
        # 깜빡이는 녹화 표시
        if int(time.time() * 2) % 2 == 0:
            cv2.circle(frame, (w - 30, 25), 10, status_color, -1)
    else:
        status_color = (0, 255, 0)   # 초록색 = 대기
        status_text = "SPACE: 녹화 시작  |  q: 종료"

    cv2.putText(
        frame,
        status_text,
        (10, 65),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        status_color,
        2,
    )

    return frame


def main() -> None:
    args = parse_args()
    label = args.label
    total_samples = args.samples

    print(f"[수집기] 레이블: '{label}' | 목표 샘플 수: {total_samples}")
    print(f"[수집기] 저장 경로: {DATA_RAW_DIR / label}")
    print("[수집기] 스페이스바: 녹화 시작/정지 | q: 종료\n")

    # ── MediaPipe 초기화 ───────────────────────────────────────────────────
    mp_hands = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )

    # ── 웹캠 초기화 ────────────────────────────────────────────────────────
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[오류] 웹캠을 열 수 없습니다.")
        sys.exit(1)

    collected = 0
    recording = False
    frame_buffer: list[np.ndarray] = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("[오류] 프레임을 읽을 수 없습니다.")
                break

            # BGR → RGB 변환 후 MediaPipe 처리
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False
            results = hands.process(frame_rgb)
            frame_rgb.flags.writeable = True

            # 랜드마크 그리기
            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(
                        frame,
                        hand_landmarks,
                        mp_hands.HAND_CONNECTIONS,
                        mp_drawing.DrawingSpec(color=(0, 255, 128), thickness=2, circle_radius=3),
                        mp_drawing.DrawingSpec(color=(255, 255, 0), thickness=2),
                    )

            # 녹화 중이면 현재 프레임 랜드마크 버퍼에 추가
            if recording:
                landmarks = extract_landmarks(
                    results.multi_hand_landmarks if results.multi_hand_landmarks else []
                )
                frame_buffer.append(landmarks)

                # 30프레임 완성 시 저장
                if len(frame_buffer) >= SEQUENCE_LENGTH:
                    recording = False
                    path = save_sample(label, frame_buffer)
                    frame_buffer = []
                    collected += 1
                    print(f"[저장] ({collected}/{total_samples}) {path.name}")

                    # 목표 달성 시 자동 종료
                    if collected >= total_samples:
                        print(f"\n[완료] '{label}' 데이터 {total_samples}개 수집 완료!")
                        break

            # UI 렌더링
            frame = draw_ui(frame, label, collected, total_samples, recording, len(frame_buffer))
            cv2.imshow("SignBridge - 랜드마크 수집기", frame)

            # 키 입력 처리
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                print("[종료] 사용자가 종료했습니다.")
                break
            elif key == ord(" "):
                if recording:
                    # 녹화 도중 스페이스바 → 녹화 취소
                    recording = False
                    frame_buffer = []
                    print("[취소] 녹화가 취소되었습니다.")
                else:
                    # 녹화 시작
                    recording = True
                    frame_buffer = []
                    print(f"[녹화] 시작... ({collected + 1}/{total_samples})")

    finally:
        cap.release()
        cv2.destroyAllWindows()
        hands.close()

    print(f"\n[요약] 총 {collected}개 샘플 수집 완료.")


if __name__ == "__main__":
    main()
