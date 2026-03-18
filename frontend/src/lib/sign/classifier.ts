/**
 * classifier.ts
 *
 * TF.js GraphModel 기반 수화 분류기.
 * - 모델 경로: /models/sign/model.json (public 디렉토리)
 * - 레이블 경로: /models/sign/labels.json
 *
 * 모델 파일이 없는 경우에는 경고만 출력하고 null을 반환하여
 * 나머지 기능이 정상 동작할 수 있도록 graceful 처리한다.
 *
 * 사용 방법:
 *   const classifier = new SignClassifier();
 *   await classifier.load();
 *   const result = await classifier.classify(windowData);
 *   classifier.dispose();
 */

/** 분류 결과 타입 */
export interface ClassifyResult {
  /** 인식된 수화 레이블 */
  label: string;
  /** 신뢰도 (0.0 ~ 1.0) */
  confidence: number;
}

/** TF.js GraphModel 최소 타입 정의 (동적 import 후 사용) */
interface TfGraphModel {
  predict(input: unknown): TfTensor;
  dispose(): void;
}

interface TfTensor {
  data(): Promise<Float32Array>;
  dispose(): void;
}

const MODEL_URL = "/models/sign/model.json";
const LABELS_URL = "/models/sign/labels.json";

export class SignClassifier {
  private model: TfGraphModel | null = null;
  private labels: string[] = [];
  /** 모델 로드 성공 여부 */
  private isLoaded = false;

  /**
   * 모델과 레이블을 로드한다.
   * 파일이 없거나 로드 실패 시 경고만 출력하고 isLoaded = false로 유지한다.
   */
  async load(): Promise<void> {
    try {
      // TF.js는 수화 모드 진입 시에만 동적 import (번들 초기 로드 방지)
      const tf = await import("@tensorflow/tfjs");

      // 레이블 먼저 로드 (모델보다 빠르고 실패 가능성 적음)
      let loadedLabels: string[] = [];
      try {
        const labelsResponse = await fetch(LABELS_URL);
        if (labelsResponse.ok) {
          loadedLabels = (await labelsResponse.json()) as string[];
        } else {
          console.warn(`[SignClassifier] 레이블 파일을 찾을 수 없습니다: ${LABELS_URL}`);
        }
      } catch {
        console.warn(`[SignClassifier] 레이블 로드 실패: ${LABELS_URL}`);
      }

      // 모델 로드
      const loadedModel = await tf.loadGraphModel(MODEL_URL);
      this.model = loadedModel as unknown as TfGraphModel;
      this.labels = loadedLabels;
      this.isLoaded = true;

      console.info(`[SignClassifier] 모델 로드 완료. 레이블 수: ${this.labels.length}`);
    } catch (error) {
      // 모델 파일이 없는 경우(404) 혹은 네트워크 오류 — 정상 동작에 영향 없음
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[SignClassifier] 모델 로드 실패 (분류 비활성화): ${message}`);
      this.isLoaded = false;
    }
  }

  /**
   * 슬라이딩 윈도우 데이터를 분류한다.
   *
   * @param windowData WINDOW_SIZE × FRAME_SIZE (3780) 크기의 Float32Array
   * @returns 분류 결과 또는 null (모델 미로드 시)
   */
  async classify(windowData: Float32Array): Promise<ClassifyResult | null> {
    if (!this.isLoaded || !this.model) {
      return null;
    }

    let outputTensor: TfTensor | null = null;
    let inputTensor: unknown = null;

    try {
      const tf = await import("@tensorflow/tfjs");

      // 모델 입력 형태: [1, WINDOW_SIZE, FRAME_SIZE] = [1, 30, 126]
      inputTensor = tf.tensor3d(windowData, [1, 30, 126]);
      outputTensor = this.model.predict(inputTensor) as TfTensor;

      const probabilities = await outputTensor.data();
      const maxIdx = probabilities.reduce(
        (bestIdx, prob, idx) => (prob > probabilities[bestIdx] ? idx : bestIdx),
        0
      );

      const confidence = probabilities[maxIdx] ?? 0;
      const label = this.labels[maxIdx] ?? `class_${maxIdx}`;

      return { label, confidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[SignClassifier] 추론 실패: ${message}`);
      return null;
    } finally {
      // 텐서 메모리 해제 (TF.js는 수동 해제 필요)
      if (outputTensor) {
        outputTensor.dispose();
      }
      if (inputTensor && typeof (inputTensor as TfTensor).dispose === "function") {
        (inputTensor as TfTensor).dispose();
      }
    }
  }

  /** 모델 메모리를 해제한다 */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isLoaded = false;
    this.labels = [];
  }

  /** 모델이 성공적으로 로드되었는지 여부 */
  get loaded(): boolean {
    return this.isLoaded;
  }
}
