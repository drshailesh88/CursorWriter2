// Citation Snowballing Engine
// Automated forward + backward citation traversal for paper discovery
// Based on Wohlin (2014) snowballing guidelines
//
// Research shows citation snowballing discovers 51% of references
// that keyword search alone misses.

import { searchService } from './sources';
import type { DatabaseSource } from './types';
import type { SearchPaper } from './sources/types';

// ============================================================================
// Configuration
// ============================================================================

export interface SnowballConfig {
  maxDepth: number;           // How many levels deep to traverse (default: 2)
  maxPapersPerLevel: number;  // Max papers to explore per level (default: 20)
  maxTotalPapers: number;     // Total cap on discovered papers (default: 100)
  minRelevanceScore: number;  // Minimum relevance to include (default: 0.3)
  directions: ('forward' | 'backward')[]; // Which directions to snowball
  primarySource: DatabaseSource; // Which provider to use for citations
  topicKeywords: string[];    // Keywords for relevance filtering
}

export const DEFAULT_SNOWBALL_CONFIG: SnowballConfig = {
  maxDepth: 2,
  maxPapersPerLevel: 20,
  maxTotalPapers: 100,
  minRelevanceScore: 0.3,
  directions: ['forward', 'backward'],
  primarySource: 'semantic_scholar',
  topicKeywords: [],
};

// ============================================================================
// Result Types
// ============================================================================

export interface SnowballResult {
  discoveredPapers: DiscoveredPaper[];
  traversalGraph: TraversalGraph;
  stats: SnowballStats;
}

export interface DiscoveredPaper {
  paper: SearchPaper;
  discoveredVia: 'forward' | 'backward';
  discoveredFrom: string; // Paper ID that led to this discovery
  depth: number;
  relevanceScore: number;
  citationCount?: number;
}

export interface TraversalGraph {
  nodes: TraversalNode[];
  edges: TraversalEdge[];
}

export interface TraversalNode {
  id: string;
  title: string;
  year: number;
  depth: number;
  isSeed: boolean;
  explored: boolean;
}

export interface TraversalEdge {
  source: string;
  target: string;
  type: 'cites' | 'cited_by';
}

export interface SnowballStats {
  seedPapers: number;
  totalExplored: number;
  totalDiscovered: number;
  forwardDiscovered: number;
  backwardDiscovered: number;
  maxDepthReached: number;
  duplicatesFiltered: number;
  belowThresholdFiltered: number;
}

type ProgressCallback = (message: string, progress: number) => void;

// ============================================================================
// Citation Snowballing Engine
// ============================================================================

/**
 * Citation Snowballing Engine
 *
 * Given seed papers, recursively discovers related papers through
 * forward snowballing (who cites this?) and backward snowballing
 * (who does this cite?).
 *
 * Uses BFS traversal with configurable depth, per-level caps, and
 * total paper limits to prevent runaway exploration. Papers are
 * filtered by keyword relevance scoring with boosts for citation
 * count and recency.
 */
export class CitationSnowballer {
  private config: SnowballConfig;
  private seen: Set<string> = new Set();
  private discovered: DiscoveredPaper[] = [];
  private graph: TraversalGraph = { nodes: [], edges: [] };
  private stats: SnowballStats = {
    seedPapers: 0,
    totalExplored: 0,
    totalDiscovered: 0,
    forwardDiscovered: 0,
    backwardDiscovered: 0,
    maxDepthReached: 0,
    duplicatesFiltered: 0,
    belowThresholdFiltered: 0,
  };

  constructor(config: Partial<SnowballConfig> = {}) {
    this.config = { ...DEFAULT_SNOWBALL_CONFIG, ...config };
  }

