export interface Chunk {
  id: string;
  text: string;
  url: string;
  section: string;
  page?: number;
  vector: number[];
}

export interface VectorStore {
  source: {
    site: string;
    board: string;
    articleId: number;
    articleTitle: string;
    url: string;
    registeredDate: string;
    docTitle: string;
    embeddingModel: string;
    dtype: string;
    pooling: string;
    normalize: boolean;
    docPrefix: string;
    dim: number;
  };
  chunks: Chunk[];
}

export type SearchMethod = "vector" | "bm25";

export interface SearchResult {
  chunk: Chunk;
  score: number;
  method: SearchMethod;
}

export interface JudgeVerdict {
  judgeError: boolean;
  grounded?: boolean;
  noHalluc?: boolean;
  cited?: boolean;
  refusal?: boolean;
  score?: number;
  comment?: string;
  raw?: string;
}
