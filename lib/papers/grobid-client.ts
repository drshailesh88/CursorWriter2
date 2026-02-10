// GROBID Client - Production-grade PDF parsing via GROBID REST API
// GROBID can be self-hosted (Docker) or use a public instance
// See: https://github.com/kermitt2/grobid

const PUBLIC_GROBID_URL = 'https://kermitt2-grobid.hf.space';

/**
 * Resolve the GROBID base URL at runtime from env or fallback to public instance
 */
function getGrobidUrl(): string {
  return process.env.GROBID_URL || PUBLIC_GROBID_URL;
}

export interface GrobidConfig {
  baseUrl: string;
  timeout: number;
  consolidateHeader: boolean;
  consolidateCitations: boolean;
  includeRawAffiliations: boolean;
}

function getDefaultConfig(): GrobidConfig {
  return {
    baseUrl: getGrobidUrl(),
    timeout: 120000,
    consolidateHeader: true,
    consolidateCitations: true,
    includeRawAffiliations: false,
  };
}

export interface GrobidParsedPaper {
  title: string;
  authors: GrobidAuthor[];
  abstract: string;
  sections: GrobidSection[];
  references: GrobidReference[];
  keywords: string[];
  doi?: string;
  year?: number;
  journal?: string;
  rawTEI?: string;
}

export interface GrobidAuthor {
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  affiliation?: string;
  orcid?: string;
}

export interface GrobidSection {
  title: string;
  level: number; // 1 = top-level, 2 = subsection, etc.
  text: string;
  paragraphs: string[];
  figures: GrobidFigure[];
  tables: GrobidTable[];
  order: number;
}

export interface GrobidFigure {
  id: string;
  label: string;
  caption: string;
  description?: string;
}

export interface GrobidTable {
  id: string;
  label: string;
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface GrobidReference {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  volume?: string;
  pages?: string;
  doi?: string;
  pmid?: string;
  rawText: string;
}

/**
 * Check if GROBID service is available
 */
export async function isGrobidAvailable(config?: Partial<GrobidConfig>): Promise<boolean> {
  const cfg = { ...getDefaultConfig(), ...config };
  try {
    const response = await fetch(`${cfg.baseUrl}/api/isalive`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Parse a PDF using GROBID's full-text processing
 */
export async function parseWithGrobid(
  pdfBuffer: ArrayBuffer,
  config?: Partial<GrobidConfig>
): Promise<GrobidParsedPaper> {
  const cfg = { ...getDefaultConfig(), ...config };

  const formData = new FormData();
  formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }), 'paper.pdf');
  formData.append('consolidateHeader', cfg.consolidateHeader ? '1' : '0');
  formData.append('consolidateCitations', cfg.consolidateCitations ? '1' : '0');
  formData.append('includeRawAffiliations', cfg.includeRawAffiliations ? '1' : '0');
  formData.append('teiCoordinates', 'figure');
  formData.append('teiCoordinates', 'ref');

  const response = await fetch(`${cfg.baseUrl}/api/processFulltextDocument`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(cfg.timeout),
  });

  if (!response.ok) {
    throw new Error(`GROBID error: ${response.status} ${await response.text()}`);
  }

  const teiXml = await response.text();
  return parseTEIXml(teiXml);
}

/**
 * Parse GROBID's TEI XML output into structured data
 */
