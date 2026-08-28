// 6강: 하이브리드 검색 결과를 답변 생성용 프롬프트로 조립한다.
// 근거 원칙(청크 밖 내용 보태지 않기, [ID] 인용, 약한 근거일 때 보수적 문구)을 여기서 고정한다.

const WEAK_EVIDENCE_NOTICE =
  "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, 근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 없다고 말합니다.";

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

export function buildPrompt({ question, chunks, weakEvidence, kstNow }) {
  const lines = [];
  lines.push(
    "다음 자료는 공공급식통합플랫폼(NeaT)에 게시된 '공급업체 서류심사 세부기준' 공개 매뉴얼에서 뽑은 조각입니다."
  );
  if (weakEvidence) {
    lines.push(WEAK_EVIDENCE_NOTICE);
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
