// 6강: 로컬 Ollama(qwen3.5:2b) 연결 확인 + 스트리밍/단발 호출.
// 배포된 정적 페이지도 서버가 대신 호출하는 게 아니라, 이 코드가 사용자 브라우저에서
// 그 컴퓨터의 localhost:11434를 직접 호출한다. OLLAMA_ORIGINS 설정이 없으면 CORS로 막힌다.
const OLLAMA_BASE = "http://localhost:11434";
export const MODEL = "qwen3.5:2b";

export interface OllamaStatus {
  online: boolean;
  hasModel?: boolean;
  models?: string[];
}

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return { online: false };
    const data = await res.json();
    const models: Array<{ name?: string; model?: string }> = data.models || [];
    const hasModel = models.some((m) => m.name === MODEL || m.model === MODEL);
    return { online: true, hasModel, models: models.map((m) => m.name ?? m.model ?? "") };
  } catch {
    return { online: false };
  }
}

export async function chatOnce(
  prompt: string,
  { format, temperature = 0, signal }: { format?: "json"; temperature?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    signal,
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      ...(format ? { format } : {}),
      options: { temperature },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Ollama 요청 실패: ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? "";
}

export async function* streamChat(
  prompt: string,
  { signal, temperature = 0 }: { signal?: AbortSignal; temperature?: number } = {}
): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    signal,
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      think: false,
      options: { temperature },
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
      let obj: { message?: { content?: string }; done?: boolean };
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.message?.content) yield obj.message.content;
      if (obj.done) return;
    }
  }
}
