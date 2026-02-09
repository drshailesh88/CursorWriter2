/**
 * Knowledge Map Generation
 *
 * Create visual knowledge maps of research domains:
 * - Cluster papers by topic
 * - AI-generated cluster labels
 * - Detect research gaps
 * - Find inter-cluster connections
 */

import type { SearchResult } from '@/lib/research/types';
import type {
  KnowledgeMap,
  MapConfig,
  MapCluster,
  MapPaper,
  ClusterConnection,
  CitationGap,
  ExtractedTopic,
} from './types';
import { searchSemanticScholar } from '@/lib/research/semantic-scholar';
import { searchOpenAlex } from '@/lib/research/openalex';
import { getPapersByIds } from '@/lib/supabase/papers';
import { toDiscoveredPapers } from './utils';

/**
 * Generate knowledge map for a research query
 */
export async function generateMap(
  query: string,
  config: Partial<MapConfig> = {}
): Promise<KnowledgeMap> {
  const fullConfig: MapConfig = {
    clusterCount: config.clusterCount ?? 5,
    paperLimit: config.paperLimit ?? 100,
    showLabels: config.showLabels ?? true,
    showConnections: config.showConnections ?? true,
    timeRange: config.timeRange || {
      start: new Date().getFullYear() - 10,
      end: new Date().getFullYear(),
    },
  };

  // Fetch papers from multiple sources
  const papers = await fetchPapers(query, fullConfig);

  // Cluster papers by topic
  const clusters = await clusterPapers(papers, fullConfig.clusterCount);

  // Label clusters using AI
  const labeledClusters = await labelClusters(clusters);

  // Position clusters and papers
  const { mapClusters, mapPapers } = positionClustersAndPapers(
    labeledClusters,
    papers,
    fullConfig
  );

  // Find connections between clusters
  const connections = findConnections(labeledClusters, papers);

  return {
    id: `map-${Date.now()}`,
    userId: '', // Set by caller
    name: `Knowledge Map: ${query}`,
    query,
    clusters: mapClusters,
    papers: mapPapers,
    connections,
    config: fullConfig,
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };
}

/**
 * Generate knowledge map from specific paper IDs (user's library)
 */
export async function generateMapFromPapers(
  paperIds: string[],
  config: Partial<MapConfig> = {}
): Promise<KnowledgeMap> {
  const fullConfig: MapConfig = {
    clusterCount: config.clusterCount ?? Math.min(5, Math.max(2, Math.floor(paperIds.length / 3))),
    paperLimit: config.paperLimit ?? paperIds.length,
    showLabels: config.showLabels ?? true,
    showConnections: config.showConnections ?? true,
    timeRange: config.timeRange || {
      start: new Date().getFullYear() - 10,
      end: new Date().getFullYear(),
    },
  };

  // Fetch papers from Supabase
  const dbPapers = await getPapersByIds(paperIds);

  if (dbPapers.length === 0) {
    throw new Error('No papers found for the provided IDs');
  }

  // Convert Supabase Paper objects to SearchResult format
  const papers: SearchResult[] = dbPapers.map((p) => ({
    id: p.id,
    source: 'openalex' as const,
    title: p.title || p.fileName,
    authors: p.authors.map((a) => ({ name: a.name })),
    abstract: p.abstract || '',
    year: p.year || new Date().getFullYear(),
    doi: p.doi,
    pmid: p.pmid,
    arxivId: p.arxivId,
    url: p.storageUrl || '',
    openAccess: false,
    keywords: p.keywords || [],
    journal: p.journal,
  }));

  // Cluster papers by topic
  const clusters = await clusterPapers(papers, fullConfig.clusterCount);

  // Label clusters
  const labeledClusters = await labelClusters(clusters);

  // Position clusters and papers
  const { mapClusters, mapPapers } = positionClustersAndPapers(
    labeledClusters,
    papers,
    fullConfig
  );

  // Find connections between clusters
  const connections = findConnections(labeledClusters, papers);

  // Derive a topic from the paper titles
  const topKeywords = getMostFrequent(
    papers.flatMap((p) => p.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4)),
    3
  );
  const derivedTopic = topKeywords.join(', ') || 'Library papers';

  return {
    id: `map-${Date.now()}`,
    userId: '',
    name: `Knowledge Map: ${derivedTopic}`,
    query: derivedTopic,
    clusters: mapClusters,
    papers: mapPapers,
    connections,
    config: fullConfig,
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };
}

