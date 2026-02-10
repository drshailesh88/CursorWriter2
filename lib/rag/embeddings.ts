// Dense Embeddings Service
// Uses OpenAI text-embedding-3-small for cost-effective embeddings

import { TextChunk } from './types';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddingResponse {
  embedding: number[];
  tokensUsed: number;
}

interface BatchEmbeddingResponse {
  embeddings: number[][];
  totalTokens: number;
}

/**
 * Get embedding for a single text
 */
export async function getEmbedding(text: string): Promise<EmbeddingResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json();
  return {
    embedding: data.data[0].embedding,
    tokensUsed: data.usage.total_tokens,
  };
}

/**
 * Get embeddings for multiple texts (batched for efficiency)
 */
export async function getBatchEmbeddings(
  texts: string[]
): Promise<BatchEmbeddingResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // OpenAI allows up to 2048 inputs per batch
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${error}`);
    }

    const data = await response.json();
    totalTokens += data.usage.total_tokens;

    // Sort by index to maintain order
    const sortedData = data.data.sort(
      (a: { index: number }, b: { index: number }) => a.index - b.index
    );
    for (const item of sortedData) {
      allEmbeddings.push(item.embedding);
    }
  }

  return {
    embeddings: allEmbeddings,
    totalTokens,
  };
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Embed chunks and store embeddings
 * Returns chunks with embeddings attached
 */
export async function embedChunks(
  chunks: TextChunk[]
): Promise<{ chunks: TextChunk[]; tokensUsed: number }> {
  // Filter chunks that don't have embeddings yet
  const chunksToEmbed = chunks.filter((c) => !c.embedding);

  if (chunksToEmbed.length === 0) {
    return { chunks, tokensUsed: 0 };
  }

  const texts = chunksToEmbed.map((c) => c.text);
  const { embeddings, totalTokens } = await getBatchEmbeddings(texts);

  // Attach embeddings to chunks
  let embedIndex = 0;
  const embeddedChunks = chunks.map((chunk) => {
    if (!chunk.embedding) {
      return {
        ...chunk,
        embedding: embeddings[embedIndex++],
      };
    }
    return chunk;
  });

  return {
    chunks: embeddedChunks,
    tokensUsed: totalTokens,
  };
}

/**
 * Dense retrieval using cosine similarity
 */
export async function denseSearch(
  query: string,
  chunks: TextChunk[],
  topK: number = 20
): Promise<{ results: Array<{ chunk: TextChunk; score: number }>; tokensUsed: number }> {
  // Get query embedding
  const { embedding: queryEmbedding, tokensUsed } = await getEmbedding(query);

  // Calculate similarities
  const results = chunks
    .filter((chunk) => chunk.embedding) // Only chunks with embeddings
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { results, tokensUsed };
}

// --- Persistent Vector Store ---

interface StoredEmbedding {
  id: string;
  paperId: string;
  chunkId: string;
  chunkText: string;
  chunkIndex: number;
  section?: string;
  pageNumber?: number;
  paperTitle: string;
  authors?: string;
  year?: number;
  embedding: number[];
  similarity?: number;
}

/**
 * Store chunk embeddings in Supabase pgvector
 */
export async function storeChunkEmbeddings(
  chunks: TextChunk[]
): Promise<{ stored: number; skipped: number }> {
  const supabase = getSupabaseAdminClient();
  let stored = 0;
  let skipped = 0;

  // Process in batches of 50 for Supabase limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const rows = batch
      .filter(c => c.embedding)
      .map(chunk => ({
        paper_id: chunk.paperId,
        chunk_id: chunk.id,
        chunk_text: chunk.text,
        chunk_index: chunk.chunkIndex,
        section: chunk.section || null,
        page_number: chunk.pageNumber || null,
        paper_title: chunk.paperTitle,
        authors: chunk.authors || null,
        year: chunk.year || null,
        embedding: JSON.stringify(chunk.embedding),
        model: 'text-embedding-3-small',
      }));

    if (rows.length === 0) continue;

    const { error } = await supabase
      .from('paper_embeddings')
      .upsert(rows, { onConflict: 'chunk_id' });

    if (error) {
      console.error('Error storing embeddings:', error);
      skipped += rows.length;
    } else {
      stored += rows.length;
    }
  }

  return { stored, skipped };
}

/**
 * Retrieve stored embeddings for specific papers
 */
export async function getStoredEmbeddings(
  paperIds: string[]
): Promise<TextChunk[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('paper_embeddings')
    .select('*')
    .in('paper_id', paperIds);

  if (error || !data) {
    console.error('Error retrieving embeddings:', error);
    return [];
  }

  return (data as Record<string, unknown>[]).map(row => ({
    id: row.chunk_id as string,
    paperId: row.paper_id as string,
    paperTitle: row.paper_title as string,
    authors: row.authors as string | undefined,
    year: row.year as number | undefined,
    text: row.chunk_text as string,
    section: row.section as string | undefined,
    pageNumber: row.page_number as number | undefined,
    chunkIndex: row.chunk_index as number,
    embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
  }));
}

/**
 * Semantic similarity search using pgvector
 */
export async function vectorSearch(
  query: string,
  paperIds?: string[],
  topK: number = 20,
  threshold: number = 0.7
): Promise<{ results: Array<{ chunk: TextChunk; score: number }>; tokensUsed: number }> {
  const { embedding: queryEmbedding, tokensUsed } = await getEmbedding(query);
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .rpc('match_paper_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: threshold,
      match_count: topK,
      filter_paper_ids: paperIds || null,
    });

  if (error || !data) {
    console.error('Vector search error:', error);
    return { results: [], tokensUsed };
  }

  const results = (data as Record<string, unknown>[]).map(row => ({
    chunk: {
      id: row.chunk_id as string,
      paperId: row.paper_id as string,
      paperTitle: row.paper_title as string,
      authors: row.authors as string | undefined,
      year: row.year as number | undefined,
      text: row.chunk_text as string,
      section: row.section as string | undefined,
      pageNumber: row.page_number as number | undefined,
      chunkIndex: row.chunk_index as number,
    } as TextChunk,
    score: row.similarity as number,
  }));

  return { results, tokensUsed };
}

/**
 * Check if embeddings exist for given papers
 */
export async function hasStoredEmbeddings(paperIds: string[]): Promise<Map<string, boolean>> {
  const supabase = getSupabaseAdminClient();
  const result = new Map<string, boolean>();

  for (const paperId of paperIds) {
    result.set(paperId, false);
  }

  const { data, error } = await supabase
    .from('paper_embeddings')
    .select('paper_id')
    .in('paper_id', paperIds)
    .limit(1);

  if (!error && data) {
    const foundIds = new Set((data as Record<string, unknown>[]).map(r => r.paper_id as string));
    for (const id of foundIds) {
      result.set(id, true);
    }
  }

  return result;
}

/**
 * Delete embeddings for a paper (e.g., when paper is re-processed)
 */
export async function deleteEmbeddings(paperId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase
    .from('paper_embeddings')
    .delete()
    .eq('paper_id', paperId);
}

/**
 * Embed chunks with persistence - stores in pgvector after embedding
 * This is the new preferred method that combines embedding + storage
 */
export async function embedAndStoreChunks(
  chunks: TextChunk[]
): Promise<{ chunks: TextChunk[]; tokensUsed: number; stored: number }> {
  // First check which chunks already have embeddings stored
  const paperIds = [...new Set(chunks.map(c => c.paperId))];
  const storedChunks = await getStoredEmbeddings(paperIds);
  const storedMap = new Map(storedChunks.map(c => [c.id, c]));

  // Separate chunks into already-stored and needs-embedding
  const needsEmbedding: TextChunk[] = [];
  const alreadyEmbedded: TextChunk[] = [];

  for (const chunk of chunks) {
    const stored = storedMap.get(chunk.id);
    if (stored && stored.embedding) {
      alreadyEmbedded.push(stored);
    } else {
      needsEmbedding.push(chunk);
    }
  }

  let tokensUsed = 0;

  // Embed only chunks that don't have stored embeddings
  if (needsEmbedding.length > 0) {
    const result = await embedChunks(needsEmbedding);
    tokensUsed = result.tokensUsed;

    // Store the new embeddings
    const storeResult = await storeChunkEmbeddings(result.chunks);

    return {
      chunks: [...alreadyEmbedded, ...result.chunks],
      tokensUsed,
      stored: storeResult.stored,
    };
  }

  return {
    chunks: alreadyEmbedded,
    tokensUsed: 0,
    stored: 0,
  };
}
