// Query Expansion Techniques
// Multi-Query: Generate multiple reformulations of a query for better recall
// HyDE: Generate hypothetical document embeddings for better retrieval

import { getEmbedding, getBatchEmbeddings, cosineSimilarity } from './embeddings';
import type { TextChunk, RetrievalResult } from './types';

/**
 * Generate multiple query reformulations using LLM
 * This improves recall by searching with different phrasings
 */
export async function generateMultiQueries(
  originalQuery: string,
  numQueries: number = 4
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [originalQuery];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a research query expansion assistant. Given a research question, generate ${numQueries} alternative phrasings that would help find relevant academic papers. Each reformulation should:
1. Use different terminology (synonyms, related concepts)
2. Approach the topic from a different angle
3. Be specific enough for academic database search
Return ONLY the queries, one per line. No numbering or explanations.`,
          },
          {
            role: 'user',
            content: originalQuery,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) return [originalQuery];

    const data = await response.json();
    const generatedQueries = data.choices[0].message.content
      .split('\n')
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 10);

    return [originalQuery, ...generatedQueries.slice(0, numQueries)];
  } catch {
    return [originalQuery];
  }
}

/**
 * HyDE: Hypothetical Document Embeddings
 * Generate a hypothetical answer/document, then use its embedding for retrieval
 * This bridges the gap between short queries and long document embeddings
 */
export async function generateHypotheticalDocument(
  query: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return query;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an academic writing assistant. Given a research question, write a short (150-200 word) hypothetical passage from a scientific paper that would directly answer this question. Write it as if it were a paragraph from the results or discussion section of a real paper. Include specific (hypothetical) details, numbers, and academic language. Do not say "hypothetical" or acknowledge this is made up.`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) return query;

    const data = await response.json();
    return data.choices[0].message.content;
  } catch {
    return query;
  }
}

/**
 * Multi-query retrieval with RRF fusion
 * Searches with multiple query reformulations and fuses results
 */
export async function multiQuerySearch(
  queries: string[],
  chunks: TextChunk[],
  topK: number = 20
): Promise<RetrievalResult[]> {
  // Get embeddings for all queries
  const { embeddings: queryEmbeddings } = await getBatchEmbeddings(queries);

  // For each query, get ranked results
  const allRankedLists: RetrievalResult[][] = [];

  for (const queryEmbedding of queryEmbeddings) {
    const results = chunks
      .filter((chunk) => chunk.embedding)
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding!),
        source: 'dense' as const,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    allRankedLists.push(results);
  }

  // RRF fusion across all query results
  const K = 60;
  const scores = new Map<string, { chunk: TextChunk; score: number }>();

  for (const list of allRankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      const chunkId = result.chunk.id;
      const rrfScore = 1 / (K + rank + 1);

      const existing = scores.get(chunkId);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(chunkId, { chunk: result.chunk, score: rrfScore });
      }
    }
  }

  return Array.from(scores.values())
    .map(({ chunk, score }) => ({ chunk, score, source: 'dense' as const }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * HyDE retrieval
 * Generate hypothetical document, embed it, use for retrieval
 */
export async function hydeSearch(
  query: string,
  chunks: TextChunk[],
  topK: number = 20
): Promise<{ results: RetrievalResult[]; tokensUsed: number }> {
  // Generate hypothetical document
  const hypotheticalDoc = await generateHypotheticalDocument(query);

  // Embed the hypothetical document
  const { embedding: hydeEmbedding, tokensUsed } = await getEmbedding(hypotheticalDoc);

  // Search using the hypothetical document's embedding
  const results = chunks
    .filter((chunk) => chunk.embedding)
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(hydeEmbedding, chunk.embedding!),
      source: 'dense' as const,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { results, tokensUsed };
}
