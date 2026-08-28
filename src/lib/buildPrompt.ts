// 6강 프롬프트 조립을 브라우저용 TS로 이식 (scripts/buildPrompt.mjs와 로직 동일).
import type { Chunk } from "./types";

export const WEAK_EVIDENCE_NOTICE_BASELINE =
  "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, 근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 없다고 말합니다.";

// 8강 실험에서 채택: 무근거 질문 거부율(2/3->3/3)을 실제로 개선한 강화판 문구를 기본값으로 쓴다.
export const WEAK_EVIDENCE_NOTICE_STRICT =
  "주의: 검색된 조각의 유사도가 낮습니다(질문과 맞지 않는 근거일 가능성이 높음). " +
  "근거 조각 안에 질문에 대한 직접적인 사실이 없다면, 숫자·날짜·기간 등 어떤 값도 추론하거나 조합하지 말고, " +
  '반드시 정확히 이 문장으로만 답합니다: "매뉴얼에서 확인되지 않습니다."';

export function formatKstNow(date: Date = new Date()): string {
  const kst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).format(date);
  return `${kst} KST`;
}

export interface BuildPromptArgs {
  question: string;
  chunks: Chunk[];
  weakEvidence: boolean;
  kstNow: string;
  weakEvidenceNotice?: string;
}

export function buildPrompt({
  question,
  chunks,
  weakEvidence,
  kstNow,
  weakEvidenceNotice = WEAK_EVIDENCE_NOTICE_STRICT,
}: BuildPromptArgs): string {
  const lines: string[] = [];
  lines.push(
    "다음 자료는 공공급식통합플랫폼(NeaT)에 게시된 '공급업체 서류심사 세부기준' 공개 매뉴얼에서 뽑은 조각입니다."
  );
  if (weakEvidence) {
    lines.push(weakEvidenceNotice);
  }
  lines.push("근거가 된 조각의 [ID]를 답 안에서 표시합니다.");
  lines.push(
    `현재 시각은 ${kstNow}입니다. '지금', '올해', '다음 주' 같은 상대 표현은 이 시각을 기준으로 해석합니다.`
  );
  lines.push("자료에 없는 내용은 추측하지 말고 매뉴얼에서 확인되지 않는다고 답합니다.");
  lines.push("");
  lines.push("[자료]");
  for (const c of chunks) {
    lines.push(`[${c.id} | ${c.section}] ${c.text}`);
  }
  lines.push("");
  lines.push("[질문]");
  lines.push(question);

  return lines.join("\n");
}
