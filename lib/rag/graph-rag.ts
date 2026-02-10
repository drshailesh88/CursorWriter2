// GraphRAG: Knowledge Graph-based Retrieval Augmented Generation
// Extracts entities and relations from text, builds a knowledge graph,
// clusters into communities, and uses graph structure for retrieval
// Inspired by Microsoft GraphRAG

import { getEmbedding, cosineSimilarity } from './embeddings';
import type { TextChunk, RetrievalResult } from './types';

// --- Types ---

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  mentions: number;         // How many times mentioned across chunks
  sourceChunkIds: string[]; // Which chunks mention this entity
  embedding?: number[];
}

export type EntityType =
  | 'concept'      // Scientific concepts (e.g., "neuroinflammation")
  | 'method'       // Research methods (e.g., "randomized controlled trial")
  | 'finding'      // Key findings (e.g., "30% reduction in mortality")
  | 'drug'         // Drugs/treatments (e.g., "pembrolizumab")
  | 'disease'      // Diseases/conditions (e.g., "type 2 diabetes")
  | 'gene_protein' // Genes/proteins (e.g., "BRCA1", "TNF-alpha")
  | 'organism'     // Model organisms (e.g., "C. elegans")
  | 'metric'       // Measurements (e.g., "hazard ratio", "p-value")
  | 'institution'  // Research institutions
  | 'other';

export interface Relation {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  description: string;
  weight: number;           // Strength of relation (0-1)
  sourceChunkIds: string[];
}

export type RelationType =
  | 'causes'
  | 'treats'
  | 'inhibits'
  | 'activates'
  | 'associated_with'
  | 'measured_by'
  | 'compared_to'
  | 'derived_from'
  | 'contradicts'
  | 'supports'
  | 'part_of'
  | 'used_in'
  | 'related_to';

export interface Community {
  id: string;
  label: string;
  description: string;
  entityIds: string[];
  summary: string;          // LLM-generated summary of the community
  embedding?: number[];
  level: number;            // Hierarchy level (0 = finest, higher = coarser)
}

export interface KnowledgeGraph {
  entities: Map<string, Entity>;
  relations: Map<string, Relation>;
  communities: Community[];
  stats: {
    totalEntities: number;
    totalRelations: number;
    totalCommunities: number;
    buildTimeMs: number;
  };
}

export interface GraphRAGConfig {
  maxEntitiesPerChunk: number;  // Max entities to extract per chunk (default: 10)
  maxRelationsPerChunk: number; // Max relations per chunk (default: 15)
  minCommunitySize: number;     // Min entities per community (default: 3)
  communityLevels: number;      // Levels of community hierarchy (default: 2)
  model: string;                // LLM for extraction (default: gpt-4o-mini)
  embedEntities: boolean;       // Embed entities for search (default: true)
  embedCommunities: boolean;    // Embed community summaries (default: true)
}

const DEFAULT_GRAPH_RAG_CONFIG: GraphRAGConfig = {
  maxEntitiesPerChunk: 10,
  maxRelationsPerChunk: 15,
  minCommunitySize: 3,
  communityLevels: 2,
  model: 'gpt-4o-mini',
  embedEntities: true,
  embedCommunities: true,
};

// --- Graph Building ---

/**
 * Build a knowledge graph from text chunks.
 *
 * Phase 1: Extract entities and relations from each chunk via LLM
 * Phase 2: Embed entity descriptions for semantic search
 * Phase 3: Detect communities using connected-component analysis
 * Phase 4: Summarize and embed communities
 */
