// RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval
// Builds a hierarchical summary tree for multi-level retrieval
// Reference: https://arxiv.org/abs/2401.18059

import { getEmbedding, getBatchEmbeddings, cosineSimilarity } from './embeddings';
import type { TextChunk, RetrievalResult } from './types';

// --- Types ---

export interface RaptorNode {
  id: string;
  text: string;
  embedding?: number[];
  level: number; // 0 = leaf (original chunk), 1+ = summary levels
  children: string[]; // IDs of child nodes
  parentId?: string;
  metadata: {
    paperId?: string;
    paperTitle?: string;
    section?: string;
    chunkCount: number; // How many leaf chunks this node represents
    summaryOf: string[]; // IDs of nodes this summarizes
  };
}

export interface RaptorTree {
  nodes: Map<string, RaptorNode>;
  rootIds: string[]; // Top-level summary nodes
  leafIds: string[]; // Original chunk nodes
  maxLevel: number;
  stats: {
    totalNodes: number;
    leafNodes: number;
    summaryNodes: number;
    levels: number;
    buildTimeMs: number;
  };
}

export interface RaptorConfig {
  maxClusterSize: number; // Max chunks per cluster (default: 10)
  minClusterSize: number; // Min chunks per cluster (default: 3)
  maxLevels: number; // Max tree depth (default: 3)
  summaryModel: string; // Model for summarization (default: gpt-4o-mini)
  clusteringThreshold: number; // Cosine similarity threshold for clustering (default: 0.65)
  embeddingSummaries: boolean; // Whether to embed summary nodes (default: true)
}

const DEFAULT_RAPTOR_CONFIG: RaptorConfig = {
  maxClusterSize: 10,
  minClusterSize: 3,
  maxLevels: 3,
  summaryModel: 'gpt-4o-mini',
  clusteringThreshold: 0.65,
  embeddingSummaries: true,
};

// --- Tree Building ---

/**
 * Build a RAPTOR tree from text chunks.
 *
 * Level 0: Original chunks (leaf nodes)
 * Level 1: Summaries of similar chunk clusters
 * Level 2+: Summaries of summaries (recursive)
 *
 * The tree enables retrieval at multiple abstraction levels, from
 * specific passages to thematic overviews.
 */
export async function buildRaptorTree(
  chunks: TextChunk[],
  config: Partial<RaptorConfig> = {}
): Promise<RaptorTree> {
  const cfg = { ...DEFAULT_RAPTOR_CONFIG, ...config };
  const startTime = Date.now();
  const tree: RaptorTree = {
    nodes: new Map(),
    rootIds: [],
    leafIds: [],
    maxLevel: 0,
    stats: {
      totalNodes: 0,
      leafNodes: 0,
      summaryNodes: 0,
      levels: 0,
      buildTimeMs: 0,
    },
  };

  if (chunks.length === 0) {
    tree.stats.buildTimeMs = Date.now() - startTime;
    return tree;
  }

  // Ensure all chunks have embeddings
  const embeddedChunks = await ensureEmbeddings(chunks);

  // Level 0: Create leaf nodes from chunks
  const leafNodes: RaptorNode[] = embeddedChunks.map((chunk) => ({
    id: `raptor-leaf-${chunk.id}`,
    text: chunk.text,
    embedding: chunk.embedding,
    level: 0,
    children: [],
    metadata: {
      paperId: chunk.paperId,
      paperTitle: chunk.paperTitle,
      section: chunk.section,
      chunkCount: 1,
      summaryOf: [],
    },
  }));

  for (const node of leafNodes) {
    tree.nodes.set(node.id, node);
    tree.leafIds.push(node.id);
  }

  // Build higher levels by recursive clustering and summarization
  let currentLevelNodes = leafNodes;
  let level = 1;

  while (level <= cfg.maxLevels && currentLevelNodes.length > cfg.maxClusterSize) {
    // Cluster nodes at current level by embedding similarity
    const clusters = clusterNodes(
      currentLevelNodes,
      cfg.clusteringThreshold,
      cfg.maxClusterSize,
      cfg.minClusterSize
    );

    // Stop if clustering didn't reduce the number of groups meaningfully
    if (clusters.length === 0 || clusters.length >= currentLevelNodes.length) {
      break;
    }

    // Summarize each cluster into a parent node
    const summaryNodes: RaptorNode[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const summaryText = await summarizeCluster(
        cluster.map((n) => n.text),
        cfg.summaryModel
      );

      const summaryNode: RaptorNode = {
        id: `raptor-L${level}-${i}`,
        text: summaryText,
        level,
        children: cluster.map((n) => n.id),
        metadata: {
          chunkCount: cluster.reduce((sum, n) => sum + n.metadata.chunkCount, 0),
          summaryOf: cluster.map((n) => n.id),
        },
      };

      // Set parent references on child nodes
      for (const child of cluster) {
        child.parentId = summaryNode.id;
        tree.nodes.set(child.id, child);
      }

      // Embed the summary node if configured
      if (cfg.embeddingSummaries) {
        const { embedding } = await getEmbedding(summaryText);
        summaryNode.embedding = embedding;
      }

      summaryNodes.push(summaryNode);
      tree.nodes.set(summaryNode.id, summaryNode);
    }

    currentLevelNodes = summaryNodes;
    tree.maxLevel = level;
    level++;
  }

  // The nodes at the highest level are the roots
  tree.rootIds = currentLevelNodes.map((n) => n.id);

  // Calculate final stats
  tree.stats = {
    totalNodes: tree.nodes.size,
    leafNodes: tree.leafIds.length,
    summaryNodes: tree.nodes.size - tree.leafIds.length,
    levels: tree.maxLevel + 1,
    buildTimeMs: Date.now() - startTime,
  };

  return tree;
}

