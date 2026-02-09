/**
 * Unified Research Search
 *
 * Aggregates results from multiple academic databases with
 * deduplication, ranking, and discipline-aware prioritization.
 */

import { searchPubMed } from '@/lib/pubmed/client';
import { searchArxiv, arxivClient } from './arxiv';
import {
  searchSemanticScholar,
  semanticScholarClient,
  getByDOI as getSemanticScholarByDOI,
} from './semantic-scholar';
import { searchOpenAlex, openalexClient, getByDOI as getOpenAlexByDOI } from './openalex';
import {
  type SearchQuery,
  type SearchResponse,
  type SearchResult,
  type DatabaseClient,
  normalizeTitle,
  toCitation,
} from './types';
import { type DisciplineId } from '@/lib/prompts/disciplines';

// Re-export types
export * from './types';

// Export individual clients
export { arxivClient } from './arxiv';
export { semanticScholarClient } from './semantic-scholar';
export { openalexClient } from './openalex';

/**
 * Available database sources
 */
export type DatabaseSource = 'pubmed' | 'arxiv' | 'semantic-scholar' | 'openalex';

/**
 * Unified search options
 */
export interface UnifiedSearchOptions extends SearchQuery {
  databases?: DatabaseSource[];
  discipline?: DisciplineId;
  deduplicate?: boolean;
  maxPerSource?: number;
}

/**
 * Unified search response
 */
export interface UnifiedSearchResponse {
  results: SearchResult[];
  total: number;
  bySource: Record<string, number>;
  deduplicated: number;
  executionTimeMs: number;
  errors: { source: string; error: string }[];
}

/**
 * Database clients registry
 */
const DATABASE_CLIENTS: Record<DatabaseSource, DatabaseClient> = {
  'pubmed': {
    id: 'pubmed',
    name: 'PubMed',
    async search(query: SearchQuery): Promise<SearchResponse> {
      const startTime = Date.now();
      const articles = await searchPubMed({
        query: query.text,
        maxResults: query.limit || 20,
        dateRange: query.yearRange
          ? { startYear: query.yearRange.start || 2000, endYear: query.yearRange.end || new Date().getFullYear() }
          : undefined,
      });

      const results: SearchResult[] = articles.map((article) => ({
        id: article.pmid,
        source: 'pubmed',
        title: article.title,
        authors: article.authors.map((name) => {
          const parts = name.split(' ');
          return {
            name,
            firstName: parts.slice(0, -1).join(' '),
            lastName: parts[parts.length - 1],
          };
        }),
        abstract: article.abstract,
        year: article.year,
        doi: article.doi,
        pmid: article.pmid,
        pmcid: article.pmcid,
        url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
        openAccess: !!article.pmcid,
        journal: article.journal,
        volume: article.volume,
        issue: article.issue,
        pages: article.pages,
        normalizedTitle: normalizeTitle(article.title),
      }));

      return {
        results,
        total: results.length,
        source: 'pubmed',
        query,
        executionTimeMs: Math.max(1, Date.now() - startTime),
      };
    },
    supportsFullText: () => false,
    supportsCitationCount: () => false,
    supportsRelatedPapers: () => false,
  },
  'arxiv': arxivClient,
  'semantic-scholar': semanticScholarClient,
  'openalex': openalexClient,
};

/**
 * Default database priority by discipline
 */
const DISCIPLINE_DATABASE_PRIORITY: Partial<Record<DisciplineId, DatabaseSource[]>> = {
  'life-sciences': ['pubmed', 'semantic-scholar', 'openalex'],
  'bioinformatics': ['pubmed', 'arxiv', 'semantic-scholar'],
  'chemistry': ['pubmed', 'semantic-scholar', 'openalex'],
  'clinical-medicine': ['pubmed', 'semantic-scholar', 'openalex'],
  'physics': ['arxiv', 'semantic-scholar', 'openalex'],
  'astronomy': ['arxiv', 'semantic-scholar', 'openalex'],
  'computer-science': ['arxiv', 'semantic-scholar', 'openalex'],
  'engineering': ['semantic-scholar', 'arxiv', 'openalex'],
  'materials-science': ['semantic-scholar', 'arxiv', 'openalex'],
  'mathematics': ['arxiv', 'semantic-scholar', 'openalex'],
  'neuroscience': ['pubmed', 'semantic-scholar', 'openalex'],
  'earth-sciences': ['semantic-scholar', 'openalex', 'arxiv'],
  'social-sciences': ['semantic-scholar', 'openalex'],
  'economics': ['semantic-scholar', 'arxiv', 'openalex'],
  'environmental-science': ['semantic-scholar', 'pubmed', 'openalex'],
};

