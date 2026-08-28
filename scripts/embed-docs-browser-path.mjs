// 4강: 공급업체 서류심사 청크(data/chunks.json)를 브라우저 RAG용 벡터스토어로 변환한다.
// 모델/양자화/pooling/정규화를 문서 임베딩과 질의 임베딩(런타임)에서 반드시 동일하게 맞춰야 한다.
import { pipeline } from "@huggingface/transformers";
import { readFile, writeFile } from "node:fs/promises";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const DTYPE = "q4";
const EXPECTED_DIM = 768;

// EmbeddingGemma 공식 모델카드 규정: 문서/질의에 서로 다른 프리픽스를 붙여야 검색 품질이 보장된다.
const DOC_PREFIX = "title: none | text: ";

async function main() {
  const raw = await readFile(new URL("../data/chunks.json", import.meta.url), "utf-8");
  const { source, chunks } = JSON.parse(raw);

  console.log(`모델 로드 중: ${MODEL_ID} (dtype=${DTYPE})`);
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });

  const texts = chunks.map((c) => DOC_PREFIX + c.text);
  const output = await extractor(texts, { pooling: "mean", normalize: true });

  const vectors = output.tolist();
  if (vectors.length !== chunks.length) {
    throw new Error(`청크 수(${chunks.length})와 벡터 수(${vectors.length})가 다릅니다.`);
  }

  const withVectors = chunks.map((c, i) => {
    const vector = vectors[i];
    if (vector.length !== EXPECTED_DIM) {
      throw new Error(`${c.id}: 벡터 차원이 ${vector.length}입니다. ${EXPECTED_DIM}이어야 합니다.`);
    }
    return { id: c.id, text: c.text, url: c.url, section: c.section, page: c.page, vector };
  });

  const store = {
    source: {
      ...source,
      embeddingModel: MODEL_ID,
      dtype: DTYPE,
      pooling: "mean",
      normalize: true,
      docPrefix: DOC_PREFIX,
      dim: EXPECTED_DIM,
    },
    chunks: withVectors,
  };

  const outPath = new URL("../public/data/supplier-docs.json", import.meta.url);
  await writeFile(outPath, JSON.stringify(store));
  console.log(`완료: ${withVectors.length}개 청크, ${EXPECTED_DIM}차원 벡터 -> public/data/supplier-docs.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