// --- Clustering ---

/**
 * Cluster nodes by embedding similarity using greedy agglomerative clustering.
 *
 * Strategy: iterate through nodes sorted by text length (larger texts make
 * better seeds), greedily assign similar nodes to the seed's cluster.
 */
function clusterNodes(
  nodes: RaptorNode[],
  threshold: number,
  maxSize: number,
  minSize: number
): RaptorNode[][] {
  if (nodes.length === 0) return [];

  const clusters: RaptorNode[][] = [];
  const assigned = new Set<string>();

  // Sort nodes by text length descending (larger texts make better cluster seeds)
  const sortedNodes = [...nodes].sort((a, b) => b.text.length - a.text.length);

  for (const seed of sortedNodes) {
    if (assigned.has(seed.id)) continue;

    const cluster: RaptorNode[] = [seed];
    assigned.add(seed.id);

    if (!seed.embedding) continue;

    // Find similar unassigned nodes for this cluster
    for (const candidate of sortedNodes) {
      if (assigned.has(candidate.id) || !candidate.embedding) continue;
      if (cluster.length >= maxSize) break;

      const similarity = cosineSimilarity(seed.embedding, candidate.embedding);
      if (similarity >= threshold) {
        cluster.push(candidate);
        assigned.add(candidate.id);
      }
    }

    // Only keep clusters that meet minimum size requirement
    if (cluster.length >= minSize) {
      clusters.push(cluster);
    } else {
      // Release non-seed nodes for potential reassignment to larger clusters
      for (const node of cluster) {
        if (node.id !== seed.id) {
          assigned.delete(node.id);
        }
      }
      // Keep the seed as a singleton cluster so it is not lost
      clusters.push([seed]);
    }
  }

  // Assign any remaining unassigned nodes to the nearest cluster
  for (const node of sortedNodes) {
    if (assigned.has(node.id) || !node.embedding) continue;

    let bestClusterIdx = 0;
    let bestSim = -1;

    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].length >= maxSize) continue;
      const centroid = clusters[i][0];
      if (!centroid.embedding) continue;

      const sim = cosineSimilarity(node.embedding, centroid.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestClusterIdx = i;
      }
    }

    clusters[bestClusterIdx].push(node);
    assigned.add(node.id);
  }

  return clusters;
}

// --- Summarization ---

/**
 * Summarize a cluster of text passages using an LLM.
 * Falls back to extractive summarization (first sentences) if API is unavailable.
 */
async function summarizeCluster(texts: string[], model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback: extractive summarization using first sentence of each text
    return texts.map((t) => t.split('.')[0] + '.').join(' ');
  }

  const combinedText = texts.join('\n\n---\n\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an academic summarization system. Summarize the following collection of research passages into a single coherent paragraph. Preserve key findings, statistics, and methodological details. Be comprehensive but concise (150-250 words). Maintain academic tone.',
          },
          {
            role: 'user',
            content: combinedText,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      // Fallback on API error
      return texts.map((t) => t.split('.')[0] + '.').join(' ');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch {
    // Fallback on network or parsing error
    return texts.map((t) => t.split('.')[0] + '.').join(' ');
  }
}

// --- Embedding Helpers ---

/**
 * Ensure all chunks have embeddings, batching API calls for those that lack them.
 */