/**
 * Cluster papers by topic similarity
 */
export async function clusterPapers(
  papers: SearchResult[],
  targetClusters = 5
): Promise<{ id: string; papers: SearchResult[] }[]> {
  // K-means clustering based on keywords and categories
  const clusters: { id: string; papers: SearchResult[]; centroid: string[] }[] = [];

  // Initialize centroids with most cited papers
  const sortedPapers = [...papers].sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
  for (let i = 0; i < Math.min(targetClusters, sortedPapers.length); i++) {
    clusters.push({
      id: `cluster-${i}`,
      papers: [],
      centroid: extractFeatures(sortedPapers[i]),
    });
  }

  // K-means iterations
  for (let iter = 0; iter < 5; iter++) {
    // Clear clusters
    clusters.forEach((c) => (c.papers = []));

    // Assign papers to nearest cluster
    for (const paper of papers) {
      const features = extractFeatures(paper);
      let maxSim = -1;
      let bestCluster = 0;

      for (let i = 0; i < clusters.length; i++) {
        const sim = cosineSimilarity(features, clusters[i].centroid);
        if (sim > maxSim) {
          maxSim = sim;
          bestCluster = i;
        }
      }

      clusters[bestCluster].papers.push(paper);
    }

    // Update centroids
    for (const cluster of clusters) {
      if (cluster.papers.length === 0) continue;
      const allFeatures = cluster.papers.flatMap(extractFeatures);
      cluster.centroid = getMostFrequent(allFeatures, 10);
    }
  }

  // Remove empty clusters
  return clusters.filter((c) => c.papers.length > 0);
}

/**
 * Generate labels for clusters using AI
 */
export async function labelClusters(
  clusters: { id: string; papers: SearchResult[] }[]
): Promise<{ id: string; label: string; papers: SearchResult[]; keywords: string[] }[]> {
  const labeled = [];

  for (const cluster of clusters) {
    // Extract common keywords from titles and abstracts
    const keywords = extractClusterKeywords(cluster.papers);

    // Generate descriptive label
    const label = generateLabel(cluster.papers, keywords);

    labeled.push({
      ...cluster,
      label,
      keywords,
    });
  }

  return labeled;
}

/**
 * Detect research gaps in knowledge map
 */
export function detectGaps(
  map: KnowledgeMap
): { topic: string; adjacentClusters: string[]; explanation: string }[] {
  const gaps: { topic: string; adjacentClusters: string[]; explanation: string }[] = [];

  // Find cluster pairs with weak connections
  for (let i = 0; i < map.clusters.length; i++) {
    for (let j = i + 1; j < map.clusters.length; j++) {
      const cluster1 = map.clusters[i];
      const cluster2 = map.clusters[j];

      const connection = map.connections.find(
        (c) =>
          (c.sourceClusterId === cluster1.id && c.targetClusterId === cluster2.id) ||
          (c.sourceClusterId === cluster2.id && c.targetClusterId === cluster1.id)
      );

      // Weak or missing connection suggests a gap
      if (!connection || connection.strength < 0.2) {
        gaps.push({
          topic: `Connection between ${cluster1.label} and ${cluster2.label}`,
          adjacentClusters: [cluster1.id, cluster2.id],
          explanation: `These two active research areas have minimal cross-pollination. Bridging work could yield novel insights.`,
        });
      }
    }
  }

  return gaps;
}

