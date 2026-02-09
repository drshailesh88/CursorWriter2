/**
 * OpenAlex API Client
 *
 * OpenAlex is a free, open catalog of the global research system.
 * 250M+ works across all disciplines.
 *
 * API Documentation: https://docs.openalex.org/
 * Rate Limit: 100,000 requests per day (with polite email)
 *             10 requests per second max
 */

import {
  type SearchQuery,
  type SearchResponse,
  type SearchResult,
  type Author,
  type DatabaseClient,
  normalizeTitle,
} from './types';

const API_BASE = 'https://api.openalex.org';

// Email for polite pool (higher rate limits)
const POLITE_EMAIL = process.env.OPENALEX_EMAIL || 'contact@academicwriting.app';

interface OpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  publication_date?: string;
  type?: string;
  cited_by_count?: number;
  is_oa?: boolean;
  open_access?: {
    is_oa: boolean;
    oa_status: string;
    oa_url?: string;
  };
  authorships?: {
    author_position: string;
    author: {
      id: string;
      display_name: string;
      orcid?: string;
    };
    institutions?: {
      display_name: string;
    }[];
  }[];
  primary_location?: {
    source?: {
      display_name: string;
    };
  };
  abstract_inverted_index?: Record<string, number[]>;
  concepts?: {
    id: string;
    display_name: string;
    level: number;
    score: number;
  }[];
  keywords?: {
    keyword: string;
    score: number;
  }[];
}

interface OpenAlexSearchResponse {
  meta: {
    count: number;
    db_response_time_ms: number;
    page: number;
    per_page: number;
  };
  results: OpenAlexWork[];
}

/**
 * Reconstruct abstract from inverted index
 * OpenAlex stores abstracts as inverted indexes to save space
 */
function reconstructAbstract(invertedIndex: Record<string, number[]> | undefined): string {
  if (!invertedIndex) return '';

  const words: [string, number][] = [];

  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }

  // Sort by position and join
  words.sort((a, b) => a[1] - b[1]);
  return words.map((w) => w[0]).join(' ');
}

/**
 * Convert OpenAlex work to SearchResult
 */
function toSearchResult(work: OpenAlexWork): SearchResult {
  const authors: Author[] = (work.authorships || []).map((a) => {
    const name = a.author.display_name;
    const parts = name.split(' ');
    return {
      name,
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
      orcid: a.author.orcid,
      affiliations: a.institutions?.map((i) => i.display_name),
    };
  });

  // Extract OpenAlex ID (remove URL prefix)
  const openalexId = work.id.replace('https://openalex.org/', '');

  // Get DOI without prefix
  const doi = work.doi?.replace('https://doi.org/', '');

  return {
    id: openalexId,
    source: 'openalex',
    title: work.display_name || work.title || '',
    authors,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    year: work.publication_year || new Date().getFullYear(),
    doi,
    url: work.id,
    pdfUrl: work.open_access?.oa_url,
    citationCount: work.cited_by_count,
    openAccess: work.is_oa || work.open_access?.is_oa || false,
    venue: work.primary_location?.source?.display_name,
    categories: work.concepts?.slice(0, 5).map((c) => c.display_name),
    keywords: work.keywords?.map((k) => k.keyword),
    normalizedTitle: normalizeTitle(work.display_name || work.title || ''),
  };
}

/**
 * Build OpenAlex filter string
 */
function buildFilter(query: SearchQuery): string {
  const filters: string[] = [];

  // Year filter
  if (query.yearRange?.start) {
    filters.push(`publication_year:>${query.yearRange.start - 1}`);
  }
  if (query.yearRange?.end) {
    filters.push(`publication_year:<${query.yearRange.end + 1}`);
  }

  // Open access filter
  if (query.openAccessOnly) {
    filters.push('is_oa:true');
  }

  // Type filter (article, book-chapter, etc.)
  if (query.categories?.includes('article')) {
    filters.push('type:article');
  }

  return filters.join(',');
}

/**
 * Search OpenAlex
 */
