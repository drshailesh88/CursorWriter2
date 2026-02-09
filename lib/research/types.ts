/**
 * Unified Research Types
 *
 * Shared types for all database clients to ensure consistent
 * data structures across PubMed, arXiv, Semantic Scholar, and OpenAlex.
 */

export interface Author {
  name: string;
  firstName?: string;
  lastName?: string;
  affiliations?: string[];
  orcid?: string;
}

export interface SearchResult {
  // Unique identifiers
  id: string;
  source: 'pubmed' | 'arxiv' | 'semantic-scholar' | 'openalex' | 'crossref' | 'biorxiv';

  // Core metadata
  title: string;
  authors: Author[];
  abstract: string;
  year: number;

  // External identifiers
  doi?: string;
  pmid?: string;
  arxivId?: string;
  pmcid?: string;

  // URLs
  url: string;
  pdfUrl?: string;

  // Metrics
  citationCount?: number;
  referenceCount?: number;
  relevanceScore?: number;

  // Access
  openAccess: boolean;

  // Additional metadata
  // Legacy alias used by older discovery fixtures.
  sources?: string[];
  journal?: string;
  venue?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  keywords?: string[];
  categories?: string[];

  // For deduplication
  normalizedTitle?: string;
}

export interface SearchQuery {
  text: string;
  fields?: ('title' | 'abstract' | 'author' | 'keyword' | 'all')[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  yearRange?: {
    start?: number;
    end?: number;
  };
  categories?: string[];
  openAccessOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  source: string;
  query: SearchQuery;
  executionTimeMs: number;
}

export interface DatabaseClient {
  id: string;
  name: string;

  search(query: SearchQuery): Promise<SearchResponse>;
  getById?(id: string): Promise<SearchResult | null>;
  getCitations?(id: string): Promise<SearchResult[]>;
  getRelated?(id: string): Promise<SearchResult[]>;

  // Capabilities
  supportsFullText(): boolean;
  supportsCitationCount(): boolean;
  supportsRelatedPapers(): boolean;
}

/**
 * Format author for citation
 */
export function formatAuthorCitation(authors: Author[]): string {
  if (authors.length === 0) return 'Unknown';

  const firstAuthor = authors[0].lastName || authors[0].name.split(' ').pop() || 'Unknown';

  if (authors.length === 1) {
    return firstAuthor;
  } else if (authors.length === 2) {
    const secondAuthor = authors[1].lastName || authors[1].name.split(' ').pop() || '';
    return `${firstAuthor} & ${secondAuthor}`;
  } else {
    return `${firstAuthor} et al.`;
  }
}

/**
 * Generate author-year citation
 */
export function toCitation(result: SearchResult): string {
  const authorPart = formatAuthorCitation(result.authors);
  return `(${authorPart}, ${result.year})`;
}

/**
 * Normalize title for deduplication
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
