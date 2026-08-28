// 브라우저에서 질문을 임베딩한다. 문서 벡터(scripts/embed-docs-browser-path.mjs)와
// 반드시 같은 모델/양자화/pooling/정규화/프리픽스를 써야 검색 점수가 비교 가능하다.
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
export const DTYPE = "q4";
export const QUERY_PREFIX = "task: search result | query: ";
export const EXPECTED_DIM = 768;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

export function getExtractor(onProgress?: (info: unknown) => void) {
  if (!extractorPromise) {
    // 브라우저 WASM ONNX Runtime은 기본 q4 경로(model_q4.onnx)의 GatherBlockQuantized
    // 연산을 지원하지 않는다(강의 4강에서 경고한 정확히 그 오류). model_no_gather_q4
    // 변형 파일을 명시적으로 지정해 우회한다.
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      model_file_name: "model_no_gather_q4",
      dtype: "fp32", // 파일명에 이미 _q4가 포함되어 있으므로 추가 접미사가 붙지 않게 fp32로 지정
      progress_callback: onProgress,
    }) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embedQuery(question: string, onProgress?: (info: unknown) => void): Promise<number[]> {
  const extractor = await getExtractor(onProgress);
  const output = await extractor(QUERY_PREFIX + question, { pooling: "mean", normalize: true });
  const vector = (output.tolist() as number[][])[0];
  if (vector.length !== EXPECTED_DIM) {
    throw new Error(`임베딩 차원이 ${vector.length}입니다. ${EXPECTED_DIM}이어야 합니다.`);
  }
  return vector;
}
