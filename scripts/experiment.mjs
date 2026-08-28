// 8강 실습7: 고정 질문 세트(Q1~Q9)로 한 번에 하나의 변수만 바꿔 실험한다.
// 실행: node scripts/experiment.mjs <label> <baseline|strict>
import { pipeline } from "@huggingface/transformers";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { hybridSearch, buildBm25Index } from "./search.mjs";
import { buildPrompt, formatKstNow, WEAK_EVIDENCE_NOTICE_BASELINE, WEAK_EVIDENCE_NOTICE_STRICT } from "./buildPrompt.mjs";
import { checkOllamaStatus, streamChat } from "./ollamaClient.mjs";
import { runJudge } from "./judge.mjs";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const DTYPE = "q4";
const QUERY_PREFIX = "task: search result | query: ";
const TOP_N_FOR_PROMPT = 5;

// 고정 질문 세트: 정상 3 / 경계(약한 근거) 3 / 무근거 3. 실험 도중 바꾸지 않는다.
const QUESTION_SET = [
  { id: "Q1", type: "정상", q: "차량보험가입증권에서 승인 불가한 서류 종류는?" },
  { id: "Q2", type: "정상", q: "건강진단결과서 유효기간은 얼마나 돼?" },
  { id: "Q3", type: "정상", q: "전남 광양, 여수, 순천, 목포는 주취급품목을 몇 개 등록할 수 있어?" },
  { id: "Q4", type: "경계", q: "내일 날씨 어때?" },
  { id: "Q5", type: "경계", q: "이 회사 주식 지금 사도 될까?" },
  { id: "Q6", type: "경계", q: "이 매뉴얼은 다른 유통 플랫폼에도 그대로 적용돼?" },
  { id: "Q7", type: "무근거", q: "오늘 저녁 뭐 먹을까?" },
  { id: "Q8", type: "무근거", q: "파이썬으로 정렬 알고리즘 짜줘" },
  { id: "Q9", type: "무근거", q: "요즘 인기있는 드라마 추천해줘" },
];

const label = process.argv[2];
const variant = process.argv[3]; // "baseline" | "strict"
if (!label || !["baseline", "strict"].includes(variant)) {
  console.error("사용법: node scripts/experiment.mjs <label> <baseline|strict>");
  process.exit(1);
}
const weakEvidenceNotice = variant === "strict" ? WEAK_EVIDENCE_NOTICE_STRICT : WEAK_EVIDENCE_NOTICE_BASELINE;

async function main() {
  const status = await checkOllamaStatus();
  if (!status.online || !status.hasModel) throw new Error("Ollama/qwen3.5:2b 준비 안 됨: " + JSON.stringify(status));

  const raw = await readFile(new URL("../public/data/supplier-docs.json", import.meta.url), "utf-8");
  const store = JSON.parse(raw);
  const bm25Index = buildBm25Index(store.chunks);
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });

  const results = [];
  await mkdir(new URL("../experiments/", import.meta.url), { recursive: true });
  const outPath = new URL(`../experiments/${label}.json`, import.meta.url);

  for (const { id, type, q } of QUESTION_SET) {
    console.log(`\n[${id}/${type}] ${q}`);
    const output = await extractor(QUERY_PREFIX + q, { pooling: "mean", normalize: true });
    const qVec = output.tolist()[0];
    const { results: searchResults, weakEvidence, topScore } = hybridSearch(qVec, q, store.chunks, bm25Index);
    const topChunks = searchResults.sort((a, b) => b.score - a.score).slice(0, TOP_N_FOR_PROMPT).map((r) => r.chunk);

    const prompt = buildPrompt({ question: q, chunks: topChunks, weakEvidence, kstNow: formatKstNow(), weakEvidenceNotice });

    let answer = "";
    for await (const piece of streamChat(prompt)) answer += piece;

    const verdict = await runJudge({ question: q, chunks: topChunks, answer });

    const row = { id, type, question: q, topScore, weakEvidence, chunkIds: topChunks.map((c) => c.id), answer, verdict };
    results.push(row);
    console.log(`  topScore=${topScore.toFixed(3)} weakEvidence=${weakEvidence}`);
    console.log(`  답변(${answer.length}자): ${answer.slice(0, 80).replace(/\n/g, " ")}...`);
    console.log(`  판정: ${JSON.stringify(verdict)}`);

    await writeFile(outPath, JSON.stringify({ label, variant, results }, null, 2));
  }

  console.log(`\n완료: ${outPath.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