/**
 * Get databases to search for a discipline
 */
function getDatabasesForDiscipline(discipline?: DisciplineId): DatabaseSource[] {
  if (discipline && DISCIPLINE_DATABASE_PRIORITY[discipline]) {
    return DISCIPLINE_DATABASE_PRIORITY[discipline]!;
  }
  // Default: all major databases
  return ['semantic-scholar', 'pubmed', 'arxiv', 'openalex'];
}

/**
 * Deduplicate results by DOI or normalized title
 */
function deduplicateResults(results: SearchResult[]): {
  deduplicated: SearchResult[];
  duplicateCount: number;
} {
  const seen = new Map<string, SearchResult>();

  for (const result of results) {
    // Primary key: DOI (most reliable)
    if (result.doi) {
      const doiKey = result.doi.toLowerCase();
      if (!seen.has(doiKey)) {
        seen.set(doiKey, result);
      } else {
        // Merge: prefer result with more data
        const existing = seen.get(doiKey)!;
        seen.set(doiKey, mergeResults(existing, result));
      }
      continue;
    }

    // Secondary key: normalized title
    const titleKey = result.normalizedTitle || normalizeTitle(result.title);
    if (titleKey && titleKey.length > 20) {
      if (!seen.has(titleKey)) {
        seen.set(titleKey, result);
      } else {
        const existing = seen.get(titleKey)!;
        seen.set(titleKey, mergeResults(existing, result));
      }
      continue;
    }

    // No good dedup key, include as-is
    const uniqueKey = `${result.source}:${result.id}`;
    seen.set(uniqueKey, result);
  }

  const deduplicated = Array.from(seen.values());
  return {
    deduplicated,
    duplicateCount: results.length - deduplicated.length,
  };
}

/**
 * Merge two results, preferring more complete data
 */
function mergeResults(a: SearchResult, b: SearchResult): SearchResult {
  return {
    ...a,
    // Prefer non-empty values
    abstract: a.abstract || b.abstract,
    doi: a.doi || b.doi,
    pmid: a.pmid || b.pmid,
    arxivId: a.arxivId || b.arxivId,
    pdfUrl: a.pdfUrl || b.pdfUrl,
    // Prefer higher citation count
    citationCount: Math.max(a.citationCount || 0, b.citationCount || 0) || undefined,
    // Combine sources info
    openAccess: a.openAccess || b.openAccess,
  };
}

/**
 * Rank results by relevance and quality
 */
function rankResults(results: SearchResult[], query: string): SearchResult[] {
  const queryTerms = query.toLowerCase().split(/\s+/);

  return results.sort((a, b) => {
    // Score based on multiple factors
    let scoreA = 0;
    let scoreB = 0;

    // Title match (highest weight)
    const titleA = a.title.toLowerCase();
    const titleB = b.title.toLowerCase();
    for (const term of queryTerms) {
      if (titleA.includes(term)) scoreA += 10;
      if (titleB.includes(term)) scoreB += 10;
    }

    // Citation count (logarithmic scale)
    if (a.citationCount) scoreA += Math.log10(a.citationCount + 1) * 2;
    if (b.citationCount) scoreB += Math.log10(b.citationCount + 1) * 2;

    // Recency bonus (papers from last 3 years)
    const currentYear = new Date().getFullYear();
    if (a.year >= currentYear - 3) scoreA += 3;
    if (b.year >= currentYear - 3) scoreB += 3;

    // Open access bonus
    if (a.openAccess) scoreA += 1;
    if (b.openAccess) scoreB += 1;

    // PDF available bonus
    if (a.pdfUrl) scoreA += 1;
    if (b.pdfUrl) scoreB += 1;

    return scoreB - scoreA;
  });
}

