# 공급업체 서류심사 안내 챗봇

공공급식통합플랫폼(NeaT)에 게시된 "[매뉴얼] 공급업체 서류심사 세부기준 안내"(게시글 80068)를 근거로,
질문에 근거 청크를 인용해 답하고 판정(judge)과 사람 피드백(👍/👎)까지 함께 남기는 RAG 챗봇 프로젝트.
PRD는 [PRD.md](./PRD.md) 참고.

## 배포 주소

**https://hera93939393-ctrl.github.io/rag-supplier-chatbot/**

### 사용 조건 (반드시 확인)

이 페이지는 정적 파일만 배포된 것이며, 답변은 서버가 아니라 **방문자 본인 컴퓨터의 로컬 Ollama**가 생성합니다.
아래 조건이 갖춰지지 않으면 화면은 열려도 답변은 나오지 않습니다.

1. **Ollama가 이 컴퓨터에서 실행 중**이어야 하고, `qwen3.5:2b` 모델이 받아져 있어야 합니다 (`ollama pull qwen3.5:2b`).
2. Ollama가 이 배포 주소의 요청을 허용하도록 **`OLLAMA_ORIGINS`에 `https://hera93939393-ctrl.github.io`를 추가**한 뒤
   Ollama를 재시작해야 합니다 (Windows: `setx OLLAMA_ORIGINS "https://hera93939393-ctrl.github.io"`).
3. **Chrome/Edge 130 이상**에서는 HTTPS 페이지가 `localhost`를 호출할 때 브라우저가 별도로
   **"로컬 네트워크 액세스" 권한**을 요구합니다(Local Network Access, 이전 명칭 Private Network Access).
   실제로 이 권한이 없으면 `TypeError: Failed to fetch`로 실패하는 것을 확인했습니다. 해결 방법:
   ① 배포 주소를 Chrome에서 열고 ② 주소창 왼쪽 **자물쇠(사이트 정보) 아이콘** 클릭 ③ **"로컬 네트워크 액세스"**를
   "차단"/"확인"에서 **"허용"**으로 변경 ④ 페이지 새로고침. 이 조건은 강의 6강 본문에는 없지만
   실제 배포·테스트 과정에서 발견해 추가한 조건입니다.
4. **첫 방문 시 임베딩 모델(약 200MB)을 내려받습니다.** 상태 배지에 진행률이 표시됩니다.
5. Safari는 Ollama 연결과 임베딩 WASM 실행이 불안정할 수 있어 Chrome/Edge를 권장합니다.

## 파이프라인 구성

| 단계 | Node/CLI (2~8강 검증용) | 브라우저 앱 (9강 배포) |
|---|---|---|
| 자료/청크 | [data/chunks.json](./data/chunks.json) (33개, SUP-001~048) | 동일 |
| 임베딩/벡터스토어 | [scripts/embed-docs-browser-path.mjs](./scripts/embed-docs-browser-path.mjs) → [public/data/supplier-docs.json](./public/data/supplier-docs.json) | [src/lib/embeddings.ts](./src/lib/embeddings.ts) (질의 임베딩, `model_no_gather_q4` WASM 우회) |
| 하이브리드 검색 | [scripts/search.mjs](./scripts/search.mjs) | [src/lib/search.ts](./src/lib/search.ts) |
| 프롬프트 조립 | [scripts/buildPrompt.mjs](./scripts/buildPrompt.mjs) | [src/lib/buildPrompt.ts](./src/lib/buildPrompt.ts) |
| 로컬 LLM 스트리밍 | [scripts/ollamaClient.mjs](./scripts/ollamaClient.mjs) | [src/lib/ollamaClient.ts](./src/lib/ollamaClient.ts) |
| LLM-as-a-Judge | [scripts/judge.mjs](./scripts/judge.mjs) | [src/lib/judge.ts](./src/lib/judge.ts) |
| UI | — | [src/App.tsx](./src/App.tsx) |
| end-to-end 실험 | [scripts/rag_cli.mjs](./scripts/rag_cli.mjs), [scripts/experiment.mjs](./scripts/experiment.mjs) | — |

브라우저 앱은 CLI에서 검증한 것과 동일한 검색·프롬프트·판정 로직을 TypeScript로 그대로 옮긴 것이며,
실제 배포 주소에서 정상 질문/약한근거 질문 모두 검색→스트리밍→판정까지 end-to-end로 확인했다
(아래 "9강 배포 검증" 절 참고).

## 로컬 개발

```
npm install
npm run embed-docs   # data/chunks.json -> public/data/supplier-docs.json
npm run dev          # http://localhost:5173
npm run build        # dist/ 생성
npm run deploy        # gh-pages -d dist (GitHub Pages 배포)
```

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

