# 공급업체 서류심사 안내 챗봇

공공급식통합플랫폼(NeaT)에 게시된 "[매뉴얼] 공급업체 서류심사 세부기준 안내"(게시글 80068)를 근거로,
질문에 근거 청크를 인용해 답하고 판정(judge)까지 붙는 RAG 챗봇 프로젝트. PRD는 [PRD.md](./PRD.md) 참고.

## 파이프라인 구성 (2~7강)

| 단계 | 파일 |
|---|---|
| 자료/청크 | [data/chunks.json](./data/chunks.json) (33개, SUP-001~048) |
| 임베딩/벡터스토어 | [scripts/embed-docs-browser-path.mjs](./scripts/embed-docs-browser-path.mjs) → [public/data/supplier-docs.json](./public/data/supplier-docs.json) |
| 하이브리드 검색 | [scripts/search.mjs](./scripts/search.mjs) (cosine top-10 + BM25 top-5) |
| 프롬프트 조립 | [scripts/buildPrompt.mjs](./scripts/buildPrompt.mjs) |
| 로컬 LLM 스트리밍 | [scripts/ollamaClient.mjs](./scripts/ollamaClient.mjs) (qwen3.5:2b) |
| LLM-as-a-Judge | [scripts/judge.mjs](./scripts/judge.mjs) |
| end-to-end CLI | [scripts/rag_cli.mjs](./scripts/rag_cli.mjs) |

## 8강 실험 기록 — 루브릭으로 프롬프트 실험 한 바퀴

### 루브릭 (judge 필드와 연결)

| 지표 | 측정 방법 |
|---|---|
| 출처를 인용한 답변 | `cited:true` 답 수 / 9 |
| 도메인 밖 질문의 거부 | 무근거 질문(Q7~Q9) 중 `refusal:true` 수 / 3 |
| 근거성 | 전체 9문항 중 `grounded:true` 비율 |
| 짧은 답변의 근거 유지 | weakEvidence 문항(Q4,Q7,Q8,Q9)의 답변 길이·문구 일관성 |

### 고정 질문 세트 (Q1~Q9, 두 실행에서 동일)

- 정상: Q1 차량보험가입증권 승인불가서류 / Q2 건강진단결과서 유효기간 / Q3 전남 4개지역 주취급품목 제한
- 경계: Q4 내일 날씨 / Q5 이 회사 주식 사도 될까 / Q6 다른 유통 플랫폼에도 적용되나
- 무근거: Q7 저녁 메뉴 / Q8 파이썬 정렬 알고리즘 / Q9 드라마 추천

### 바꾼 변수 (한 번에 하나만)

7강에서 "내일 날씨 어때?"에 모델이 거절 대신 숫자를 지어낸 실패를 관찰했다. 이 한 가지만 겨냥해
`buildPrompt.mjs`의 **약한 근거(weakEvidence) 안내 문구**만 바꿨다 (검색 설정, top-k, [ID] 규칙 등은 그대로).

- baseline: `WEAK_EVIDENCE_NOTICE_BASELINE` — "근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 없다고 말합니다."
- strict: `WEAK_EVIDENCE_NOTICE_STRICT` — 숫자/날짜 추론 금지 + 정확한 거절 문장("매뉴얼에서 확인되지 않습니다.")을 명시

### 결과 — weakEvidence=true인 4문항(Q4,Q7,Q8,Q9)만 실제로 문구가 바뀐 대상

| 문항 | baseline 답변 | baseline judge | strict 답변 | strict judge |
|---|---|---|---|---|
| Q4 내일 날씨 | "제공된 자료에 해당 주제가 포함되어 있지 않습니다." (28자) | refusal:T, score:0 | "매뉴얼에서 확인되지 않습니다." (16자) | refusal:T, score:20 |
| Q7 저녁 메뉴 | "[자료에 명시된 사항과 질문의 목적에는 관계 없음.]" (29자) | refusal:T, score:20 | "매뉴얼에서 확인되지 않습니다." (16자) | refusal:T, score:20 |
| Q8 정렬 알고리즘 | **[SUP-045 소독필증] 내용으로 엉뚱하게 답함** (33자) | **refusal:F**, grounded:T(오판), score:85 | "매뉴얼에서 확인되지 않습니다." (16자) | refusal:T, score:20 |
| Q9 드라마 추천 | "자료에 대한 근거는 없습니다..." (80자) | refusal:T, score:20 | "매뉴얼에서 확인되지 않습니다." (16자) | refusal:T, score:20 |

**무근거 질문(Q7~Q9) 거부율**: baseline 2/3(Q8 실패) → strict **3/3**
**weakEvidence 4문항 답변 문구 일관성**: baseline 4종류 제각각(28~80자) → strict **4/4 동일 문장(16자)**

Q8은 baseline에서 완전히 무관한 청크(소독필증)를 근거인 척 인용해 grounded:true(85점)라는 잘못된 고득점을 받았던
실패 사례였는데, strict 문구에서는 정확히 거절로 고쳐졌다. **이번 실험에서 가장 명확한 개선.**

### 방법론적 한계 — 이번 실험에서 스스로 발견한 결함

Q1,Q2,Q3,Q5,Q6은 `weakEvidence=false`라 애초에 바뀐 문구를 프롬프트에서 본 적이 없다. 그런데도 baseline→strict
사이에 Q1의 `cited`(true→false), Q6의 `grounded`(true→false) 값이 흔들렸다. 원인은 `ollamaClient.mjs`의
스트리밍 생성 호출(`streamChat`)이 온도(temperature)를 고정하지 않아 실행마다 표현이 조금씩 달라지기 때문이다
(judge 호출인 `chatOnce`만 `temperature:0`으로 고정돼 있었음). 즉 **이 다섯 문항의 변화는 바꾼 변수(문구) 때문이
아니라 생성 자체의 무작위성**이며, 결과에 섞어 해석하면 안 된다. 다음 실험 라운드에서는 `streamChat`에도
`temperature:0`(또는 고정 seed)을 걸어 weakEvidence=false 문항까지 깨끗하게 비교할 수 있게 고칠 것.

### 다음 결정

1. `WEAK_EVIDENCE_NOTICE_STRICT`를 기본값으로 채택 — Q8 실패를 실제로 고쳤고, weakEvidence 문항의 답변이
   예측 가능해져 UI에서 "약한 근거 경고" 배지와 답변 문구를 일관되게 매칭시키기 쉬워짐.
2. 다음 라운드 실험 전에 `streamChat`도 `temperature:0`으로 고정해 정상/경계(Q1,Q2,Q3,Q5,Q6) 문항까지
   깨끗하게 비교 가능하게 만들 것.
3. Q5("주식 사도 될까")는 두 설정 모두 score 20~50 사이에 머물러 있어 — refusal 여부가 문구 하나로는 완전히
   안정되지 않는 남은 경계 사례. 별도 후속 실험 대상으로 남김.

원본 실행 로그: [experiments/baseline.json](./experiments/baseline.json), [experiments/strict-wording.json](./experiments/strict-wording.json)