/**
 * Unified search across multiple databases
 */
export async function unifiedSearch(options: UnifiedSearchOptions): Promise<UnifiedSearchResponse> {
  const startTime = Date.now();

  // Determine which databases to search
  const databases = options.databases || getDatabasesForDiscipline(options.discipline);
  const maxPerSource = options.maxPerSource || Math.ceil((options.limit || 20) / databases.length);

  // Prepare search query for each database
  const searchQuery: SearchQuery = {
    text: options.text,
    fields: options.fields,
    yearRange: options.yearRange,
    openAccessOnly: options.openAccessOnly,
    limit: maxPerSource,
    offset: 0,
  };

  // Search all databases in parallel
  const searchPromises = databases.map(async (source) => {
    const client = DATABASE_CLIENTS[source];
    if (!client) {
      return { source, error: `Unknown database: ${source}` };
    }

    try {
      const response = await client.search(searchQuery);
      return { source, response };
    } catch (error) {
      return {
        source,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  const searchResults = await Promise.all(searchPromises);

  // Collect results and errors
  const allResults: SearchResult[] = [];
  const bySource: Record<string, number> = {};
  const errors: { source: string; error: string }[] = [];

  for (const result of searchResults) {
    if ('error' in result && result.error) {
      errors.push({ source: result.source, error: result.error });
    } else if ('response' in result && result.response) {
      allResults.push(...result.response.results);
      bySource[result.source] = result.response.results.length;
    }
  }

  // Deduplicate if requested (default: true)
  let finalResults = allResults;
  let duplicateCount = 0;

  if (options.deduplicate !== false) {
    const deduped = deduplicateResults(allResults);
    finalResults = deduped.deduplicated;
    duplicateCount = deduped.duplicateCount;
  }

  // Rank results
  finalResults = rankResults(finalResults, options.text);

  // Apply final limit
  if (options.limit) {
    finalResults = finalResults.slice(0, options.limit);
  }

  return {
    results: finalResults,
    total: finalResults.length,
    bySource,
    deduplicated: duplicateCount,
    executionTimeMs: Math.max(1, Date.now() - startTime),
    errors,
  };
}

/**
 * Search a single database
 */
export async function searchDatabase(
  source: DatabaseSource,
  query: SearchQuery
): Promise<SearchResponse> {
  const client = DATABASE_CLIENTS[source];
  if (!client) {
    throw new Error(`Unknown database: ${source}`);
  }
  return client.search(query);
}

/**
 * Get paper by DOI from any database
 */
export async function getByDOI(doi: string): Promise<SearchResult | null> {
  // Try Semantic Scholar first (best metadata)
  try {
    const ssResult = await getSemanticScholarByDOI(doi);
    if (ssResult) return ssResult;
  } catch {
    // Fall through to OpenAlex
  }

  // Try OpenAlex (use the dedicated getByDOI function)
  const oaResult = await getOpenAlexByDOI(doi);
  if (oaResult) return oaResult;

  return null;
}

/**
 * Generate citation for a search result
 */
export function generateCitation(result: SearchResult): string {
  return toCitation(result);
}

/**
 * Format results for AI context
 */
export function formatResultsForAI(results: SearchResult[]): string {
  return results
    .map((r, i) => {
      const citation = toCitation(r);
      return `[${i + 1}] ${r.title}
   ${citation}
   ${r.abstract?.slice(0, 200)}${r.abstract && r.abstract.length > 200 ? '...' : ''}
   Source: ${r.source}${r.citationCount ? ` | Citations: ${r.citationCount}` : ''}${r.openAccess ? ' | Open Access' : ''}`;
    })
    .join('\n\n');
}
