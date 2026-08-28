// 4강 실습: 벡터스토어가 실제로 관련 청크를 상위로 올리는지 스팟체크한다.
// (강의 예시는 check_retrieval.py지만, 이 프로젝트는 Node 스택으로 통일해 .mjs로 작성)
import { pipeline } from "@huggingface/transformers";
import { readFile } from "node:fs/promises";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const DTYPE = "q4";
const QUERY_PREFIX = "task: search result | query: ";

const TEST_QUESTIONS = [
  { q: "사업자등록증 확인할 때 필요한 항목이 뭐야?", inDomain: true },
  { q: "차량보험가입증권에서 승인 불가한 서류 종류는?", inDomain: true },
  { q: "부산 지역 생산물배상책임보험 보상한도 기준은?", inDomain: true },
  { q: "전남 광양, 여수, 순천, 목포는 주취급품목을 몇 개 등록할 수 있어?", inDomain: true },
  { q: "건강진단결과서 유효기간은 얼마나 돼?", inDomain: true },
  { q: "내일 서울 날씨 어때?", inDomain: false },
  { q: "이 회사 주식 지금 사도 될까?", inDomain: false },
];

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function main() {
  const raw = await readFile(new URL("../public/data/supplier-docs.json", import.meta.url), "utf-8");
  const store = JSON.parse(raw);

  if (store.source.embeddingModel !== MODEL_ID || store.source.dtype !== DTYPE) {
    throw new Error("벡터스토어 생성에 쓰인 모델/dtype이 질의 임베딩 설정과 다릅니다.");
  }

  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });

  for (const { q, inDomain } of TEST_QUESTIONS) {
    const output = await extractor(QUERY_PREFIX + q, { pooling: "mean", normalize: true });
    const qVec = output.tolist()[0]; // output shape [1, 768] -> 배치 차원을 벗겨 평평한 벡터로

    const scored = store.chunks
      .map((c) => ({ id: c.id, section: c.section, score: dot(qVec, c.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log(`\n[${inDomain ? "도메인 내" : "도메인 밖"}] ${q}`);
    scored.forEach((s, i) => console.log(`  top-${i + 1}: ${s.id} (score=${s.score.toFixed(3)}) ${s.section}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