function parseTEIXml(xml: string): GrobidParsedPaper {
  // Simple XML parsing without external dependencies
  // For production, consider using a proper XML parser

  const result: GrobidParsedPaper = {
    title: '',
    authors: [],
    abstract: '',
    sections: [],
    references: [],
    keywords: [],
    rawTEI: xml,
  };

  // Extract title
  const titleMatch = xml.match(/<title[^>]*type="main"[^>]*>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    result.title = stripTags(titleMatch[1]).trim();
  }

  // Extract abstract
  const abstractMatch = xml.match(/<abstract[\s\S]*?>([\s\S]*?)<\/abstract>/);
  if (abstractMatch) {
    result.abstract = stripTags(abstractMatch[1]).trim();
  }

  // Extract authors
  const authorMatches = xml.matchAll(/<author[\s\S]*?>([\s\S]*?)<\/author>/g);
  for (const match of authorMatches) {
    const authorXml = match[1];
    const firstNameMatch = authorXml.match(/<forename[^>]*>(.*?)<\/forename>/);
    const lastNameMatch = authorXml.match(/<surname>(.*?)<\/surname>/);
    const emailMatch = authorXml.match(/<email>(.*?)<\/email>/);
    const affiliationMatch = authorXml.match(/<affiliation[\s\S]*?>([\s\S]*?)<\/affiliation>/);

    if (lastNameMatch) {
      const firstName = firstNameMatch ? stripTags(firstNameMatch[1]) : '';
      const lastName = stripTags(lastNameMatch[1]);
      result.authors.push({
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        email: emailMatch ? stripTags(emailMatch[1]) : undefined,
        affiliation: affiliationMatch ? stripTags(affiliationMatch[1]).trim() : undefined,
      });
    }
  }

  // Extract DOI
  const doiMatch = xml.match(/<idno type="DOI">(.*?)<\/idno>/);
  if (doiMatch) result.doi = stripTags(doiMatch[1]);

  // Extract year
  const yearMatch = xml.match(/<date[^>]*when="(\d{4})/);
  if (yearMatch) result.year = parseInt(yearMatch[1], 10);

  // Extract journal
  const journalMatch = xml.match(/<title[^>]*level="j"[^>]*type="main"[^>]*>([\s\S]*?)<\/title>/);
  if (journalMatch) result.journal = stripTags(journalMatch[1]).trim();

  // Extract keywords
  const keywordMatches = xml.matchAll(/<term>(.*?)<\/term>/g);
  for (const match of keywordMatches) {
    result.keywords.push(stripTags(match[1]));
  }

  // Extract sections (body text)
  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/);
  if (bodyMatch) {
    const bodyXml = bodyMatch[1];
    const divMatches = bodyXml.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g);
    let order = 0;

    for (const divMatch of divMatches) {
      const divXml = divMatch[1];
      const headMatch = divXml.match(/<head[^>]*n="([^"]*)"[^>]*>([\s\S]*?)<\/head>/);
      const level = headMatch ? headMatch[1].split('.').length : 1;
      const sectionTitle = headMatch ? stripTags(headMatch[2]).trim() : `Section ${order + 1}`;

      // Extract paragraphs
      const paragraphs: string[] = [];
      const pMatches = divXml.matchAll(/<p>([\s\S]*?)<\/p>/g);
      for (const pMatch of pMatches) {
        const text = stripTags(pMatch[1]).trim();
        if (text) paragraphs.push(text);
      }

      // Extract figures
      const figures: GrobidFigure[] = [];
      const figMatches = divXml.matchAll(
        /<figure[^>]*xml:id="([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g
      );
      for (const figMatch of figMatches) {
        const figId = figMatch[1];
        const figXml = figMatch[2];
        const labelMatch = figXml.match(/<label>(.*?)<\/label>/);
        const captionMatch = figXml.match(/<figDesc>([\s\S]*?)<\/figDesc>/);
        figures.push({
          id: figId,
          label: labelMatch ? stripTags(labelMatch[1]) : '',
          caption: captionMatch ? stripTags(captionMatch[1]).trim() : '',
        });
      }

      // Extract tables
      const tables: GrobidTable[] = [];
      const tableMatches = divXml.matchAll(
        /<figure[^>]*type="table"[^>]*xml:id="([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g
      );
      for (const tableMatch of tableMatches) {
        const tableId = tableMatch[1];
        const tableXml = tableMatch[2];
        const tableLabelMatch = tableXml.match(/<label>(.*?)<\/label>/);
        const tableCaptionMatch = tableXml.match(/<figDesc>([\s\S]*?)<\/figDesc>/);

        // Parse table rows
        const headers: string[] = [];
        const rows: string[][] = [];
        const rowMatches = tableXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);
        let isFirstRow = true;
        for (const rowMatch of rowMatches) {
          const cells: string[] = [];
          const cellMatches = rowMatch[1].matchAll(/<cell[^>]*>([\s\S]*?)<\/cell>/g);
          for (const cellMatch of cellMatches) {
            cells.push(stripTags(cellMatch[1]).trim());
          }
          if (isFirstRow) {
            headers.push(...cells);
            isFirstRow = false;
          } else {
            rows.push(cells);
          }
        }

        tables.push({
          id: tableId,
          label: tableLabelMatch ? stripTags(tableLabelMatch[1]) : '',
          caption: tableCaptionMatch ? stripTags(tableCaptionMatch[1]).trim() : '',
          headers,
          rows,
        });
      }

      if (paragraphs.length > 0 || figures.length > 0 || tables.length > 0) {
        result.sections.push({
          title: sectionTitle,
          level,
          text: paragraphs.join('\n\n'),
          paragraphs,
          figures,
          tables,
          order: order++,
        });
      }
    }
  }

  // Extract references
  const biblMatches = xml.matchAll(
    /<biblStruct[^>]*xml:id="([^"]*)"[^>]*>([\s\S]*?)<\/biblStruct>/g
  );
  for (const match of biblMatches) {
    const refId = match[1];
    const refXml = match[2];

    const refTitleMatch = refXml.match(/<title[^>]*level="a"[^>]*>([\s\S]*?)<\/title>/);
    const refJournalMatch = refXml.match(/<title[^>]*level="j"[^>]*>([\s\S]*?)<\/title>/);
    const refYearMatch = refXml.match(/<date[^>]*when="(\d{4})/);
    const doiRefMatch = refXml.match(/<idno type="DOI">(.*?)<\/idno>/);
    const pmidMatch = refXml.match(/<idno type="PMID">(.*?)<\/idno>/);
    const volumeMatch = refXml.match(/<biblScope[^>]*unit="volume"[^>]*>(.*?)<\/biblScope>/);
    const pagesMatch = refXml.match(/<biblScope[^>]*unit="page"[^>]*>(.*?)<\/biblScope>/);

    const refAuthors: string[] = [];
    const refAuthorMatches = refXml.matchAll(/<surname>(.*?)<\/surname>/g);
    for (const aMatch of refAuthorMatches) {
      refAuthors.push(stripTags(aMatch[1]));
    }

    result.references.push({
      id: refId,
      title: refTitleMatch ? stripTags(refTitleMatch[1]).trim() : '',
      authors: refAuthors,
      year: refYearMatch ? parseInt(refYearMatch[1], 10) : undefined,
      journal: refJournalMatch ? stripTags(refJournalMatch[1]).trim() : undefined,
      volume: volumeMatch ? stripTags(volumeMatch[1]) : undefined,
      pages: pagesMatch ? stripTags(pagesMatch[1]) : undefined,
      doi: doiRefMatch ? stripTags(doiRefMatch[1]) : undefined,
      pmid: pmidMatch ? stripTags(pmidMatch[1]) : undefined,
      rawText: stripTags(refXml).trim().replace(/\s+/g, ' '),
    });
  }

  return result;
}