  /**
   * Execute snowballing from seed papers.
   *
   * Performs a breadth-first traversal starting from the provided seed
   * papers, expanding outward through citation relationships up to
   * `maxDepth` levels. At each level, papers are explored in both
   * forward (citing) and backward (referenced) directions based on
   * the configured `directions`.
   *
   * @param seedPapers - Initial papers to begin snowballing from
   * @param onProgress - Optional callback for progress updates
   * @returns Complete snowball results including discovered papers, graph, and stats
   */
  async snowball(
    seedPapers: SearchPaper[],
    onProgress?: ProgressCallback
  ): Promise<SnowballResult> {
    // Reset state for fresh run
    this.seen.clear();
    this.discovered = [];
    this.graph = { nodes: [], edges: [] };
    this.stats = {
      seedPapers: seedPapers.length,
      totalExplored: 0,
      totalDiscovered: 0,
      forwardDiscovered: 0,
      backwardDiscovered: 0,
      maxDepthReached: 0,
      duplicatesFiltered: 0,
      belowThresholdFiltered: 0,
    };

    // Add seed papers to seen set and graph
    for (const paper of seedPapers) {
      const paperId = this.getPaperId(paper);
      this.seen.add(paperId);
      this.graph.nodes.push({
        id: paperId,
        title: paper.title,
        year: paper.year,
        depth: 0,
        isSeed: true,
        explored: false,
      });
    }

    // BFS traversal through citation network
    let currentLevel: Array<{ paper: SearchPaper; depth: number }> =
      seedPapers.map(p => ({ paper: p, depth: 0 }));

    for (let depth = 1; depth <= this.config.maxDepth; depth++) {
      if (this.discovered.length >= this.config.maxTotalPapers) break;
      if (currentLevel.length === 0) break;

      onProgress?.(
        `Snowballing depth ${depth}/${this.config.maxDepth} (${currentLevel.length} papers to explore)`,
        (depth / this.config.maxDepth) * 100
      );

      const nextLevel: Array<{ paper: SearchPaper; depth: number }> = [];

      for (const { paper } of currentLevel) {
        if (this.discovered.length >= this.config.maxTotalPapers) break;

        const paperId = this.getPaperId(paper);

        // Mark as explored in graph
        const node = this.graph.nodes.find(n => n.id === paperId);
        if (node) node.explored = true;
        this.stats.totalExplored++;

        // Forward snowballing: who cites this paper?
        if (this.config.directions.includes('forward')) {
          const citing = await this.getForwardCitations(paper, depth);
          for (const discovered of citing) {
            nextLevel.push({ paper: discovered.paper, depth });
          }
        }

        // Backward snowballing: who does this paper cite?
        if (this.config.directions.includes('backward')) {
          const referenced = await this.getBackwardCitations(paper, depth);
          for (const discovered of referenced) {
            nextLevel.push({ paper: discovered.paper, depth });
          }
        }

        // Rate limiting - be respectful to APIs
        await this.delay(200);
      }

      // Trim next level to configured cap
      currentLevel = nextLevel.slice(0, this.config.maxPapersPerLevel);
      this.stats.maxDepthReached = depth;
    }

    return {
      discoveredPapers: this.discovered,
      traversalGraph: this.graph,
      stats: this.stats,
    };
  }

  /**
   * Forward snowballing - find papers that cite the given paper.
   *
   * Queries the configured search provider for papers that cite the
   * source paper, filters by relevance, deduplicates, and records
   * the citation relationship in the traversal graph.
   */
  private async getForwardCitations(
    paper: SearchPaper,
    depth: number
  ): Promise<DiscoveredPaper[]> {
    const paperId = this.getPaperId(paper);
    const results: DiscoveredPaper[] = [];

    try {
      const citingPapers = await searchService.getCitingPapers(
        this.config.primarySource,
        paper.externalId,
        this.config.maxPapersPerLevel
      );

      for (const citing of citingPapers) {
        const citingId = this.getPaperId(citing);

        // Skip if already seen (but still record the edge)
        if (this.seen.has(citingId)) {
          this.stats.duplicatesFiltered++;
          this.addEdge(citingId, paperId, 'cites');
          continue;
        }

        // Check relevance against topic keywords
        const relevance = this.calculateRelevance(citing);
        if (relevance < this.config.minRelevanceScore) {
          this.stats.belowThresholdFiltered++;
          continue;
        }

        this.seen.add(citingId);

        const discovered: DiscoveredPaper = {
          paper: citing,
          discoveredVia: 'forward',
          discoveredFrom: paperId,
          depth,
          relevanceScore: relevance,
          citationCount: citing.citationCount,
        };

        this.discovered.push(discovered);
        this.stats.totalDiscovered++;
        this.stats.forwardDiscovered++;
        results.push(discovered);

        // Add to traversal graph
        this.graph.nodes.push({
          id: citingId,
          title: citing.title,
          year: citing.year,
          depth,
          isSeed: false,
          explored: false,
        });
        this.addEdge(citingId, paperId, 'cites');

        if (this.discovered.length >= this.config.maxTotalPapers) break;
      }
    } catch (error) {
      console.error(`Forward snowball failed for ${paperId}:`, error);
    }

    return results;
  }