export async function buildKnowledgeGraph(
  chunks: TextChunk[],
  config: Partial<GraphRAGConfig> = {}
): Promise<KnowledgeGraph> {
  const cfg = { ...DEFAULT_GRAPH_RAG_CONFIG, ...config };
  const startTime = Date.now();

  const entities = new Map<string, Entity>();
  const relations = new Map<string, Relation>();

  // Phase 1: Extract entities and relations from each chunk
  for (const chunk of chunks) {
    const extracted = await extractEntitiesAndRelations(chunk, cfg);

    // Merge entities (deduplicate by normalized name)
    for (const entity of extracted.entities) {
      const key = normalizeEntityName(entity.name);
      const existing = entities.get(key);
      if (existing) {
        existing.mentions += 1;
        existing.sourceChunkIds.push(...entity.sourceChunkIds);
        if (entity.description.length > existing.description.length) {
          existing.description = entity.description;
        }
      } else {
        entities.set(key, { ...entity, id: key });
      }
    }

    // Merge relations
    for (const relation of extracted.relations) {
      const sourceKey = normalizeEntityName(relation.sourceEntityId);
      const targetKey = normalizeEntityName(relation.targetEntityId);
      const relKey = `${sourceKey}-${relation.type}-${targetKey}`;

      const existing = relations.get(relKey);
      if (existing) {
        existing.weight = Math.min(1, existing.weight + 0.1);
        existing.sourceChunkIds.push(...relation.sourceChunkIds);
      } else {
        relations.set(relKey, {
          ...relation,
          id: relKey,
          sourceEntityId: sourceKey,
          targetEntityId: targetKey,
        });
      }
    }
  }

  // Fix relation references - remove relations pointing to non-existent entities
  for (const [relId, relation] of relations) {
    if (!entities.has(relation.sourceEntityId) || !entities.has(relation.targetEntityId)) {
      relations.delete(relId);
    }
  }

  // Phase 2: Embed entities
  if (cfg.embedEntities) {
    const entityList = Array.from(entities.values());
    const texts = entityList.map(e => `${e.name}: ${e.description}`);

    if (texts.length > 0) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        try {
          // Batch embed
          const batchSize = 100;
          for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const response = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: batch,
                dimensions: 1536,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const sorted = data.data.sort(
                (a: { index: number }, b: { index: number }) => a.index - b.index
              );
              for (let j = 0; j < sorted.length; j++) {
                entityList[i + j].embedding = sorted[j].embedding;
              }
            }
          }
        } catch (err) {
          console.warn('Failed to embed entities:', err);
        }
      }
    }
  }

  // Phase 3: Detect communities using Louvain-like algorithm
  const communities = detectCommunities(entities, relations, cfg);

  // Phase 4: Generate community summaries and embed them
  for (const community of communities) {
    const communityEntities = community.entityIds
      .map(id => entities.get(id))
      .filter((e): e is Entity => !!e);

    community.summary = await summarizeCommunity(communityEntities, relations, cfg.model);

    if (cfg.embedCommunities && community.summary) {
      try {
        const { embedding } = await getEmbedding(community.summary);
        community.embedding = embedding;
      } catch {
        // Skip embedding on failure
      }
    }
  }

  return {
    entities,
    relations,
    communities,
    stats: {
      totalEntities: entities.size,
      totalRelations: relations.size,
      totalCommunities: communities.length,
      buildTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Extract entities and relations from a single chunk using LLM.
 * Uses structured JSON output from the configured model.
 */
async function extractEntitiesAndRelations(
  chunk: TextChunk,
  config: GraphRAGConfig
): Promise<{ entities: Entity[]; relations: Relation[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { entities: [], relations: [] };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: `You are an academic knowledge graph extraction system. Extract entities and their relationships from scientific text.

Entity types: concept, method, finding, drug, disease, gene_protein, organism, metric, institution, other
Relation types: causes, treats, inhibits, activates, associated_with, measured_by, compared_to, derived_from, contradicts, supports, part_of, used_in, related_to

Respond with ONLY valid JSON:
{
  "entities": [
    { "name": "Entity Name", "type": "concept", "description": "Brief description" }
  ],
  "relations": [
    { "source": "Entity A", "target": "Entity B", "type": "causes", "description": "How they relate" }
  ]
}

Extract at most ${config.maxEntitiesPerChunk} entities and ${config.maxRelationsPerChunk} relations. Focus on scientifically meaningful entities — skip generic terms.`,
          },
          {
            role: 'user',
            content: chunk.text,
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return { entities: [], relations: [] };

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    const entities: Entity[] = (parsed.entities || []).map(
      (e: { name: string; type?: string; description?: string }) => ({
        id: normalizeEntityName(e.name),
        name: e.name,
        type: e.type || 'other',
        description: e.description || '',
        mentions: 1,
        sourceChunkIds: [chunk.id],
      })
    );

    const relations: Relation[] = (parsed.relations || []).map(
      (r: { source: string; target: string; type?: string; description?: string }, i: number) => ({
        id: `rel-${chunk.id}-${i}`,
        sourceEntityId: r.source,
        targetEntityId: r.target,
        type: r.type || 'related_to',
        description: r.description || '',
        weight: 0.5,
        sourceChunkIds: [chunk.id],
      })
    );

    return { entities, relations };
  } catch {
    return { entities: [], relations: [] };
  }
}

/**
 * Detect communities using connected-component analysis with size filtering.
 * Uses BFS to find connected components in the entity-relation graph,
 * then filters by minimum community size.
 */
function detectCommunities(
  entities: Map<string, Entity>,
  relations: Map<string, Relation>,
  config: GraphRAGConfig
): Community[] {
  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  for (const entity of entities.keys()) {
    adjacency.set(entity, new Set());
  }

  for (const relation of relations.values()) {
    adjacency.get(relation.sourceEntityId)?.add(relation.targetEntityId);
    adjacency.get(relation.targetEntityId)?.add(relation.sourceEntityId);
  }

  // Community detection via connected components with BFS
  const visited = new Set<string>();
  const communities: Community[] = [];
  let communityIdx = 0;

  for (const entityId of entities.keys()) {
    if (visited.has(entityId)) continue;

    // BFS to find connected component
    const component: string[] = [];
    const queue = [entityId];
    visited.add(entityId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const neighbors = adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Only keep communities above minimum size
    if (component.length >= config.minCommunitySize) {
      const communityEntities = component
        .map(id => entities.get(id))
        .filter((e): e is Entity => !!e);

      // Label based on most mentioned entity
      const topEntity = communityEntities
        .sort((a, b) => b.mentions - a.mentions)[0];

      communities.push({
        id: `community-${communityIdx++}`,
        label: topEntity?.name || `Community ${communityIdx}`,
        description: '',
        entityIds: component,
        summary: '',
        level: 0,
      });
    }
  }

  // If too many small communities, merge the smallest ones
  if (communities.length > 20) {
    // Keep top 20 by size
    communities.sort((a, b) => b.entityIds.length - a.entityIds.length);
    const kept = communities.slice(0, 15);
    const merged = communities.slice(15);

    // Add merged entities to the "Other" community
    const otherEntityIds = merged.flatMap(c => c.entityIds);
    if (otherEntityIds.length > 0) {
      kept.push({
        id: 'community-other',
        label: 'Other Topics',
        description: 'Miscellaneous entities',
        entityIds: otherEntityIds,
        summary: '',
        level: 0,
      });
    }

    return kept;
  }

  return communities;
}

/**
 * Generate a summary for a community of entities using an LLM.
 * Builds context from entity descriptions and intra-community relations.
 */
async function summarizeCommunity(
  entities: Entity[],
  relations: Map<string, Relation>,
  model: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || entities.length === 0) {
    return entities.map(e => e.name).join(', ');
  }

  // Build context from entities and their relations
  const entityDescriptions = entities
    .slice(0, 15) // Limit to prevent token overflow
    .map(e => `- ${e.name} (${e.type}): ${e.description}`)
    .join('\n');

  const relevantRelations: string[] = [];
  const entityIds = new Set(entities.map(e => e.id));

  for (const relation of relations.values()) {
    if (entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId)) {
      const source = entities.find(e => e.id === relation.sourceEntityId);
      const target = entities.find(e => e.id === relation.targetEntityId);
      if (source && target) {
        relevantRelations.push(`${source.name} -> ${relation.type} -> ${target.name}`);
      }
    }
  }

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
              'Summarize this cluster of related scientific concepts and their relationships in 2-3 sentences. Focus on the theme that connects them and key findings.',
          },
          {
            role: 'user',
            content: `Entities:\n${entityDescriptions}\n\nRelationships:\n${relevantRelations.slice(0, 20).join('\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) return entities.map(e => e.name).join(', ');

    const data = await response.json();
    return data.choices[0].message.content;
  } catch {
    return entities.map(e => e.name).join(', ');
  }
}

// --- Retrieval ---

/**
 * GraphRAG retrieval: search entities, communities, and source chunks.
 * Best for thematic/open-ended questions like "what are the main themes?"
 *
 * Scoring combines:
 *   - Entity embedding similarity (weighted)
 *   - Community embedding similarity (weighted)
 *   - Chunk embedding similarity (weighted)
 *   - Community membership bonus
 */
export async function graphRAGRetrieve(
  query: string,
  graph: KnowledgeGraph,
  chunks: TextChunk[],
  topK: number = 10
): Promise<{
  results: RetrievalResult[];
  matchedEntities: Entity[];
  matchedCommunities: Community[];
}> {
  const { embedding: queryEmbedding } = await getEmbedding(query);

  // 1. Find matching entities by embedding similarity
  const entityScores: Array<{ entity: Entity; score: number }> = [];
  for (const entity of graph.entities.values()) {
    if (!entity.embedding) continue;
    const score = cosineSimilarity(queryEmbedding, entity.embedding);
    entityScores.push({ entity, score });
  }
  entityScores.sort((a, b) => b.score - a.score);
  const matchedEntities = entityScores.slice(0, 10).map(e => e.entity);

  // 2. Find matching communities by embedding similarity
  const communityScores: Array<{ community: Community; score: number }> = [];
  for (const community of graph.communities) {
    if (!community.embedding) continue;
    const score = cosineSimilarity(queryEmbedding, community.embedding);
    communityScores.push({ community, score });
  }
  communityScores.sort((a, b) => b.score - a.score);
  const matchedCommunities = communityScores.slice(0, 5).map(c => c.community);

  // 3. Collect source chunks from matched entities and communities
  const relevantChunkIds = new Set<string>();

  for (const entity of matchedEntities) {
    for (const chunkId of entity.sourceChunkIds) {
      relevantChunkIds.add(chunkId);
    }
  }

  for (const community of matchedCommunities) {
    for (const entityId of community.entityIds) {
      const entity = graph.entities.get(entityId);
      if (entity) {
        for (const chunkId of entity.sourceChunkIds) {
          relevantChunkIds.add(chunkId);
        }
      }
    }
  }

  // 4. Score and rank relevant chunks
  const results: RetrievalResult[] = [];
  const chunkMap = new Map(chunks.map(c => [c.id, c]));

  for (const chunkId of relevantChunkIds) {
    const chunk = chunkMap.get(chunkId);
    if (!chunk) continue;

    // Score based on entity relevance + embedding similarity
    let score = 0;

    // Entity relevance contribution
    const chunkEntities = matchedEntities.filter(e =>
      e.sourceChunkIds.includes(chunkId)
    );
    score += chunkEntities.length * 0.15;

    // Embedding similarity contribution
    if (chunk.embedding) {
      score += cosineSimilarity(queryEmbedding, chunk.embedding) * 0.7;
    }

    // Community membership bonus
    const chunkInCommunity = matchedCommunities.some(c =>
      c.entityIds.some(eId => {
        const entity = graph.entities.get(eId);
        return entity?.sourceChunkIds.includes(chunkId);
      })
    );
    if (chunkInCommunity) score += 0.15;

    results.push({
      chunk,
      score: Math.min(1, score),
      source: 'hybrid',
    });
  }

  // Add community summaries as virtual chunks for thematic context
  for (const community of matchedCommunities) {
    results.push({
      chunk: {
        id: `graph-community-${community.id}`,
        paperId: 'graph-summary',
        paperTitle: `Theme: ${community.label}`,
        text: community.summary,
        section: 'Knowledge Graph Summary',
        chunkIndex: 0,
      },
      score:
        communityScores.find(c => c.community.id === community.id)?.score ||
        0.5,
      source: 'hybrid',
    });
  }

  results.sort((a, b) => b.score - a.score);

  return {
    results: results.slice(0, topK),
    matchedEntities,
    matchedCommunities,
  };
}

/**
 * Get entity relationships for visualization.
 * Performs a BFS from a center entity up to maxDepth hops,
 * returning all reachable entities and their connecting relations.
 */
export function getEntityNetwork(
  graph: KnowledgeGraph,
  centerEntityId: string,
  maxDepth: number = 2
): { entities: Entity[]; relations: Relation[] } {
  const visited = new Set<string>();
  const resultEntities: Entity[] = [];
  const resultRelations: Relation[] = [];

  const queue: Array<{ id: string; depth: number }> = [
    { id: centerEntityId, depth: 0 },
  ];
  visited.add(centerEntityId);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const entity = graph.entities.get(id);
    if (!entity) continue;

    resultEntities.push(entity);

    if (depth >= maxDepth) continue;

    // Find all relations involving this entity
    for (const relation of graph.relations.values()) {
      if (relation.sourceEntityId === id || relation.targetEntityId === id) {
        resultRelations.push(relation);

        const otherId =
          relation.sourceEntityId === id
            ? relation.targetEntityId
            : relation.sourceEntityId;

        if (!visited.has(otherId)) {
          visited.add(otherId);
          queue.push({ id: otherId, depth: depth + 1 });
        }
      }
    }
  }

  return { entities: resultEntities, relations: resultRelations };
}

// --- Helpers ---

function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}
