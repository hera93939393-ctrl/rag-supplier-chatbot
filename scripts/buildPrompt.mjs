// 6강: 하이브리드 검색 결과를 답변 생성용 프롬프트로 조립한다.
// 근거 원칙(청크 밖 내용 보태지 않기, [ID] 인용, 약한 근거일 때 보수적 문구)을 여기서 고정한다.

export const WEAK_EVIDENCE_NOTICE_BASELINE =
  "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, 근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 없다고 말합니다.";

// 8강 실험 변수: 7강에서 관찰한 실패(약한 근거인데도 숫자를 조합해 답을 지어냄)를 겨냥해
// "추측 금지 + 정해진 거절 문장"을 더 직접적으로 지시하는 강화판.
export const WEAK_EVIDENCE_NOTICE_STRICT =
  "주의: 검색된 조각의 유사도가 낮습니다(질문과 맞지 않는 근거일 가능성이 높음). " +
  "근거 조각 안에 질문에 대한 직접적인 사실이 없다면, 숫자·날짜·기간 등 어떤 값도 추론하거나 조합하지 말고, " +
  "반드시 정확히 이 문장으로만 답합니다: \"매뉴얼에서 확인되지 않습니다.\"";

export function formatKstNow(date = new Date()) {
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

// 8강 실험 결과 채택: strict 문구가 무근거 질문 거부율(2/3->3/3)과 약한근거 답변의
// 문구 일관성을 실제로 개선했으므로 기본값으로 삼는다. (README.md 실험 기록 참고)
export function buildPrompt({ question, chunks, weakEvidence, kstNow, weakEvidenceNotice = WEAK_EVIDENCE_NOTICE_STRICT }) {
  const lines = [];
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