  /**
   * Backward snowballing - find papers cited by the given paper.
   *
   * Queries the configured search provider for papers referenced by the
   * source paper, filters by relevance, deduplicates, and records
   * the citation relationship in the traversal graph.
   */
  private async getBackwardCitations(
    paper: SearchPaper,
    depth: number
  ): Promise<DiscoveredPaper[]> {
    const paperId = this.getPaperId(paper);
    const results: DiscoveredPaper[] = [];

    try {
      const referencedPapers = await searchService.getReferencedPapers(
        this.config.primarySource,
        paper.externalId,
        this.config.maxPapersPerLevel
      );

      for (const referenced of referencedPapers) {
        const refId = this.getPaperId(referenced);

        if (this.seen.has(refId)) {
          this.stats.duplicatesFiltered++;
          this.addEdge(paperId, refId, 'cites');
          continue;
        }

        const relevance = this.calculateRelevance(referenced);
        if (relevance < this.config.minRelevanceScore) {
          this.stats.belowThresholdFiltered++;
          continue;
        }

        this.seen.add(refId);

        const discovered: DiscoveredPaper = {
          paper: referenced,
          discoveredVia: 'backward',
          discoveredFrom: paperId,
          depth,
          relevanceScore: relevance,
          citationCount: referenced.citationCount,
        };

        this.discovered.push(discovered);
        this.stats.totalDiscovered++;
        this.stats.backwardDiscovered++;
        results.push(discovered);

        this.graph.nodes.push({
          id: refId,
          title: referenced.title,
          year: referenced.year,
          depth,
          isSeed: false,
          explored: false,
        });
        this.addEdge(paperId, refId, 'cites');

        if (this.discovered.length >= this.config.maxTotalPapers) break;
      }
    } catch (error) {
      console.error(`Backward snowball failed for ${paperId}:`, error);
    }

    return results;
  }

  /**
   * Calculate relevance of a paper to the research topic.
   *
   * Scoring is based on three factors:
   * 1. Keyword match ratio (70% weight) - how many topic keywords appear
   *    in the paper's title and abstract
   * 2. Citation count boost (up to 0.2) - logarithmic scale rewards
   *    highly-cited papers
   * 3. Recency boost (up to 0.1) - papers from the last 3 years get
   *    a stronger boost than those from the last 5
   *
   * When no topic keywords are configured, returns a neutral 0.5 score
   * so that all papers pass through with moderate relevance.
   */
  private calculateRelevance(paper: SearchPaper): number {
    if (this.config.topicKeywords.length === 0) return 0.5;

    const text = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
    let matches = 0;

    for (const keyword of this.config.topicKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    const keywordScore = matches / this.config.topicKeywords.length;

    // Boost for highly cited papers (logarithmic scale)
    const citationBoost = paper.citationCount
      ? Math.min(0.2, Math.log10(paper.citationCount + 1) / 10)
      : 0;

    // Boost for recent papers
    const age = new Date().getFullYear() - paper.year;
    const recencyBoost = age <= 3 ? 0.1 : age <= 5 ? 0.05 : 0;

    return Math.min(1, keywordScore * 0.7 + citationBoost + recencyBoost);
  }

  /**
   * Get unique paper identifier.
   *
   * Prefers DOI as the most stable identifier, falls back to
   * externalId (provider-specific ID), then generic id.
   */
  private getPaperId(paper: SearchPaper): string {
    return paper.doi || paper.externalId || paper.id;
  }

  /**
   * Add edge to traversal graph (avoiding duplicates).
   */
  private addEdge(source: string, target: string, type: 'cites' | 'cited_by'): void {
    const exists = this.graph.edges.some(
      e => e.source === source && e.target === target && e.type === type
    );
    if (!exists) {
      this.graph.edges.push({ source, target, type });
    }
  }

  /**
   * Rate limiting delay between API calls.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Convenience function for quick snowballing.
 *
 * Creates a CitationSnowballer instance with the provided configuration
 * and immediately executes snowballing from the given seed papers.
 *
 * @param seedPapers - Initial papers to begin snowballing from
 * @param topicKeywords - Keywords for relevance filtering
 * @param config - Optional partial configuration overrides
 * @param onProgress - Optional callback for progress updates
 * @returns Complete snowball results
 *
 * @example
 * ```typescript
 * const results = await snowballFromSeeds(
 *   initialPapers,
 *   ['CRISPR', 'gene editing', 'therapeutic'],
 *   { maxDepth: 3, maxTotalPapers: 50 }
 * );
 * console.log(`Discovered ${results.stats.totalDiscovered} papers`);
 * ```
 */
export async function snowballFromSeeds(
  seedPapers: SearchPaper[],
  topicKeywords: string[],
  config?: Partial<SnowballConfig>,
  onProgress?: ProgressCallback
): Promise<SnowballResult> {
  const snowballer = new CitationSnowballer({
    ...config,
    topicKeywords,
  });
  return snowballer.snowball(seedPapers, onProgress);
}
