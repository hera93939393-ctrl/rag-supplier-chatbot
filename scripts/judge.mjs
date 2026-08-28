// 7강: LLM-as-a-Judge. 같은 로컬 모델(qwen3.5:2b)에게 [질문][근거자료][답변]을 다시 보내
// grounded/noHalluc/cited/refusal/score/comment 6개 필드만 JSON으로 받는다.
// 답변 모델과 판정 모델이 같은 2B 모델이라 독립 심사가 아니라 교육용 거친 신호임을 유지한다.
import { chatOnce } from "./ollamaClient.mjs";

export function buildJudgePrompt({ question, chunks, answer }) {
  const evidence = chunks.map((c) => `[${c.id} | ${c.section}] ${c.text}`).join("\n");

  return [
    "당신은 RAG 챗봇 답변의 평가자입니다. 아래 [질문], [근거자료], [답변]을 읽고 다음 기준으로 JSON만 출력합니다.",
    "grounded: 답변 내용이 근거자료에서 나왔는가 (true/false)",
    "noHalluc: 근거에 없는 사실을 지어내지 않았는가 (true/false)",
    "cited: 답변 안에 근거 조각의 [ID] 표시가 있는가 (true/false)",
    "refusal: 근거에 답이 없어서 '없다'고 답한 경우 true, 그 외 false",
    "score: 0-100 정수 (grounded·noHalluc·cited 반영)",
    "comment: 한두 문장 평어 (한국어)",
    '출력 형식: {"grounded":bool,"noHalluc":bool,"cited":bool,"refusal":bool,"score":int,"comment":"..."} — JSON 외 텍스트 금지.',
    "",
    `[질문] ${question}`,
    "",
    `[근거자료] ${evidence || "(검색된 근거 없음)"}`,
    "",
    `[답변] ${answer}`,
  ].join("\n");
}

function normalizeScore(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  // 모델이 가끔 5점 만점처럼 반환하는 경우 100점 만점으로 환산
  if (score <= 5) return Math.round((score / 5) * 100);
  return Math.round(score);
}

export async function runJudge({ question, chunks, answer }) {
  const prompt = buildJudgePrompt({ question, chunks, answer });

  let raw;
  try {
    raw = await chatOnce(prompt, { format: "json", temperature: 0 });
  } catch {
    return { judgeError: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { judgeError: true, raw };
  }

  const requiredBoolFields = ["grounded", "noHalluc", "cited", "refusal"];
  if (requiredBoolFields.some((f) => typeof parsed[f] !== "boolean")) {
    return { judgeError: true, raw };
  }

  const score = normalizeScore(parsed.score);
  if (score === null) return { judgeError: true, raw };

  return {
    judgeError: false,
    grounded: parsed.grounded,
    noHalluc: parsed.noHalluc,
    cited: parsed.cited,
    refusal: parsed.refusal,
    score,
    comment: typeof parsed.comment === "string" ? parsed.comment : "",
  };
}