export async function searchOpenAlex(query: SearchQuery): Promise<SearchResponse> {
  const startTime = Date.now();

  const perPage = Math.min(query.limit || 20, 200); // Max 200 per request
  const page = Math.floor((query.offset || 0) / perPage) + 1;

  const url = new URL(`${API_BASE}/works`);
  url.searchParams.set('search', query.text);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  url.searchParams.set('mailto', POLITE_EMAIL);

  // Add filters
  const filter = buildFilter(query);
  if (filter) {
    url.searchParams.set('filter', filter);
  }

  // Sort by relevance (default) or citations
  url.searchParams.set('sort', 'relevance_score:desc');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': `AcademicWritingPlatform/1.0 (mailto:${POLITE_EMAIL})`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status} ${response.statusText}`);
    }

    const data: OpenAlexSearchResponse = await response.json();

    const results = data.results.map(toSearchResult);

    return {
      results,
      total: data.meta.count,
      source: 'openalex',
      query,
      executionTimeMs: Math.max(1, Date.now() - startTime),
    };
  } catch (error) {
    console.error('OpenAlex search error:', error);
    throw error;
  }
}

/**
 * Get work by OpenAlex ID
 */
export async function getOpenAlexById(id: string): Promise<SearchResult | null> {
  // Ensure full URL format
  const workId = id.startsWith('W') ? id : `W${id}`;
  const url = new URL(`${API_BASE}/works/${workId}`);
  url.searchParams.set('mailto', POLITE_EMAIL);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const work: OpenAlexWork = await response.json();
    return toSearchResult(work);
  } catch {
    return null;
  }
}

/**
 * Get work by DOI
 */
export async function getByDOI(doi: string): Promise<SearchResult | null> {
  const cleanDoi = doi.replace('https://doi.org/', '');
  const url = new URL(`${API_BASE}/works/doi:${cleanDoi}`);
  url.searchParams.set('mailto', POLITE_EMAIL);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const work: OpenAlexWork = await response.json();
    return toSearchResult(work);
  } catch {
    return null;
  }
}

/**
 * Get related works (same concepts/topics)
 */
export async function getRelatedWorks(workId: string, limit = 10): Promise<SearchResult[]> {
  // First get the work to find its concepts
  const work = await getOpenAlexById(workId);
  if (!work || !work.categories || work.categories.length === 0) {
    return [];
  }

  // Search for works with similar concepts
  const url = new URL(`${API_BASE}/works`);
  url.searchParams.set('filter', `concepts.display_name:${work.categories[0]}`);
  url.searchParams.set('per_page', String(limit + 1)); // +1 to exclude self
  url.searchParams.set('sort', 'cited_by_count:desc');
  url.searchParams.set('mailto', POLITE_EMAIL);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data: OpenAlexSearchResponse = await response.json();
    return data.results
      .filter((w) => w.id !== `https://openalex.org/${workId}`)
      .slice(0, limit)
      .map(toSearchResult);
  } catch {
    return [];
  }
}

/**
 * Get works that cite this work
 */
export async function getCitingWorks(workId: string, limit = 20): Promise<SearchResult[]> {
  const url = new URL(`${API_BASE}/works`);
  url.searchParams.set('filter', `cites:${workId}`);
  url.searchParams.set('per_page', String(limit));
  url.searchParams.set('sort', 'publication_year:desc');
  url.searchParams.set('mailto', POLITE_EMAIL);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data: OpenAlexSearchResponse = await response.json();
    return data.results.map(toSearchResult);
  } catch {
    return [];
  }
}

/**
 * OpenAlex Database Client
 */
export const openalexClient: DatabaseClient = {
  id: 'openalex',
  name: 'OpenAlex',

  async search(query: SearchQuery): Promise<SearchResponse> {
    return searchOpenAlex(query);
  },

  async getById(id: string): Promise<SearchResult | null> {
    return getOpenAlexById(id);
  },

  async getCitations(id: string): Promise<SearchResult[]> {
    return getCitingWorks(id);
  },

  async getRelated(id: string): Promise<SearchResult[]> {
    return getRelatedWorks(id);
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

export default openalexClient;
