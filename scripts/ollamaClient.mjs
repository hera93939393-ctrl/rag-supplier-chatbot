// 6강: 로컬 Ollama(qwen3.5:2b)와의 연결 상태 확인 + 스트리밍 응답 파싱.
// 스트리밍 응답은 완성된 JSON 하나가 아니라 줄바꿈으로 구분된 JSON 조각들이다.

const OLLAMA_BASE = "http://localhost:11434";
const MODEL = "qwen3.5:2b";

export async function checkOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return { online: false };
    const data = await res.json();
    const hasModel = (data.models || []).some((m) => m.name === MODEL || m.model === MODEL);
    return { online: true, hasModel, models: (data.models || []).map((m) => m.name) };
  } catch {
    return { online: false };
  }
}

export async function* streamChat(prompt, { signal } = {}) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    signal,
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      think: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama 요청 실패: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // 파싱 실패한 조각은 건너뛰되 스트림 자체는 계속 읽는다
      }
      if (obj.message?.content) {
        yield obj.message.content;
      }
      if (obj.done) return;
    }
  }
}
