import type { VectorStore } from "./types";

let storePromise: Promise<VectorStore> | null = null;

export function loadVectorStore(): Promise<VectorStore> {
  if (!storePromise) {
    // import.meta.env.BASE_URL은 vite.config.ts의 base:'./'를 반영해 GitHub Pages
    // 하위 경로에서도(예: /rag-supplier-chatbot/) 상대 경로로 정적 자산을 찾는다.
    storePromise = fetch(`${import.meta.env.BASE_URL}data/supplier-docs.json`).then((res) => {
      if (!res.ok) throw new Error(`벡터스토어 로드 실패: ${res.status}`);
      return res.json();
    });
  }
  return storePromise;
}
