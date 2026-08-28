// 6강 end-to-end 확인: 질문 -> 하이브리드 검색 -> 프롬프트 조립 -> Ollama 스트리밍 답변.
import { pipeline } from "@huggingface/transformers";
import { readFile } from "node:fs/promises";
import { hybridSearch, buildBm25Index } from "./search.mjs";
import { buildPrompt, formatKstNow } from "./buildPrompt.mjs";
import { checkOllamaStatus, streamChat } from "./ollamaClient.mjs";
import { runJudge } from "./judge.mjs";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const DTYPE = "q4";
const QUERY_PREFIX = "task: search result | query: ";
const TOP_N_FOR_PROMPT = 5;

const question = process.argv[2] || "차량보험가입증권에서 승인 불가한 서류 종류는?";

async function main() {
  const status = await checkOllamaStatus();
  console.log("Ollama 상태:", status);
  if (!status.online) throw new Error("Ollama가 응답하지 않습니다.");
  if (!status.hasModel) throw new Error("qwen3.5:2b 모델이 없습니다.");

  const raw = await readFile(new URL("../public/data/supplier-docs.json", import.meta.url), "utf-8");
  const store = JSON.parse(raw);
  const bm25Index = buildBm25Index(store.chunks);

  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });
  const output = await extractor(QUERY_PREFIX + question, { pooling: "mean", normalize: true });
  const qVec = output.tolist()[0];

  const { results, weakEvidence, topScore } = hybridSearch(qVec, question, store.chunks, bm25Index);
  const topChunks = results
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N_FOR_PROMPT)
    .map((r) => r.chunk);

  console.log(`\n질문: ${question}`);
  console.log(`topScore=${topScore.toFixed(3)} weakEvidence=${weakEvidence}`);
  console.log("근거 청크:", topChunks.map((c) => c.id).join(", "));

  const prompt = buildPrompt({
    question,
    chunks: topChunks,
    weakEvidence,
    kstNow: formatKstNow(),
  });

  console.log("\n--- 답변 스트리밍 시작 ---");
  let answer = "";
  const start = Date.now();
  for await (const piece of streamChat(prompt)) {
    process.stdout.write(piece);
    answer += piece;
  }
  const elapsedMs = Date.now() - start;
  console.log(`\n--- 답변 스트리밍 종료 (${elapsedMs}ms, ${answer.length}자) ---`);

  console.log("\n--- 판정(judge) 요청 ---");
  const judgeStart = Date.now();
  const verdict = await runJudge({ question, chunks: topChunks, answer });
  console.log(`판정 결과 (${Date.now() - judgeStart}ms):`, verdict);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
