// 5강 실습 4: 하이브리드 검색(vector top-10 + BM25 top-5)이 실제로
// 4강 스팟체크에서 근소하게 틀렸던 사례(사업자등록증 vs 등기부등본)를 개선하는지 확인한다.
import { pipeline } from "@huggingface/transformers";
import { readFile } from "node:fs/promises";
import { hybridSearch, buildBm25Index } from "./search.mjs";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const DTYPE = "q4";
const QUERY_PREFIX = "task: search result | query: ";

const TEST_QUESTIONS = [
  "사업자등록증 확인할 때 필요한 항목이 뭐야?",
  "사업자등록증 필수서류 항목 알려줘",
  "차량보험가입증권에서 승인 불가한 서류 종류는?",
  "내일 서울 날씨 어때?",
  "이 회사 주식 지금 사도 될까?",
];

async function main() {
  const raw = await readFile(new URL("../public/data/supplier-docs.json", import.meta.url), "utf-8");
  const store = JSON.parse(raw);
  const bm25Index = buildBm25Index(store.chunks);

  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });

  for (const q of TEST_QUESTIONS) {
    const output = await extractor(QUERY_PREFIX + q, { pooling: "mean", normalize: true });
    const qVec = output.tolist()[0];

    const { results, weakEvidence, topScore } = hybridSearch(qVec, q, store.chunks, bm25Index);
    const top5 = results.sort((a, b) => b.score - a.score).slice(0, 5);

    console.log(`\n질문: ${q}`);
    console.log(`  topScore=${topScore.toFixed(3)} weakEvidence=${weakEvidence}`);
    top5.forEach((r, i) =>
      console.log(`  ${i + 1}. [${r.method}] ${r.chunk.id} (score=${r.score.toFixed(3)}) ${r.chunk.section}`)
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
