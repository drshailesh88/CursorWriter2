/**
 * Semantic Scholar API Client
 *
 * Searches Semantic Scholar for papers across all scientific disciplines.
 * Provides citation counts, related papers, and author information.
 *
 * API Documentation: https://api.semanticscholar.org/
 * Rate Limit: 100 requests per 5 minutes (without API key)
 *             1000 requests per 5 minutes (with API key)
 */

import {
  type SearchQuery,
  type SearchResponse,
  type SearchResult,
  type Author,
  type DatabaseClient,
  normalizeTitle,
} from './types';

const API_BASE = 'https://api.semanticscholar.org/graph/v1';

// ============================================================================
// Response Cache - Reduces API calls and helps with rate limiting
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Cache TTL: 15 minutes (in milliseconds)
const CACHE_TTL = 15 * 60 * 1000;

// In-memory cache for API responses
const paperCache = new Map<string, CacheEntry<SemanticScholarPaper>>();
const searchCache = new Map<string, CacheEntry<SemanticScholarSearchResponse>>();
const citationsCache = new Map<string, CacheEntry<SemanticScholarPaper[]>>();
const referencesCache = new Map<string, CacheEntry<SemanticScholarPaper[]>>();

/**
 * Get cached data if valid
 */
function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  // Remove expired entry
  if (entry) {
    cache.delete(key);
  }
  return null;
}

/**
 * Store data in cache
 */
function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });

  // Limit cache size to prevent memory issues
  if (cache.size > 1000) {
    // Remove oldest entries
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    entries.slice(0, 200).forEach(([k]) => cache.delete(k));
  }
}

/**
 * Clear all caches (useful for testing or force refresh)
 */
export function clearSemanticScholarCache(): void {
  paperCache.clear();
  searchCache.clear();
  citationsCache.clear();
  referencesCache.clear();
}

// ============================================================================

// Fields to request from the API
const PAPER_FIELDS = [
  'paperId',
  'title',
  'abstract',
  'year',
  'authors',
  'citationCount',
  'influentialCitationCount',
  'isOpenAccess',
  'openAccessPdf',
  'venue',
  'publicationVenue',
  'externalIds',
  'fieldsOfStudy',
  'url',
].join(',');

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors?: {
    authorId: string;
    name: string;
  }[];
  citationCount?: number;
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdf?: {
    url: string;
    status: string;
  };
  venue?: string;
  publicationVenue?: {
    name: string;
    type: string;
  };
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    PubMed?: string;
    PMCID?: string;
    MAG?: string;
    CorpusId?: string;
  };
  fieldsOfStudy?: string[];
  url?: string;
}

interface SemanticScholarSearchResponse {
  total: number;
  offset: number;
  next?: number;
  data: SemanticScholarPaper[];
}

/**
 * Get API headers
 */
function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add API key if available (higher rate limits)
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }

  return headers;
}

/**
 * Convert Semantic Scholar paper to SearchResult
 */
function toSearchResult(paper: SemanticScholarPaper): SearchResult {
  const authors: Author[] = (paper.authors || []).map((a) => {
    const parts = a.name.split(' ');
    return {
      name: a.name,
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  });

  return {
    id: paper.paperId,
    source: 'semantic-scholar',
    title: paper.title,
    authors,
    abstract: paper.abstract || '',
    year: paper.year || new Date().getFullYear(),
    doi: paper.externalIds?.DOI,
    arxivId: paper.externalIds?.ArXiv,
    pmid: paper.externalIds?.PubMed,
    pmcid: paper.externalIds?.PMCID,
    url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
    pdfUrl: paper.openAccessPdf?.url,
    citationCount: paper.citationCount,
    openAccess: paper.isOpenAccess || false,
    venue: paper.venue || paper.publicationVenue?.name,
    categories: paper.fieldsOfStudy,
    normalizedTitle: normalizeTitle(paper.title),
  };
}

/**
 * Search Semantic Scholar with retry logic
 * Rate Limit: 100 requests per 5 minutes (without API key)
 *             1000 requests per 5 minutes (with API key)
 */
export async function searchSemanticScholar(query: SearchQuery): Promise<SearchResponse> {
  const startTime = Date.now();

  const limit = Math.min(query.limit || 20, 100); // Max 100 per request
  const offset = query.offset || 0;

  const url = new URL(`${API_BASE}/paper/search`);
  url.searchParams.set('query', query.text);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('fields', PAPER_FIELDS);

  // Year filter
  if (query.yearRange?.start || query.yearRange?.end) {
    const yearFilter = [];
    if (query.yearRange.start) yearFilter.push(String(query.yearRange.start));
    yearFilter.push('-');
    if (query.yearRange.end) yearFilter.push(String(query.yearRange.end));
    url.searchParams.set('year', yearFilter.join(''));
  }

  // Open access filter
  if (query.openAccessOnly) {
    url.searchParams.set('openAccessPdf', '');
  }

  // Fields of study filter (categories)
  if (query.categories && query.categories.length > 0) {
    url.searchParams.set('fieldsOfStudy', query.categories.join(','));
  }

  // Edge Case: Retry with exponential backoff for rate limiting
  const fetchWithRetry = async (attempt = 0): Promise<SemanticScholarSearchResponse> => {
    try {
      // Add delay for retries
      if (attempt > 0) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000); // Max 30 seconds
        console.info(`Waiting ${delay}ms before retry (attempt ${attempt + 1}/3)...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });

      // Edge Case: Handle 429 rate limit with retry
      if (response.status === 429) {
        if (attempt < 3) {
          console.warn(`Semantic Scholar rate limit hit, retrying (attempt ${attempt + 1}/3)...`);
          return fetchWithRetry(attempt + 1);
        }
        throw new Error('Semantic Scholar rate limit exceeded. Please try again in a few minutes.');
      }

      // Edge Case: Handle 503 service unavailable with retry
      if (response.status === 503) {
        if (attempt < 2) {
          console.warn(`Semantic Scholar service unavailable, retrying (attempt ${attempt + 1}/2)...`);
          return fetchWithRetry(attempt + 1);
        }
        throw new Error('Semantic Scholar service temporarily unavailable. Please try again later.');
      }

      if (!response.ok) {
        throw new Error(`Semantic Scholar API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      // Edge Case: Retry on network errors
      if (attempt < 3 && (error instanceof TypeError || (error as Error).message.includes('network'))) {
        console.warn(`Semantic Scholar network error, retrying (attempt ${attempt + 1}/3)...`);
        return fetchWithRetry(attempt + 1);
      }
      throw error;
    }
  };

  try {
    const data = await fetchWithRetry();
    const results = data.data.map(toSearchResult);

    return {
      results,
      total: data.total,
      source: 'semantic-scholar',
      query,
      executionTimeMs: Math.max(1, Date.now() - startTime),
    };
  } catch (error) {
    console.error('Semantic Scholar search error:', error);
    throw error;
  }
}

/**
 * Get paper by Semantic Scholar ID
 */
export async function getSemanticScholarById(paperId: string): Promise<SearchResult | null> {
  // Check cache first
  const cached = getCached(paperCache, paperId);
  if (cached) {
    return toSearchResult(cached);
  }

  const url = new URL(`${API_BASE}/paper/${paperId}`);
  url.searchParams.set('fields', PAPER_FIELDS);

  try {
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) return null;

    const paper: SemanticScholarPaper = await response.json();
    // Cache the result
    setCache(paperCache, paperId, paper);
    return toSearchResult(paper);
  } catch {
    return null;
  }
}

