/**
 * preprocess.ts
 *
 * MediaPipe Hands 랜드마크 배열을 TF.js 모델 입력용 정규화된 Float32Array로 변환한다.
 *
 * 정규화 방법:
 *   1. 손목(0번 포인트) 기준으로 좌표 원점 이동
 *   2. 손목~중지MCP(9번) 거리를 기준 스케일로 나누어 크기 정규화
 *
 * 출력 배열 구조: [왼손 63값, 오른손 63값] = 126값 (FRAME_SIZE)
 *   - 각 손: [x0, y0, z0, x1, y1, z1, ..., x20, y20, z20]
 *   - 손이 감지되지 않은 경우 해당 영역은 0으로 채움
 */

import type { HandLandmark } from "@/hooks/use-hand-tracking";
import { FRAME_SIZE } from "./ring-buffer";

/** 한 손당 포인트 수 (MediaPipe Hands 고정값) */
const HAND_POINTS = 21;

/** 한 손당 좌표 값 수 (x, y, z) */
const COORDS_PER_POINT = 3;

/** 한 손 데이터 크기 */
const PER_HAND_SIZE = HAND_POINTS * COORDS_PER_POINT; // 63

/**
 * 한 손의 랜드마크 배열을 정규화된 63개 값으로 변환한다.
 *
 * @param landmarks MediaPipe의 21개 랜드마크 배열
 * @returns 정규화된 Float32Array (길이 63). 입력이 null이면 0으로 채워진 배열 반환
 */
function normalizeSingleHand(landmarks: HandLandmark[] | null): Float32Array {
  const out = new Float32Array(PER_HAND_SIZE);

  if (!landmarks || landmarks.length < HAND_POINTS) {
    // 손이 감지되지 않은 경우 0 반환
    return out;
  }

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // 손목~중지MCP 거리 계산 (스케일 기준)
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  const dz = middleMcp.z - wrist.z;
  const scale = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // 스케일이 0에 가까우면 (손이 너무 작거나 접혀있는 경우) 정규화 불가
  if (scale < 1e-6) {
    return out;
  }

  for (let i = 0; i < HAND_POINTS; i++) {
    const point = landmarks[i];
    const base = i * COORDS_PER_POINT;

    // 손목 원점 이동 후 스케일 정규화
    out[base]     = (point.x - wrist.x) / scale;
    out[base + 1] = (point.y - wrist.y) / scale;
    out[base + 2] = (point.z - wrist.z) / scale;
  }

  return out;
}

/**
 * MediaPipe multiHandLandmarks + multiHandedness 결과를 모델 입력용 벡터로 변환한다.
 *
 * @param multiHandLandmarks MediaPipe onResults에서 얻은 손 랜드마크 배열 (0~2개)
 * @param multiHandedness MediaPipe onResults에서 얻은 handedness 배열 (label: "Left" | "Right")
 * @returns FRAME_SIZE(126)개 값의 Float32Array [왼손 63, 오른손 63]
 */
export function preprocessLandmarks(
  multiHandLandmarks: HandLandmark[][] | undefined,
  multiHandedness: Array<{ label: string; score: number }> | undefined
): Float32Array {
  const result = new Float32Array(FRAME_SIZE);

  if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
    return result;
  }

  let leftLandmarks: HandLandmark[] | null = null;
  let rightLandmarks: HandLandmark[] | null = null;

  // handedness label로 좌/우 분류
  // MediaPipe는 카메라 기준(미러)으로 "Left"/"Right"를 표기하므로 그대로 사용
  multiHandLandmarks.forEach((landmarks, idx) => {
    const handedness = multiHandedness?.[idx];
    if (!handedness) return;

    if (handedness.label === "Left") {
      leftLandmarks = landmarks;
    } else if (handedness.label === "Right") {
      rightLandmarks = landmarks;
    }
  });

  // 왼손 데이터: [0, 63)
  const leftData = normalizeSingleHand(leftLandmarks);
  result.set(leftData, 0);

  // 오른손 데이터: [63, 126)
  const rightData = normalizeSingleHand(rightLandmarks);
  result.set(rightData, PER_HAND_SIZE);

  return result;
}
