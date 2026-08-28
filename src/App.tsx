import { useEffect, useRef, useState } from "react";
import "./App.css";
import { embedQuery } from "./lib/embeddings";
import { loadVectorStore } from "./lib/vectorstore";
import { buildBm25Index, hybridSearch } from "./lib/search";
import { buildPrompt, formatKstNow } from "./lib/buildPrompt";
import { checkOllamaStatus, streamChat, MODEL, type OllamaStatus } from "./lib/ollamaClient";
import { runJudge } from "./lib/judge";
import type { Chunk, JudgeVerdict, SearchResult, VectorStore } from "./lib/types";

type Stage = "idle" | "embedding" | "searching" | "generating" | "judging" | "done" | "error";

interface Turn {
  question: string;
  answer: string;
  sources: SearchResult[];
  weakEvidence: boolean;
  topScore: number;
  verdict: JudgeVerdict | null;
  error: string | null;
  stage: Stage;
}

const EXAMPLE_QUESTIONS = [
  "사업자등록증 확인할 때 필요한 항목이 뭐야?",
  "차량보험가입증권에서 승인 불가한 서류 종류는?",
  "전남 광양, 여수, 순천, 목포는 주취급품목을 몇 개 등록할 수 있어?",
];

export default function App() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ online: false });
  const [checkingOllama, setCheckingOllama] = useState(true);

  const [store, setStore] = useState<VectorStore | null>(null);
  const [bm25Index, setBm25Index] = useState<ReturnType<typeof buildBm25Index> | null>(null);
  const [embedProgress, setEmbedProgress] = useState<string>("");

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    refreshOllamaStatus();
    loadVectorStore().then((s) => {
      setStore(s);
      setBm25Index(buildBm25Index(s.chunks));
    });
  }, []);

  async function refreshOllamaStatus() {
    setCheckingOllama(true);
    const status = await checkOllamaStatus();
    setOllamaStatus(status);
    setCheckingOllama(false);
  }

  function updateLastTurn(patch: Partial<Turn>) {
    setTurns((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }

  async function handleAsk(question: string) {
    if (!question.trim() || busy || !store || !bm25Index) return;
    setBusy(true);
    setInput("");
    setTurns((prev) => [
      ...prev,
      { question, answer: "", sources: [], weakEvidence: false, topScore: 0, verdict: null, error: null, stage: "embedding" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      updateLastTurn({ stage: "embedding" });
      const qVec = await embedQuery(question, (info: unknown) => {
        const i = info as { status?: string; progress?: number };
        if (i.status === "progress_total" && typeof i.progress === "number") {
          setEmbedProgress(`임베딩 모델 준비 중... ${i.progress.toFixed(0)}%`);
        }
      });
      setEmbedProgress("");

      updateLastTurn({ stage: "searching" });
      const { results, weakEvidence, topScore } = hybridSearch(qVec, question, store.chunks, bm25Index);
      const topChunks: Chunk[] = [...results].sort((a, b) => b.score - a.score).slice(0, 5).map((r) => r.chunk);
      updateLastTurn({ sources: [...results].sort((a, b) => b.score - a.score).slice(0, 5), weakEvidence, topScore });

      updateLastTurn({ stage: "generating" });
      const prompt = buildPrompt({ question, chunks: topChunks, weakEvidence, kstNow: formatKstNow() });
      let answer = "";
      for await (const piece of streamChat(prompt, { signal: controller.signal })) {
        answer += piece;
        updateLastTurn({ answer });
      }

      updateLastTurn({ stage: "judging" });
      const verdict = await runJudge({ question, chunks: topChunks, answer });
      updateLastTurn({ verdict, stage: "done" });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        updateLastTurn({ stage: "done" });
      } else {
        // 스트리밍 오류가 나도 이미 받은 답변/출처는 지우지 않는다.
        updateLastTurn({ error: String(err), stage: "error" });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  return (
    <div className="app">
      <header className="header">
        <h1>공급업체 서류심사 안내 챗봇</h1>
        <p className="subtitle">
          공공급식통합플랫폼(NeaT)에 게시된 "공급업체 서류심사 세부기준" 매뉴얼(게시글 80068)에 근거해 답합니다.
          로그인/실제 서류 등록 대행은 하지 않으며, 매뉴얼에 없는 내용은 답하지 않습니다.
        </p>
      </header>

      <section className="status-banner">
        <div className={`badge ${ollamaStatus.online ? "badge-ok" : "badge-error"}`}>
          {checkingOllama
            ? "Ollama 연결 확인 중..."
            : ollamaStatus.online
              ? ollamaStatus.hasModel
                ? `Ollama 연결됨 (${MODEL} 준비됨)`
                : `Ollama는 연결됐지만 ${MODEL} 모델이 없습니다. "ollama pull ${MODEL}"을 실행하세요.`
              : "Ollama에 연결할 수 없습니다. 이 컴퓨터에서 Ollama를 실행하고 있는지 확인하세요."}
        </div>
        {!ollamaStatus.online && (
          <button onClick={refreshOllamaStatus} disabled={checkingOllama}>
            다시 확인
          </button>
        )}
        {isSafari && (
          <div className="badge badge-warn">
            Safari에서는 Ollama 연결과 임베딩 WASM이 불안정할 수 있습니다. Chrome 또는 Edge 사용을 권장합니다.
          </div>
        )}
        {!store && <div className="badge badge-info">벡터스토어(자료) 로딩 중...</div>}
        {embedProgress && <div className="badge badge-info">{embedProgress}</div>}
      </section>

      <main className="chat">
        {turns.length === 0 && (
          <div className="examples">
            <p>이런 질문을 해볼 수 있어요:</p>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button key={q} className="example-btn" onClick={() => handleAsk(q)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div className="turn" key={i}>
            <div className="question">{t.question}</div>

            {t.stage !== "done" && t.stage !== "error" && (
              <div className="stage-indicator">
                {t.stage === "embedding" && "임베딩 중..."}
                {t.stage === "searching" && "근거 검색 중..."}
                {t.stage === "generating" && "답변 생성 중..."}
                {t.stage === "judging" && "판정 중..."}
              </div>
            )}

            {t.weakEvidence && <div className="badge badge-warn">약한 근거: 검색된 자료가 질문과 완전히 맞지 않을 수 있습니다 (최고 유사도 {t.topScore.toFixed(2)})</div>}

            {t.answer && <div className="answer">{t.answer}</div>}

            {t.error && <div className="badge badge-error">오류: {t.error}</div>}

            {t.sources.length > 0 && (
              <div className="sources">
                {t.sources.map((s, j) => (
                  <a
                    key={j}
                    className={`chip chip-${s.method}`}
                    href={s.chunk.url}
                    target="_blank"
                    rel="noreferrer"
                    title={s.chunk.text}
                  >
                    {s.chunk.id} · {s.method} · {s.score.toFixed(2)}
                  </a>
                ))}
              </div>
            )}

            {t.verdict && (
              <div className={`judge-badge ${t.verdict.judgeError ? "judge-error" : t.verdict.refusal ? "judge-refusal" : t.verdict.grounded ? "judge-pass" : "judge-fail"}`}>
                {t.verdict.judgeError ? (
                  "판정 실패(judgeError) — 답변과 출처는 유지됩니다."
                ) : (
                  <>
                    grounded:{String(t.verdict.grounded)} noHalluc:{String(t.verdict.noHalluc)} cited:{String(t.verdict.cited)} refusal:{String(t.verdict.refusal)} score:{t.verdict.score}
                    <div className="judge-comment">{t.verdict.comment}</div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </main>

      <form
        className="input-row"
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="서류심사 관련 질문을 입력하세요"
          disabled={busy || !store}
        />
        {busy ? (
          <button type="button" onClick={handleStop}>중지</button>
        ) : (
          <button type="submit" disabled={!store || !ollamaStatus.online}>전송</button>
        )}
      </form>
    </div>
  );
}
