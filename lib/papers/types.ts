// Paper Processing Types

import type {
  PaperAuthor,
  PaperSection,
  PaperFigure,
  PaperTable,
  PaperReference,
  PaperParagraph,
  PaperSectionType,
} from '@/lib/supabase/schema';

// Re-export quality types from quality.ts to avoid duplication
export type {
  QualityAssessment,
  QualityGrade,
  BiasRisk as BiasRiskLevel,
  BiasType,
  QualityComponents,
  StudyDesign,
} from './quality';

/**
 * Options for PDF processing
 */
export interface PDFProcessingOptions {
  extractFigures?: boolean;
  extractTables?: boolean;
  extractReferences?: boolean;
  parseEquations?: boolean;
  ocrEnabled?: boolean;
  provider?: 'llamaparse' | 'pdfparse' | 'auto';
}

/**
 * Default processing options
 */
export const DEFAULT_PROCESSING_OPTIONS: PDFProcessingOptions = {
  extractFigures: true,
  extractTables: true,
  extractReferences: true,
  parseEquations: true,
  ocrEnabled: true,
  provider: 'auto',
};

/**
 * Raw extraction result from PDF processor
 */
export interface RawExtractionResult {
  text: string;
  pageCount: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  figures?: Array<{
    pageNumber: number;
    caption?: string;
    imageData?: string; // Base64
  }>;
  tables?: Array<{
    pageNumber: number;
    caption?: string;
    data: string[][];
  }>;
}

/**
 * PDF processing error types
 */
export type PDFErrorType =
  | 'password_protected'
  | 'corrupted'
  | 'scanned'
  | 'too_large'
  | 'unsupported_format'
  | 'extraction_failed'
  | 'unknown';

/**
 * PDF processing error
 */
export interface PDFProcessingError {
  type: PDFErrorType;
  message: string;
  userMessage: string;
  suggestion?: string;
  recoverable: boolean;
}

/**
 * Processing warnings
 */
export interface ProcessingWarning {
  type: 'low_text_density' | 'missing_metadata' | 'poor_structure' | 'large_file';
  message: string;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Processed paper result
 */
export interface ProcessedPaperResult {
  // Basic info
  fileName: string;
  fileSize: number;
  pageCount: number;

  // Extracted metadata
  title: string;
  authors: PaperAuthor[];
  year?: number;
  journal?: string;
  doi?: string;
  abstract?: string;
  keywords?: string[];

  // Structured content
  fullText: string;
  sections: PaperSection[];
  paragraphs: PaperParagraph[];

  // Extracted elements
  figures: PaperFigure[];
  tables: PaperTable[];
  references: PaperReference[];
  equations?: string[];

  // Quality metrics
  extractionQuality: 'high' | 'medium' | 'low';
  ocrRequired: boolean;
  isScanned: boolean;
  processingTimeMs: number;