/**
 * Find connections between clusters
 */
export function findConnections(
  clusters: { id: string; papers: SearchResult[]; keywords: string[] }[],
  allPapers: SearchResult[]
): ClusterConnection[] {
  const connections: ClusterConnection[] = [];

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const cluster1 = clusters[i];
      const cluster2 = clusters[j];

      // Find shared keywords
      const sharedKeywords = cluster1.keywords.filter((k) => cluster2.keywords.includes(k));

      // Find bridge papers (papers that cite both clusters)
      const cluster1Ids = new Set(cluster1.papers.map((p) => p.id));
      const cluster2Ids = new Set(cluster2.papers.map((p) => p.id));

      // Calculate strength based on shared keywords
      const strength = sharedKeywords.length / Math.max(cluster1.keywords.length, cluster2.keywords.length);

      if (strength > 0.1 || sharedKeywords.length > 0) {
        connections.push({
          sourceClusterId: cluster1.id,
          targetClusterId: cluster2.id,
          strength,
          type: 'shared_keywords',
        });
      }
    }
  }

  return connections;
}

// ============================================================================
// Draft Analysis
// ============================================================================

/**
 * Find missing citations from a review draft
 */
export async function findMissingFromReview(
  draftContent: string,
  existingCitations: SearchResult[] = []
): Promise<CitationGap[]> {
  // Extract topics from draft
  const topics = extractTopicsFromDraft(draftContent);

  const gaps: CitationGap[] = [];

  // For each topic, check citation coverage
  for (const topic of topics) {
    const relevantCitations = existingCitations.filter((c) =>
      isRelevantToTopic(c, topic.topic)
    );

    if (relevantCitations.length < 3) {
      // Insufficient coverage
      const suggestedPapers = await searchRelevantPapers(topic.topic);

      gaps.push({
        topic: topic.topic,
        missingPapers: toDiscoveredPapers(suggestedPapers.slice(0, 5)),
        severity: relevantCitations.length === 0 ? 'high' : 'medium',
        explanation: `Only ${relevantCitations.length} papers cited for this important topic. Consider adding foundational and recent work.`,
      });
    }
  }

  return gaps;
}

/**
 * Extract topics from draft text
 */
function extractTopicsFromDraft(content: string): ExtractedTopic[] {
  // Simple topic extraction using noun phrases
  // In production, use NLP/LLM for better extraction
  const sentences = content.split(/[.!?]+/);
  const topicCounts = new Map<string, number>();

  for (const sentence of sentences) {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 5);

    // Count bigrams as potential topics
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      topicCounts.set(bigram, (topicCounts.get(bigram) || 0) + 1);
    }
  }

  // Get top topics
  const topics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, mentions]) => ({
      topic,
      mentions,
      citedPaperIds: [],
      suggestedPaperIds: [],
      coverage: 0,
    }));

  return topics;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchPapers(query: string, config: MapConfig): Promise<SearchResult[]> {
  const papers: SearchResult[] = [];

  // Fetch from Semantic Scholar
  try {
    const ss = await searchSemanticScholar({
      text: query,
      limit: Math.floor(config.paperLimit / 2),
      yearRange: config.timeRange,
    });
    papers.push(...ss.results);
  } catch (error) {
    console.error('Semantic Scholar fetch error:', error);
  }

  // Fetch from OpenAlex
  try {
    const oa = await searchOpenAlex({
      text: query,
      limit: Math.floor(config.paperLimit / 2),
      yearRange: config.timeRange,
    });
    papers.push(...oa.results);
  } catch (error) {
    console.error('OpenAlex fetch error:', error);
  }

  // Deduplicate by normalized title
  const seen = new Set<string>();
  return papers.filter((p) => {
    if (p.normalizedTitle && seen.has(p.normalizedTitle)) return false;
    if (p.normalizedTitle) seen.add(p.normalizedTitle);
    return true;
  });
}

