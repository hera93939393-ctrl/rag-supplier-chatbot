import { useState } from "react";
import { embedQuery } from "./lib/embeddings";

export default function App() {
  const [status, setStatus] = useState("대기 중");
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setStatus("모델 로드 중...");
    setError(null);
    try {
      const vec = await embedQuery("사업자등록증 확인할 때 필요한 항목이 뭐야?", (info) => {
        console.log("progress", info);
      });
      setStatus(`성공: 차원=${vec.length}, 첫 값=${vec[0].toFixed(4)}`);
    } catch (err) {
      console.error(err);
      setError(String(err));
      setStatus("실패");
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>브라우저 임베딩 테스트</h1>
      <button onClick={handleTest}>임베딩 실행</button>
      <p>상태: {status}</p>
      {error && <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{error}</pre>}
    </div>
  );
}
