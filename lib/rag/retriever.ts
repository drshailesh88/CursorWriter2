// Hybrid Retriever
// Combines BM25 (sparse) + Dense retrieval with RRF fusion
// Based on portable-rag-system architecture

import {
  TextChunk,
  RetrievalResult,
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
  Citation,
} from './types';
import { buildBM25Index, bm25Search, applyAcademicBoosts } from './bm25';
import { denseSearch, embedChunks } from './embeddings';
import { cohereRerank, simpleRerank } from './reranker';
import { generateMultiQueries, multiQuerySearch, hydeSearch } from './query-expansion';

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines multiple ranked lists into a single ranking
 * k is a constant that determines how much to weight lower ranks
 */
function reciprocalRankFusion(
  rankedLists: RetrievalResult[][],
  weights: number[],
  k: number = 60
): RetrievalResult[] {
  const scores = new Map<string, { chunk: TextChunk; score: number }>();

  for (let listIndex = 0; listIndex < rankedLists.length; listIndex++) {
    const list = rankedLists[listIndex];
    const weight = weights[listIndex] || 1;

    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      const chunkId = result.chunk.id;
      const rrfScore = weight * (1 / (k + rank + 1));

      const existing = scores.get(chunkId);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(chunkId, {
          chunk: result.chunk,
          score: rrfScore,
        });
      }
    }
  }

  // Convert to array and sort by combined score
  const combined = Array.from(scores.values())
    .map(({ chunk, score }) => ({
      chunk,
      score,
      source: 'hybrid' as const,
    }))
    .sort((a, b) => b.score - a.score);

  return combined;
}

export interface HybridRetrievalResult {
  results: RetrievalResult[];
  citations: Citation[];
  stats: {
    bm25Count: number;
    denseCount: number;
    fusedCount: number;
    rerankedCount: number;
    embeddingTokens: number;
  };
}

/**
 * Main hybrid retrieval function
 * Combines BM25 + Dense retrieval with RRF fusion and optional reranking
 */
export async function hybridRetrieve(
  query: string,
  chunks: TextChunk[],
  config: Partial<RetrievalConfig> = {}
): Promise<HybridRetrievalResult> {
  const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  const rankedLists: RetrievalResult[][] = [];
  const weights: number[] = [];
  let embeddingTokens = 0;

  // 1. BM25 Sparse Retrieval
  if (cfg.useBM25) {
    const bm25Index = buildBM25Index(chunks);
    let bm25Results = bm25Search(query, bm25Index, cfg.topK);
    bm25Results = applyAcademicBoosts(bm25Results);
    rankedLists.push(bm25Results);
    weights.push(cfg.bm25Weight);
  }

  // 2. Dense Retrieval (with optional Multi-Query and HyDE enhancements)
  if (cfg.useDenseRetrieval) {
    // Ensure chunks have embeddings
    const { chunks: embeddedChunks, tokensUsed } = await embedChunks(chunks);
    embeddingTokens = tokensUsed;

    if (cfg.useMultiQuery) {
      // Multi-Query: generate reformulations and search with each
      const queries = await generateMultiQueries(query);
      const mqResults = await multiQuerySearch(queries, embeddedChunks, cfg.topK);
      rankedLists.push(mqResults);
      weights.push(cfg.denseWeight);
    } else if (cfg.useHyDE) {
      // HyDE: use hypothetical document embedding for retrieval
      const { results: hydeResults, tokensUsed: hydeTokens } = await hydeSearch(
        query,
        embeddedChunks,
        cfg.topK
      );
      embeddingTokens += hydeTokens;
      rankedLists.push(hydeResults);
      weights.push(cfg.denseWeight);
    } else {
      // Standard dense retrieval
      const { results: denseResults, tokensUsed: queryTokens } = await denseSearch(
        query,
        embeddedChunks,
        cfg.topK
      );
      embeddingTokens += queryTokens;

      const denseRetrievalResults: RetrievalResult[] = denseResults.map((r) => ({
        chunk: r.chunk,
        score: r.score,
        source: 'dense' as const,
      }));

      rankedLists.push(denseRetrievalResults);
      weights.push(cfg.denseWeight);
    }
  }

  // 3. RRF Fusion
  let fusedResults: RetrievalResult[];
  if (rankedLists.length > 1) {
    fusedResults = reciprocalRankFusion(rankedLists, weights);
  } else if (rankedLists.length === 1) {
    fusedResults = rankedLists[0];
  } else {
    fusedResults = [];
  }

  // 4. Reranking (optional)
  let finalResults: RetrievalResult[];
  if (cfg.useReranking && fusedResults.length > 0) {
    const chunksToRerank = fusedResults.slice(0, cfg.topK).map((r) => r.chunk);

    // Try Cohere reranking, fall back to simple reranking
    const reranked = await cohereRerank(query, chunksToRerank, cfg.rerankTopK);

    finalResults = reranked.map((r) => ({
      chunk: r.chunk,
      score: r.relevanceScore,
      source: 'hybrid' as const,
    }));
  } else {
    finalResults = fusedResults.slice(0, cfg.rerankTopK);
  }

  // 5. Build citations from results
  const citations: Citation[] = finalResults.map((r) => ({
    paperId: r.chunk.paperId,
    paperTitle: r.chunk.paperTitle,
    authors: r.chunk.authors,
    year: r.chunk.year,
    section: r.chunk.section,
    quote: truncateQuote(r.chunk.text, 300),
    pageNumber: r.chunk.pageNumber,
    relevanceScore: r.score,
  }));

  return {
    results: finalResults,
    citations,
    stats: {
      bm25Count: rankedLists[0]?.length || 0,
      denseCount: rankedLists[1]?.length || 0,
      fusedCount: fusedResults.length,
      rerankedCount: finalResults.length,
      embeddingTokens,
    },
  };
}

/**
 * Truncate quote to a reasonable length
 */
function truncateQuote(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Try to cut at a sentence boundary
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');

  const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (lastSentence > maxLength * 0.5) {
    return truncated.slice(0, lastSentence + 1);
  }

  return truncated + '...';
}

/**
 * Build context string from retrieval results
 */
export function buildContext(results: RetrievalResult[]): string {
  return results
    .map((r, i) => {
      const citation = `[${i + 1}]`;
      const source = r.chunk.paperTitle;
      const section = r.chunk.section ? ` (${r.chunk.section})` : '';
      const page = r.chunk.pageNumber ? `, p.${r.chunk.pageNumber}` : '';

      return `${citation} From "${source}"${section}${page}:\n${r.chunk.text}\n`;
    })
    .join('\n---\n\n');
}

/**
 * Convert papers with content to text chunks
 */
export function papersToChunks(
  papersWithContent: Array<{
    paper: { id: string; title: string; authors?: string[]; year?: number };
    content: { paragraphs: Array<{ text: string; section?: string; pageNumber?: number }> };
  }>
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const { paper, content } of papersWithContent) {
    for (const para of content.paragraphs) {
      chunks.push({
        id: `${paper.id}-${chunkIndex}`,
        paperId: paper.id,
        paperTitle: paper.title,
        authors: paper.authors?.join(', '),
        year: paper.year,
        text: para.text,
        section: para.section,
        pageNumber: para.pageNumber,
        chunkIndex: chunkIndex++,
      });
    }
  }

  return chunks;
}