/**
 * Strip XML/HTML tags from a string
 */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse header only (faster, just metadata)
 */
export async function parseHeaderWithGrobid(
  pdfBuffer: ArrayBuffer,
  config?: Partial<GrobidConfig>
): Promise<Pick<GrobidParsedPaper, 'title' | 'authors' | 'abstract' | 'doi' | 'keywords'>> {
  const cfg = { ...getDefaultConfig(), ...config };

  const formData = new FormData();
  formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }), 'paper.pdf');
  formData.append('consolidateHeader', '1');

  const response = await fetch(`${cfg.baseUrl}/api/processHeaderDocument`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(cfg.timeout),
  });

  if (!response.ok) {
    throw new Error(`GROBID header error: ${response.status}`);
  }

  const teiXml = await response.text();
  const full = parseTEIXml(teiXml);

  return {
    title: full.title,
    authors: full.authors,
    abstract: full.abstract,
    doi: full.doi,
    keywords: full.keywords,
  };
}

/**
 * Parse references only
 */
export async function parseReferencesWithGrobid(
  pdfBuffer: ArrayBuffer,
  config?: Partial<GrobidConfig>
): Promise<GrobidReference[]> {
  const cfg = { ...getDefaultConfig(), ...config };

  const formData = new FormData();
  formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }), 'paper.pdf');
  formData.append('consolidateCitations', '1');

  const response = await fetch(`${cfg.baseUrl}/api/processReferences`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(cfg.timeout),
  });

  if (!response.ok) {
    throw new Error(`GROBID references error: ${response.status}`);
  }

  const teiXml = await response.text();
  const full = parseTEIXml(teiXml);
  return full.references;
}
