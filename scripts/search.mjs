// 5강: 코사인 유사도(의미) + BM25(정확한 표기) 하이브리드 검색.
// 벡터 상위 10개 + (벡터에 없는 것 중) BM25 상위 5개를 합친다.
// 최고 유사도가 0.55 미만이면 결과를 버리지 않고 weakEvidence 플래그만 세운다.

const WEAK_EVIDENCE_THRESHOLD = 0.55;
const VECTOR_TOP_K = 10;
const BM25_TOP_K = 5;
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// 한국어는 형태소 분석 없이 공백 분리만 하면 조사가 붙어 정확한 표기 매칭이 깨진다
// (예: "차량보험가입증권에서" != "차량보험가입증권"). 정식 형태소 분석기 없이도
// 흔한 조사를 후행 제거하는 보수적인 휴리스틱으로 완화한다.
const JOSA_SUFFIXES = [
  "으로부터", "에서부터", "이라는", "라는", "이라고", "라고",
  "에서", "에게", "한테", "까지", "부터", "이다", "입니다",
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로",
];

function stripJosa(token) {
  for (const suf of JOSA_SUFFIXES) {
    if (token.length - suf.length >= 2 && token.endsWith(suf)) {
      return token.slice(0, token.length - suf.length);
    }
  }
  return token;
}

function tokenize(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .map(stripJosa)
    .filter((t) => t.length >= 2); // 한 글자짜리는 대부분 조사/대명사라 노이즈로 간주
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function buildBm25Index(chunks) {
  const docs = chunks.map((c) => tokenize(c.text));
  const docLens = docs.map((d) => d.length);
  const avgDocLen = docLens.reduce((a, b) => a + b, 0) / docs.length;

  const df = new Map(); // term -> 문서수
  docs.forEach((tokens) => {
    const seen = new Set(tokens);
    seen.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = docs.length;
  const idf = new Map();
  for (const [term, count] of df.entries()) {
    idf.set(term, Math.log(1 + (N - count + 0.5) / (count + 0.5)));
  }

  return { docs, docLens, avgDocLen, idf };
}

function bm25Score(queryTokens, docTokens, docLen, avgDocLen, idf) {
  const tf = new Map();
  docTokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));

  let score = 0;
  for (const term of queryTokens) {
    const f = tf.get(term) || 0;
    if (f === 0) continue;
    const termIdf = idf.get(term) || 0;
    const numerator = f * (BM25_K1 + 1);
    const denominator = f + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgDocLen));
    score += termIdf * (numerator / denominator);
  }
  return score;
}

export function hybridSearch(queryVec, queryText, chunks, bm25Index) {
  const vectorResults = chunks
    .map((c) => ({ chunk: c, score: dot(queryVec, c.vector), method: "vector" }))
    .sort((a, b) => b.score - a.score)
    .slice(0, VECTOR_TOP_K);

  const vectorIds = new Set(vectorResults.map((r) => r.chunk.id));
  const queryTokens = tokenize(queryText);

  const bm25Raw = chunks
    .map((c, i) => ({
      chunk: c,
      raw: bm25Score(queryTokens, bm25Index.docs[i], bm25Index.docLens[i], bm25Index.avgDocLen, bm25Index.idf),
    }))
    .filter((r) => !vectorIds.has(r.chunk.id) && r.raw > 0)
    .sort((a, b) => b.raw - a.raw)
    .slice(0, BM25_TOP_K);

  const maxBm25 = bm25Raw.length > 0 ? bm25Raw[0].raw : 1;
  const bm25Results = bm25Raw.map((r) => ({
    chunk: r.chunk,
    score: maxBm25 > 0 ? r.raw / maxBm25 : 0,
    method: "bm25",
  }));

  const combined = [...vectorResults, ...bm25Results];
  // 약한 근거 판정은 코사인 유사도(의미 근접성) 기준으로만 한다.
  // BM25 점수는 자체 최댓값으로 나눠 0~1로 정규화되므로, 무관한 질문이라도
  // 단어 하나만 우연히 겹치면 1.0이 나올 수 있어 근거 강도 판단에 섞으면 안 된다.
  const topVectorScore = vectorResults.length > 0 ? vectorResults[0].score : 0;

  return {
    results: combined,
    weakEvidence: topVectorScore < WEAK_EVIDENCE_THRESHOLD,
    topScore: topVectorScore,
  };
}

export { buildBm25Index, tokenize };