async function ensureEmbeddings(chunks: TextChunk[]): Promise<TextChunk[]> {
  const needsEmbedding = chunks.filter((c) => !c.embedding);
  if (needsEmbedding.length === 0) return chunks;

  const texts = needsEmbedding.map((c) => c.text);
  const { embeddings } = await getBatchEmbeddings(texts);

  let embedIdx = 0;
  return chunks.map((chunk) => {
    if (!chunk.embedding) {
      return { ...chunk, embedding: embeddings[embedIdx++] };
    }
    return chunk;
  });
}

// --- Retrieval ---

/**
 * RAPTOR retrieval: search across ALL levels of the tree simultaneously.
 *
 * This is the key innovation of RAPTOR -- by searching both leaf chunks
 * (specific details) and summary nodes (thematic overviews), the system
 * can match queries at the appropriate abstraction level. Level weights
 * allow tuning the balance between specificity and breadth.
 */
export async function raptorRetrieve(
  query: string,
  tree: RaptorTree,
  topK: number = 10,
  levelWeights?: Record<number, number>
): Promise<RetrievalResult[]> {
  const { embedding: queryEmbedding } = await getEmbedding(query);

  // Default weights: higher levels get slightly lower weight to prefer specificity
  const weights = levelWeights || {
    0: 1.0, // Leaf chunks (most specific)
    1: 0.9, // First-level summaries
    2: 0.8, // Second-level summaries
    3: 0.7, // Third-level summaries
  };

  const results: RetrievalResult[] = [];

  for (const [, node] of tree.nodes) {
    if (!node.embedding) continue;

    const baseSimilarity = cosineSimilarity(queryEmbedding, node.embedding);
    const levelWeight = weights[node.level] ?? 0.5;
    const score = baseSimilarity * levelWeight;

    results.push({
      chunk: {
        id: node.id,
        paperId: node.metadata.paperId || '',
        paperTitle: node.metadata.paperTitle || `Summary (Level ${node.level})`,
        text: node.text,
        section: node.metadata.section || (node.level > 0 ? `Summary Level ${node.level}` : undefined),
        chunkIndex: 0,
      },
      score,
      source: 'dense',
    });
  }

  // Sort by score descending and return top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Collapsed tree retrieval: search only nodes at a specific level.
 *
 * Useful when the query type is known:
 * - Level 0: factual / specific detail queries
 * - Level 1+: thematic / overview queries
 */
export async function raptorRetrieveAtLevel(
  query: string,
  tree: RaptorTree,
  level: number,
  topK: number = 10
): Promise<RetrievalResult[]> {
  const { embedding: queryEmbedding } = await getEmbedding(query);

  const results: RetrievalResult[] = [];

  for (const [, node] of tree.nodes) {
    if (node.level !== level || !node.embedding) continue;

    const similarity = cosineSimilarity(queryEmbedding, node.embedding);

    results.push({
      chunk: {
        id: node.id,
        paperId: node.metadata.paperId || '',
        paperTitle: node.metadata.paperTitle || '',
        text: node.text,
        section: node.metadata.section,
        chunkIndex: 0,
      },
      score: similarity,
      source: 'dense',
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// --- Tree Navigation ---

/**
 * Get the tree path from a node up to the root (for context expansion).
 *
 * Returns an array of nodes starting from the given node and walking
 * up through parents to the root. This provides increasing levels of
 * abstraction for a given retrieval hit.
 */
export function getNodeContext(tree: RaptorTree, nodeId: string): RaptorNode[] {
  const path: RaptorNode[] = [];
  let current = tree.nodes.get(nodeId);

  while (current) {
    path.push(current);
    if (current.parentId) {
      current = tree.nodes.get(current.parentId);
    } else {
      break;
    }
  }

  return path;
}

/**
 * Expand a summary node to retrieve all its descendant leaf chunks.
 *
 * When a summary node is retrieved, this function resolves it to the
 * original text chunks it represents, enabling the system to provide
 * both the high-level summary and the supporting details.
 */
export function expandToLeaves(tree: RaptorTree, nodeId: string): RaptorNode[] {
  const node = tree.nodes.get(nodeId);
  if (!node) return [];

  // Already a leaf node
  if (node.level === 0) return [node];

  const leaves: RaptorNode[] = [];
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.level === 0) {
      leaves.push(current);
    } else {
      for (const childId of current.children) {
        const child = tree.nodes.get(childId);
        if (child) stack.push(child);
      }
    }
  }

  return leaves;
}