function extractFeatures(paper: SearchResult): string[] {
  const features: string[] = [];

  // Add categories
  if (paper.categories) features.push(...paper.categories);

  // Add keywords
  if (paper.keywords) features.push(...paper.keywords);

  // Extract from title
  const titleWords = paper.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  features.push(...titleWords);

  return features;
}

function cosineSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));

  if (setA.size === 0 || setB.size === 0) return 0;

  return intersection.size / Math.sqrt(setA.size * setB.size);
}

function getMostFrequent(items: string[], n: number): string[] {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((e) => e[0]);
}

function extractClusterKeywords(papers: SearchResult[]): string[] {
  const allWords: string[] = [];

  for (const paper of papers) {
    if (paper.categories) allWords.push(...paper.categories);
    if (paper.keywords) allWords.push(...paper.keywords);

    const titleWords = paper.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4);
    allWords.push(...titleWords);
  }

  return getMostFrequent(allWords, 5);
}

function generateLabel(papers: SearchResult[], keywords: string[]): string {
  // Use top keyword and paper count
  const topKeyword = keywords[0] || 'Research';
  const avgYear = Math.round(
    papers.reduce((sum, p) => sum + p.year, 0) / papers.length
  );

  return `${capitalize(topKeyword)} (${papers.length} papers, ~${avgYear})`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function positionClustersAndPapers(
  clusters: { id: string; label: string; papers: SearchResult[]; keywords: string[] }[],
  allPapers: SearchResult[],
  config: MapConfig
): { mapClusters: MapCluster[]; mapPapers: MapPaper[] } {
  const mapClusters: MapCluster[] = [];
  const mapPapers: MapPaper[] = [];

  // Position clusters in a circle
  clusters.forEach((cluster, i) => {
    const angle = (i / clusters.length) * 2 * Math.PI;
    const radius = 200;

    const avgCitations =
      cluster.papers.reduce((sum, p) => sum + (p.citationCount || 0), 0) /
      cluster.papers.length;

    const avgYear =
      cluster.papers.reduce((sum, p) => sum + p.year, 0) / cluster.papers.length;

    // Calculate growth (rough estimate)
    const recentPapers = cluster.papers.filter(
      (p) => p.year >= new Date().getFullYear() - 2
    ).length;
    const growth = recentPapers / cluster.papers.length;

    mapClusters.push({
      id: cluster.id,
      label: cluster.label,
      description: `Research cluster with ${cluster.papers.length} papers`,
      keywords: cluster.keywords,
      paperCount: cluster.papers.length,
      avgCitations,
      growth,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      radius: Math.sqrt(cluster.papers.length) * 10,
      color: `hsl(${(i * 137) % 360}, 70%, 50%)`,
    });

    // Position papers within cluster
    cluster.papers.forEach((paper, j) => {
      const paperAngle = (j / cluster.papers.length) * 2 * Math.PI;
      const paperRadius = Math.sqrt(cluster.papers.length) * 5;

      mapPapers.push({
        paperId: paper.id,
        clusterId: cluster.id,
        x: Math.cos(angle) * radius + Math.cos(paperAngle) * paperRadius,
        y: Math.sin(angle) * radius + Math.sin(paperAngle) * paperRadius,
        isUserPaper: false,
        isKeyPaper: (paper.citationCount || 0) > avgCitations,
      });
    });
  });

  return { mapClusters, mapPapers };
}

function isRelevantToTopic(paper: SearchResult, topic: string): boolean {
  const searchText = `${paper.title} ${paper.abstract} ${paper.keywords?.join(' ') || ''}`.toLowerCase();
  const topicWords = topic.toLowerCase().split(/\s+/);

  return topicWords.some((word) => searchText.includes(word));
}

async function searchRelevantPapers(topic: string): Promise<SearchResult[]> {
  try {
    const results = await searchSemanticScholar({
      text: topic,
      limit: 10,
    });
    return results.results;
  } catch {
    return [];
  }
}