## 배포 후 수용 기준 재확인

**기준(PRD.md 수용 기준)**: 고정 질문 Q1~Q9(정상 3·경계 3·무근거 3) 중 최소 7개는
"근거 있는 정답(grounded:true)" 또는 "정당한 거절(refusal:true)" 중 하나여야 한다.
(정당한 거절도 실패가 아니라 성공으로 센다 — 8강에서 다룬 대로, 이 챗봇은 근거 없이 답하지 않는 것이
목표이지 무조건 답하는 것이 목표가 아니기 때문.)

**측정**: 현재 배포본이 기본값으로 쓰는 설정([experiments/strict-wording.json](./experiments/strict-wording.json), 8강에서 채택된 strict 문구) 그대로 재검토.

| 질문 | 유형 | grounded | refusal | score | 판정 |
|---|---|---|---|---|---|
| Q1 사업자등록증 확인항목 | 정상 | true | false | 60 | ✅ |
| Q2 건강진단결과서 유효기간 | 정상 | true | false | 90 | ✅ |
| Q3 전남 4개지역 주취급품목 | 정상 | true | false | 90 | ✅ |
| Q4 내일 날씨 | 경계 | false | true | 20 | ✅ (정당한 거절) |
| Q5 주식 사도 될까 | 경계 | false | true | 20 | ✅ (정당한 거절) |
| Q6 다른 유통 플랫폼 적용 | 경계 | false | false | 20 | ❌ |
| Q7 저녁 메뉴 | 무근거 | false | true | 20 | ✅ (정당한 거절) |
| Q8 정렬 알고리즘 | 무근거 | false | true | 20 | ✅ (정당한 거절) |
| Q9 드라마 추천 | 무근거 | false | true | 20 | ✅ (정당한 거절) |

**결과: 9개 중 8개 통과 (기준 7개 이상 충족).** 유일한 실패는 Q6("이 매뉴얼은 다른 유통 플랫폼에도
적용돼?")로, grounded도 refusal도 아닌 애매한 답변을 냈다. 이 질문은 매뉴얼이 명시적으로 답하지 않는
정책적 해석 질문이라, 다음 개선 후보는 "매뉴얼이 명시하지 않은 정책적 판단 질문"을 무근거 질문과 같은
분기로 처리하도록 프롬프트에 세 번째 사례를 추가하는 것이다(현재는 도메인 밖/약한근거 두 갈래만 있음).

## 9강 배포 검증

CLI(scripts/rag_cli.mjs)에서 검증한 것과 같은 로직을 브라우저(src/lib/*)로 옮긴 뒤, 실제 배포 주소에서
로컬 Ollama와 연결해 직접 확인한 결과.

| 확인 항목 | 결과 |
|---|---|
| 자산 로드 (base:'./', GitHub Pages 하위 경로) | dist/index.html이 `./assets/...` 상대경로로 정상 로드됨 |
| 브라우저 임베딩 (WASM) | 기본 `pipeline()`은 강의 4강이 경고한 `GatherBlockQuantized` 오류로 실패 → `model_file_name:"model_no_gather_q4"` + `dtype:"fp32"`로 우회, 768차원 확인 |
| 정상 질문 ("사업자등록증 확인할 때 필요한 항목이 뭐야?") | 검색 top: bm25 SUP-003(1.00), vector SUP-035(0.81)/SUP-029(0.79) — 답변이 SUP-029 인용, judge: grounded:true noHalluc:true score:60 |
| 약한근거 질문 ("내일 날씨 어때?") | topScore 0.48 → weakEvidence 배지 표시, 답변 "매뉴얼에서 확인되지 않습니다."(8강에서 채택한 strict 문구 그대로), judge: refusal:true grounded:false score:20 |
| CORS / OLLAMA_ORIGINS | 배포 직후 `OLLAMA_ORIGINS` 미설정 상태에서는 연결 실패 확인 → 설정 후 재시작하니 `Access-Control-Allow-Origin` 헤더로 정상 허용 확인(`curl -H "Origin: https://hera93939393-ctrl.github.io"`) |
| Chrome Local Network Access | CORS를 고쳐도 여전히 `ERR_BLOCKED_BY_CLIENT`로 막힘 → 조사 결과 Chrome/Edge 130+의 Private Network Access 정책(HTTPS 사이트의 localhost 요청은 별도 권한 필요)임을 확인. 강의 6강 본문에는 없던 조건이라 위 "사용 조건"에 추가 |
| 오류 시 상태 유지 | 스트리밍/판정 오류가 나도 이미 받은 답변·출처 칩이 지워지지 않는 것을 코드로 확인(catch에서 answer/sources를 초기화하지 않음) |
