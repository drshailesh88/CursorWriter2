// Enhanced Paper Processor
// Uses GROBID for structured parsing when available, falls back to basic extraction
// Converts parsed papers into the format needed by the RAG pipeline

import {
  isGrobidAvailable,
  parseWithGrobid,
  type GrobidParsedPaper,
  type GrobidConfig,
} from './grobid-client';
import { PDFProcessor } from './pdf-processor';

export interface ProcessedPaper {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  abstract: string;
  sections: ProcessedSection[];
  paragraphs: ProcessedParagraph[];
  references: ProcessedReference[];
  figures: ProcessedFigure[];
  tables: ProcessedTable[];
  processingMethod: 'grobid' | 'basic';
  processingTime: number;
}

export interface ProcessedSection {
  title: string;
  level: number;
  text: string;
  order: number;
}

export interface ProcessedParagraph {
  text: string;
  section: string;
  pageNumber?: number;
  order: number;
}

export interface ProcessedReference {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  pmid?: string;
}

export interface ProcessedFigure {
  id: string;
  label: string;
  caption: string;
}

export interface ProcessedTable {
  id: string;
  label: string;
  caption: string;
  headers: string[];
  rows: string[][];
}

/**
 * Process a PDF with the best available method.
 * Tries GROBID first for structured parsing; falls back to basic text extraction
 * using the existing PDFProcessor.
 */
export async function processPaperEnhanced(
  pdfBuffer: ArrayBuffer,
  grobidConfig?: Partial<GrobidConfig>
): Promise<ProcessedPaper> {
  const startTime = Date.now();

  // Try GROBID first
  const grobidAvail = await isGrobidAvailable(grobidConfig);

  if (grobidAvail) {
    try {
      const grobidResult = await parseWithGrobid(pdfBuffer, grobidConfig);
      return convertGrobidResult(grobidResult, Date.now() - startTime);
    } catch (error) {
      console.warn('GROBID processing failed, falling back to basic:', error);
    }
  }

  // Fallback to basic text extraction via existing PDFProcessor
  return basicProcessPaper(pdfBuffer, Date.now() - startTime);
}

/**
 * Convert GROBID result to our unified format
 */
function convertGrobidResult(grobid: GrobidParsedPaper, processingTime: number): ProcessedPaper {
  const paragraphs: ProcessedParagraph[] = [];
  let paragraphOrder = 0;

  // Add abstract as first paragraph
  if (grobid.abstract) {
    paragraphs.push({
      text: grobid.abstract,
      section: 'Abstract',
      order: paragraphOrder++,
    });
  }

  // Convert sections to paragraphs
  for (const section of grobid.sections) {
    for (const para of section.paragraphs) {
      paragraphs.push({
        text: para,
        section: section.title,
        order: paragraphOrder++,
      });
    }
  }

  // Collect figures and tables from all sections
  const figures: ProcessedFigure[] = [];
  const tables: ProcessedTable[] = [];
  for (const section of grobid.sections) {
    for (const f of section.figures) {
      figures.push({ id: f.id, label: f.label, caption: f.caption });
    }
    for (const t of section.tables) {
      tables.push({
        id: t.id,
        label: t.label,
        caption: t.caption,
        headers: t.headers,
        rows: t.rows,
      });
    }
  }

  return {
    title: grobid.title,
    authors: grobid.authors.map((a) => a.fullName),
    year: grobid.year,
    doi: grobid.doi,
    abstract: grobid.abstract,
    sections: grobid.sections.map((s) => ({
      title: s.title,
      level: s.level,
      text: s.text,
      order: s.order,
    })),
    paragraphs,
    references: grobid.references.map((r) => ({
      title: r.title,
      authors: r.authors,
      year: r.year,
      journal: r.journal,
      doi: r.doi,
      pmid: r.pmid,
    })),
    figures,
    tables,
    processingMethod: 'grobid',
    processingTime,
  };
}

/**
 * Basic text extraction fallback (when GROBID is not available).
 * Delegates to the existing PDFProcessor which uses unpdf for extraction
 * and applies heuristic section detection.
 */
async function basicProcessPaper(
  pdfBuffer: ArrayBuffer,
  processingTime: number
): Promise<ProcessedPaper> {
  const processor = new PDFProcessor();

  try {
    const result = await processor.processPaper(pdfBuffer, 'paper.pdf');

    // Convert PDFProcessor result to our unified ProcessedPaper format
    const paragraphs: ProcessedParagraph[] = result.paragraphs.map((p) => ({
      text: p.text,
      section: p.section,
      pageNumber: p.pageNumber,
      order: p.order,
    }));

    const sections: ProcessedSection[] = result.sections.map((s, i) => ({
      title: s.title,
      level: 1,
      text: s.content,
      order: i,
    }));

    const references: ProcessedReference[] = result.references.map((r) => ({
      title: r.title || r.text,
      authors: r.authors || [],
      year: r.year,
      journal: r.journal,
      doi: r.doi,
      pmid: r.pmid,
    }));

    const figures: ProcessedFigure[] = result.figures.map((f) => ({
      id: f.id,
      label: f.figureNumber,
      caption: f.caption,
    }));

    const tables: ProcessedTable[] = result.tables.map((t) => ({
      id: t.id,
      label: t.tableNumber,
      caption: t.caption,
      headers: t.headers,
      rows: t.rows,
    }));

    return {
      title: result.title,
      authors: result.authors.map((a) => a.name),
      year: result.year,
      doi: result.doi,
      abstract: result.abstract || '',
      sections,
      paragraphs,
      references,
      figures,
      tables,
      processingMethod: 'basic',
      processingTime,
    };
  } catch (error) {
    console.error('Basic PDF processing failed:', error);

    // Return minimal result on failure
    return {
      title: 'Untitled',
      authors: [],
      abstract: '',
      sections: [],
      paragraphs: [],
      references: [],
      figures: [],
      tables: [],
      processingMethod: 'basic',
      processingTime,
    };
  }
}