  // Warnings and issues
  warnings?: ProcessingWarning[];
  hasPasswordProtection?: boolean;
  textDensity?: number; // Characters per page
}

/**
 * Section detection patterns
 */
export const SECTION_PATTERNS: Record<PaperSectionType, RegExp[]> = {
  title: [],
  abstract: [/^abstract$/i, /^summary$/i],
  introduction: [/^introduction$/i, /^background$/i, /^\d+\.?\s*introduction$/i],
  background: [/^background$/i, /^related\s+work$/i, /^literature\s+review$/i],
  literature_review: [/^literature\s+review$/i, /^related\s+work$/i, /^prior\s+work$/i],
  methods: [
    /^methods?$/i,
    /^methodology$/i,
    /^materials?\s+(and|&)\s+methods?$/i,
    /^experimental$/i,
    /^\d+\.?\s*methods?$/i,
  ],
  results: [/^results?$/i, /^findings$/i, /^\d+\.?\s*results?$/i],
  discussion: [/^discussion$/i, /^\d+\.?\s*discussion$/i],
  conclusion: [
    /^conclusions?$/i,
    /^concluding\s+remarks$/i,
    /^summary\s+(and|&)\s+conclusions?$/i,
    /^\d+\.?\s*conclusions?$/i,
  ],
  acknowledgments: [/^acknowledgm?ents?$/i, /^funding$/i],
  references: [/^references?$/i, /^bibliography$/i, /^citations?$/i, /^literature\s+cited$/i],
  appendix: [/^appendix/i, /^supplementary/i, /^supporting\s+information$/i],
  supplementary: [/^supplementary/i, /^supporting\s+information$/i, /^additional\s+data$/i],
  unknown: [],
};

/**
 * Metadata enrichment source
 */
export type EnrichmentSource = 'crossref' | 'pubmed' | 'semantic_scholar' | 'openalex';

/**
 * Enrichment result
 */
export interface EnrichmentResult {
  source: EnrichmentSource;
  doi?: string;
  pmid?: string;
  title?: string;
  authors?: PaperAuthor[];
  year?: number;
  journal?: string;
  abstract?: string;
  citationCount?: number;
  openAccess?: boolean;
  keywords?: string[];
  references?: string[];
}

/**
 * Processing progress event
 */
export interface ProcessingProgressEvent {
  paperId: string;
  status: string;
  progress: number;
  message?: string;
}

/**
 * Chunking configuration for embeddings
 */
export interface ChunkingConfig {
  strategy: 'fixed' | 'semantic' | 'section';
  chunkSize: number;
  chunkOverlap: number;
  minChunkSize: number;
  maxChunkSize: number;
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  strategy: 'section',
  chunkSize: 512,
  chunkOverlap: 100,
  minChunkSize: 100,
  maxChunkSize: 1000,
};

/**
 * Paper chunk for embedding
 */
export interface PaperChunk {
  id: string;
  paperId: string;
  text: string;
  section: string;
  subsection?: string;
  pageNumber?: number;
  chunkIndex: number;
  tokenCount: number;
  metadata: {
    authors?: string[];
    year?: number;
    journal?: string;
  };
}

/**
 * Individual quality criterion
 */
export interface QualityCriterion {
  name: string;
  score: number;
  maxScore: number;
  notes: string;
}

/**
 * Highlight/annotation on a paper
 */
export interface Highlight {
  id: string;
  paperId: string;
  userId: string;

  type: 'key_finding' | 'methodology' | 'limitation' | 'question' | 'quote' | 'custom';
  color: string;

  // Position
  startParagraphId: string;
  endParagraphId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  pageNumber: number;

  // Notes
  notes: HighlightNote[];

  // Linking
  linkedHighlights: string[]; // Links to other highlights
  linkedPapers: string[]; // Links to other papers

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Note on a highlight
 */
export interface HighlightNote {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
}

/**
 * Research matrix for comparing papers
 */
export interface ResearchMatrix {
  id: string;
  userId: string;
  title: string;
  description?: string;

  template: 'clinical_trial' | 'systematic_review' | 'diagnostic' | 'ml_study' | 'custom';

  paperIds: string[];

  columns: MatrixColumn[];
  rows: MatrixRow[];

  // Calculated summaries
  summaries: MatrixSummary[];

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Column definition in research matrix
 */
export interface MatrixColumn {
  id: string;
  name: string;
  type: 'text' | 'number' | 'percentage' | 'boolean' | 'rating' | 'calculated';
  extractionPrompt?: string; // AI prompt to extract this data
  formula?: string; // For calculated columns
  width?: number;
}

/**
 * Row in research matrix (one per paper)
 */
export interface MatrixRow {
  paperId: string;
  values: Record<string, MatrixCell>;
}

/**
 * Cell in research matrix
 */
export interface MatrixCell {
  value: string | number | boolean;
  source?: {
    paragraphId: string;
    quote: string;
  };
  confidence: number;
  manualOverride: boolean;
}

/**
 * Summary statistics for matrix column
 */
export interface MatrixSummary {
  columnId: string;
  type: 'mean' | 'median' | 'range' | 'count' | 'percentage';
  value: string | number;
}

/**
 * Audio summary of a paper
 */
export interface AudioSummary {
  id: string;
  paperId: string;
  userId: string;

  type: 'quick' | 'deep' | 'discussion' | 'qa';
  duration: number; // seconds

  audioUrl: string;
  transcript: string;
  chapters: AudioChapter[];

  voiceSettings: {
    voice: string;
    speed: number;
  };

  createdAt: Date;
}

/**
 * Chapter in audio summary
 */
export interface AudioChapter {
  title: string;
  startTime: number;
  endTime: number;
  content: string;
}

/**
 * Collaborator access for shared papers/collections
 */
export interface CollaboratorAccess {
  userId: string;
  email: string;
  permission: 'view' | 'annotate' | 'edit' | 'admin';
  addedAt: Date;
}

/**
 * Equation extracted from paper
 */
export interface Equation {
  id: string;
  latex: string;
  pageNumber: number;
  displayMode: boolean; // true for display math, false for inline
}
