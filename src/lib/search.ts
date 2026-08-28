// 5강 하이브리드 검색을 브라우저용 TS로 이식 (scripts/search.mjs와 로직 동일).
import type { Chunk, SearchResult } from "./types";

const WEAK_EVIDENCE_THRESHOLD = 0.55;
const VECTOR_TOP_K = 10;
const BM25_TOP_K = 5;
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// 한국어는 형태소 분석 없이 공백 분리만 하면 조사가 붙어 정확한 표기 매칭이 깨진다.
// 8강 실험에서 확인된 문제를 그대로 반영해, 흔한 조사를 후행 제거하는 휴리스틱을 쓴다.
const JOSA_SUFFIXES = [
  "으로부터", "에서부터", "이라는", "라는", "이라고", "라고",
  "에서", "에게", "한테", "까지", "부터", "이다", "입니다",
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로",
];

function stripJosa(token: string): string {
  for (const suf of JOSA_SUFFIXES) {
    if (token.length - suf.length >= 2 && token.endsWith(suf)) {
      return token.slice(0, token.length - suf.length);
    }
  }
  return token;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .map(stripJosa)
    .filter((t) => t.length >= 2);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

interface Bm25Index {
  docs: string[][];
  docLens: number[];
  avgDocLen: number;
  idf: Map<string, number>;
}

export function buildBm25Index(chunks: Chunk[]): Bm25Index {
  const docs = chunks.map((c) => tokenize(c.text));
  const docLens = docs.map((d) => d.length);
  const avgDocLen = docLens.reduce((a, b) => a + b, 0) / docs.length;

  const df = new Map<string, number>();
  docs.forEach((tokens) => {
    const seen = new Set(tokens);
    seen.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df.entries()) {
    idf.set(term, Math.log(1 + (N - count + 0.5) / (count + 0.5)));
  }

  return { docs, docLens, avgDocLen, idf };
}

function bm25Score(queryTokens: string[], docTokens: string[], docLen: number, avgDocLen: number, idf: Map<string, number>): number {
  const tf = new Map<string, number>();
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

export interface HybridSearchResult {
  results: SearchResult[];
  weakEvidence: boolean;
  topScore: number;
}

export function hybridSearch(queryVec: number[], queryText: string, chunks: Chunk[], bm25Index: Bm25Index): HybridSearchResult {
  const vectorResults: SearchResult[] = chunks
    .map((c) => ({ chunk: c, score: dot(queryVec, c.vector), method: "vector" as const }))
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
  const bm25Results: SearchResult[] = bm25Raw.map((r) => ({
    chunk: r.chunk,
    score: maxBm25 > 0 ? r.raw / maxBm25 : 0,
    method: "bm25" as const,
  }));

  const combined = [...vectorResults, ...bm25Results];
  // 약한 근거 판정은 코사인 유사도(의미 근접성) 기준으로만 한다. BM25는 자기 검색 내
  // 최댓값으로 정규화되므로 단어 하나만 겹쳐도 1.0이 나올 수 있어 혼동하면 안 된다.
  const topVectorScore = vectorResults.length > 0 ? vectorResults[0].score : 0;

  return {
    results: combined,
    weakEvidence: topVectorScore < WEAK_EVIDENCE_THRESHOLD,
    topScore: topVectorScore,
  };
}
