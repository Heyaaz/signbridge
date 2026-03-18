/**
 * ring-buffer.ts
 *
 * 슬라이딩 윈도우 분류를 위한 순환 버퍼.
 * 최근 30프레임의 정규화된 랜드마크를 고정 크기 배열에 저장한다.
 *
 * 한 프레임 = 126 값 (왼손 21포인트 × 3좌표 + 오른손 21포인트 × 3좌표)
 * 버퍼가 30프레임 미만이면 선두를 0으로 패딩하여 항상 30×126 크기를 반환한다.
 */

/** 윈도우 크기 (프레임 수) */
export const WINDOW_SIZE = 30;

/** 프레임당 특징 값 수 (양손 21포인트 × xyz) */
export const FRAME_SIZE = 126; // 21 * 3 * 2

export class RingBuffer {
  /** 내부 원형 배열 — 각 슬롯은 FRAME_SIZE 길이의 Float32Array */
  private readonly buffer: Float32Array[];
  /** 다음에 쓸 슬롯 인덱스 */
  private writeIndex: number;
  /** 현재 저장된 프레임 수 (WINDOW_SIZE 도달 이후는 항상 WINDOW_SIZE) */
  private count: number;

  constructor() {
    this.buffer = Array.from({ length: WINDOW_SIZE }, () => new Float32Array(FRAME_SIZE));
    this.writeIndex = 0;
    this.count = 0;
  }

  /**
   * 새 프레임을 버퍼에 추가한다.
   * @param frame FRAME_SIZE(126)개 값을 담은 Float32Array
   */
  push(frame: Float32Array): void {
    if (frame.length !== FRAME_SIZE) {
      console.warn(`[RingBuffer] 예상하지 못한 프레임 크기: ${frame.length} (expected ${FRAME_SIZE})`);
      return;
    }

    this.buffer[this.writeIndex].set(frame);
    this.writeIndex = (this.writeIndex + 1) % WINDOW_SIZE;
    if (this.count < WINDOW_SIZE) {
      this.count++;
    }
  }

  /**
   * 현재 윈도우를 WINDOW_SIZE×FRAME_SIZE 크기의 평탄화된 Float32Array로 반환한다.
   *
   * 버퍼에 쌓인 프레임이 WINDOW_SIZE 미만이면 앞쪽을 0으로 패딩한다.
   * 반환 배열 길이는 항상 WINDOW_SIZE * FRAME_SIZE (3780).
   */
  getWindow(): Float32Array {
    const result = new Float32Array(WINDOW_SIZE * FRAME_SIZE);
    const padding = WINDOW_SIZE - this.count;

    for (let i = 0; i < this.count; i++) {
      // 패딩 이후 실제 데이터 시작 위치부터 채움
      const destOffset = (padding + i) * FRAME_SIZE;
      // 순환 버퍼 내 실제 인덱스 계산 (오래된 것부터 순서대로)
      const srcIndex = (this.writeIndex - this.count + i + WINDOW_SIZE) % WINDOW_SIZE;
      result.set(this.buffer[srcIndex], destOffset);
    }

    // padding 구간은 new Float32Array()에 의해 자동으로 0 초기화됨

    return result;
  }

  /** 현재 저장된 프레임 수 */
  get size(): number {
    return this.count;
  }

  /** 버퍼를 비우고 초기 상태로 되돌린다 */
  reset(): void {
    for (const frame of this.buffer) {
      frame.fill(0);
    }
    this.writeIndex = 0;
    this.count = 0;
  }
}