/**
 * Get paper by DOI
 */
export async function getByDOI(doi: string): Promise<SearchResult | null> {
  const cleanDoi = doi.replace('https://doi.org/', '');
  const paperId = `DOI:${cleanDoi}`;
  const url = new URL(`${API_BASE}/paper/${paperId}`);
  url.searchParams.set('fields', PAPER_FIELDS);

  try {
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) return null;

    const paper: SemanticScholarPaper = await response.json();
    setCache(paperCache, paperId, paper);
    return toSearchResult(paper);
  } catch {
    return null;
  }
}

/**
 * Get paper by arXiv ID
 */
export async function getByArxivId(arxivId: string): Promise<SearchResult | null> {
  return getSemanticScholarById(`ARXIV:${arxivId}`);
}

/**
 * Get paper by PubMed ID
 */
export async function getByPMID(pmid: string): Promise<SearchResult | null> {
  return getSemanticScholarById(`PMID:${pmid}`);
}

/**
 * Get related/recommended papers
 */
export async function getRelatedPapers(paperId: string, limit = 10): Promise<SearchResult[]> {
  const url = new URL(`${API_BASE}/paper/${paperId}/recommendations`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', PAPER_FIELDS);

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ positivePaperIds: [paperId] }),
    });

    if (!response.ok) return [];

    const data: { recommendedPapers: SemanticScholarPaper[] } = await response.json();
    return data.recommendedPapers.map(toSearchResult);
  } catch {
    return [];
  }
}

/**
 * Get papers that cite this paper
 */
export async function getCitations(paperId: string, limit = 20): Promise<SearchResult[]> {
  // Check cache first
  const cacheKey = `${paperId}:${limit}`;
  const cached = getCached(citationsCache, cacheKey);
  if (cached) {
    return cached.map((p) => toSearchResult(p));
  }

  const url = new URL(`${API_BASE}/paper/${paperId}/citations`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', `citingPaper.${PAPER_FIELDS}`);

  try {
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) return [];

    const data: { data: { citingPaper: SemanticScholarPaper }[] } = await response.json();
    const papers = data.data.map((d) => d.citingPaper);
    // Cache the raw papers
    setCache(citationsCache, cacheKey, papers);
    return papers.map((p) => toSearchResult(p));
  } catch {
    return [];
  }
}

/**
 * Get papers this paper references
 */
export async function getReferences(paperId: string, limit = 20): Promise<SearchResult[]> {
  // Check cache first
  const cacheKey = `${paperId}:${limit}`;
  const cached = getCached(referencesCache, cacheKey);
  if (cached) {
    return cached.map((p) => toSearchResult(p));
  }

  const url = new URL(`${API_BASE}/paper/${paperId}/references`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', `citedPaper.${PAPER_FIELDS}`);

  try {
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
    });

    if (!response.ok) return [];

    const data: { data: { citedPaper: SemanticScholarPaper }[] } = await response.json();
    const papers = data.data.map((d) => d.citedPaper);
    // Cache the raw papers
    setCache(referencesCache, cacheKey, papers);
    return papers.map((p) => toSearchResult(p));
  } catch {
    return [];
  }
}

/**
 * Semantic Scholar Database Client
 */
export const semanticScholarClient: DatabaseClient = {
  id: 'semantic-scholar',
  name: 'Semantic Scholar',

  async search(query: SearchQuery): Promise<SearchResponse> {
    return searchSemanticScholar(query);
  },

  async getById(id: string): Promise<SearchResult | null> {
    return getSemanticScholarById(id);
  },

  async getCitations(id: string): Promise<SearchResult[]> {
    return getCitations(id);
  },

  async getRelated(id: string): Promise<SearchResult[]> {
    return getRelatedPapers(id);
  },

  supportsFullText(): boolean {
    return false;
  },

  supportsCitationCount(): boolean {
    return true;
  },

  supportsRelatedPapers(): boolean {
    return true;
  },
};

export default semanticScholarClient;
