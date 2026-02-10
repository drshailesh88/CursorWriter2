// RAG System Type Definitions
// Modeled after portable-rag-system architecture

export interface TextChunk {
  id: string;
  paperId: string;
  paperTitle: string;
  authors?: string;
  year?: number;
  text: string;
  section?: string;
  pageNumber?: number;
  chunkIndex: number;
  // For dense retrieval
  embedding?: number[];
}

export interface RetrievalResult {
  chunk: TextChunk;
  score: number;
  source: 'bm25' | 'dense' | 'hybrid';
}

export interface RerankResult {
  chunk: TextChunk;
  score: number;
  relevanceScore: number;
}

export interface RetrievalConfig {
  // Retrieval settings
  topK: number;
  useDenseRetrieval: boolean;
  useBM25: boolean;
  useReranking: boolean;

  // Hybrid fusion weights
  bm25Weight: number;
  denseWeight: number;

  // Reranking settings
  rerankTopK: number;

  // Query expansion
  useMultiQuery: boolean;
  useHyDE: boolean;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 20,
  useDenseRetrieval: true,
  useBM25: true,
  useReranking: true,
  bm25Weight: 0.4,
  denseWeight: 0.6,
  rerankTopK: 10,
  useMultiQuery: true, // Enable multi-query by default
  useHyDE: false, // HyDE is opt-in (more expensive)
};

export interface Citation {
  paperId: string;
  paperTitle: string;
  authors?: string;
  year?: number;
  section?: string;
  quote: string;
  pageNumber?: number;
  relevanceScore?: number;
}

export interface RAGResponse {
  answer: string;
  citations: Citation[];
  retrievedChunks: RetrievalResult[];
  modelUsed: string;
  cached: boolean;
  costs: {
    embeddingTokens: number;
    llmInputTokens: number;
    llmOutputTokens: number;
    estimatedCost: number;
  };
}

export interface CacheEntry {
  key: string;
  query: string;
  paperIds: string[];
  response: string;
  citations: Citation[];
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

export type ModelTier = 'economy' | 'standard' | 'premium';

export interface ModelConfig {
  id: string;
  provider: 'openai' | 'google' | 'anthropic' | 'deepseek';
  tier: ModelTier;
  inputCostPer1M: number;
  outputCostPer1M: number;
  maxContextTokens: number;
}

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    provider: 'google',
    tier: 'economy',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    maxContextTokens: 1000000,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    tier: 'standard',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    maxContextTokens: 128000,
  },
  'deepseek-chat': {
    id: 'deepseek-chat',
    provider: 'deepseek',
    tier: 'economy',
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    maxContextTokens: 64000,
  },
  'claude-3-5-haiku-latest': {
    id: 'claude-3-5-haiku-latest',
    provider: 'anthropic',
    tier: 'standard',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    maxContextTokens: 200000,
  },
};
