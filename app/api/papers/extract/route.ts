// Paper Content Extraction API
// Extract specific information from papers using AI
//
// Extraction types:
// - findings: Key results and findings
// - methods: Methodology and experimental design
// - limitations: Study limitations and caveats
// - citation: Formatted citation text

import { NextRequest, NextResponse } from 'next/server';
import { getPaper, getPaperContent } from '@/lib/supabase/papers';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { Paper, PaperContent } from '@/lib/supabase/schema';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

type ExtractionType = 'findings' | 'methods' | 'limitations' | 'citation';

interface ExtractRequest {
  paperId: string;
  userId?: string;
  extractionType: ExtractionType;
  format?: 'text' | 'html' | 'markdown'; // Output format (default: 'markdown')
  model?: 'gpt-4o' | 'gpt-4o-mini'; // Model to use (default: 'gpt-4o-mini')
}

interface ExtractResponse {
  success: boolean;
  content: string;
  format: string;
  extractionType: ExtractionType;
  paper: {
    id: string;
    title: string;
    authors: string[];
    year?: number;
  };
}

/**
 * POST /api/papers/extract
 * Extract specific content from a paper using AI
 */
export async function POST(request: NextRequest) {
  try {
    const body: ExtractRequest = await request.json();
    const {
      paperId,
      userId,
      extractionType,
      format = 'markdown',
      model = 'gpt-4o-mini',
    } = body;

    const authResult = await resolveApiUser(request, { requestedUserId: userId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }

    // Validation
    if (!paperId) {
      return NextResponse.json(
        { error: 'paperId is required' },
        { status: 400 }
      );
    }

    if (!extractionType) {
      return NextResponse.json(
        { error: 'extractionType is required' },
        { status: 400 }
      );
    }

    const validTypes: ExtractionType[] = ['findings', 'methods', 'limitations', 'citation'];
    if (!validTypes.includes(extractionType)) {
      return NextResponse.json(
        { error: `extractionType must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Load paper and content
    const paper = await getPaper(paperId);
    if (!paper || paper.userId !== authResult.userId) {
      return NextResponse.json(
        { error: 'Paper not found' },
        { status: 404 }
      );
    }

    if (paper.processingStatus !== 'ready') {
      return NextResponse.json(
        { error: 'Paper is not ready yet. Current status: ' + paper.processingStatus },
        { status: 400 }
      );
    }

    const content = await getPaperContent(paperId);
    if (!content) {
      return NextResponse.json(
        { error: 'Paper content not found' },
        { status: 404 }
      );
    }

    // Extract content based on type
    let extractedContent: string;

    if (extractionType === 'citation') {
      // Citation doesn't need AI - format directly
      extractedContent = formatCitation(paper, format);
    } else {
      // Use AI for other extraction types
      extractedContent = await extractWithAI(
        paper,
        content,
        extractionType,
        format,
        model
      );
    }

    const response: ExtractResponse = {
      success: true,
      content: extractedContent,
      format,
      extractionType,
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors.map((a) => a.name),
        year: paper.year,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}

/**
 * Format a citation for the paper
 */
function formatCitation(paper: Paper, format: string): string {
  const authors = paper.authors.map((a) => a.name);
  const authorsText =
    authors.length === 0
      ? 'Unknown Author'
      : authors.length === 1
      ? authors[0]
      : authors.length === 2
      ? `${authors[0]} and ${authors[1]}`
      : `${authors[0]} et al.`;

  const year = paper.year || 'n.d.';
  const title = paper.title;
  const journal = paper.journal || '';
  const doi = paper.doi ? ` https://doi.org/${paper.doi}` : '';

  // Generate citation in different formats
  switch (format) {
    case 'html':
      return `<p>${authorsText} (${year}). <em>${title}</em>${journal ? `. ${journal}` : ''}.${doi ? ` <a href="https://doi.org/${paper.doi}">${paper.doi}</a>` : ''}</p>`;

    case 'text':
      return `${authorsText} (${year}). ${title}${journal ? `. ${journal}` : ''}.${doi}`;

    case 'markdown':
    default:
      return `${authorsText} (${year}). *${title}*${journal ? `. ${journal}` : ''}.${doi ? ` [${paper.doi}](https://doi.org/${paper.doi})` : ''}`;
  }
}

/**
 * Extract content using AI
 */
async function extractWithAI(
  paper: Paper,
  content: PaperContent,
  extractionType: ExtractionType,
  outputFormat: string,
  modelId: 'gpt-4o' | 'gpt-4o-mini'
): Promise<string> {
  // Build context from relevant sections
  const relevantSections = getRelevantSections(content, extractionType);
  const context = buildContextForExtraction(paper, relevantSections);

  // Get extraction prompt
  const prompt = getExtractionPrompt(extractionType, outputFormat);

  // Use OpenAI to extract
  const model = openai(modelId);

  const result = await generateText({
    model,
    system: prompt.system,
    prompt: `${prompt.user}\n\nPaper: "${paper.title}"\n\nContent:\n${context}`,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return result.text;
}

/**
 * Get sections relevant to the extraction type
 */
function getRelevantSections(
  content: PaperContent,
  extractionType: ExtractionType
): typeof content.sections {
  const sectionMap: Record<ExtractionType, string[]> = {
    findings: ['results', 'discussion', 'conclusion', 'abstract'],
    methods: ['methods', 'methodology', 'materials_and_methods', 'experimental'],
    limitations: ['discussion', 'conclusion', 'methods'],
    citation: [], // Not used for citations
  };

  const relevantTypes = sectionMap[extractionType];

  return content.sections.filter((section) =>
    relevantTypes.some((type) =>
      section.type.toLowerCase().includes(type.toLowerCase())
    )
  );
}

/**
 * Build context string from sections
 */
function buildContextForExtraction(
  paper: Paper,
  sections: PaperContent['sections']
): string {
  let context = '';

  for (const section of sections) {
    context += `\n## ${section.title}\n${section.content}\n`;
  }

  // If no relevant sections, use full text (truncated)
  if (context.trim().length === 0) {
    context = sections[0]?.content.slice(0, 8000) || 'No content available';
  } else {
    // Truncate if too long
    context = context.slice(0, 10000);
  }

  return context;
}

/**
 * Get extraction prompts for different types
 */
function getExtractionPrompt(
  extractionType: ExtractionType,
  outputFormat: string
): { system: string; user: string } {
  const formatInstruction = getFormatInstruction(outputFormat);

  switch (extractionType) {
    case 'findings':
      return {
        system: `You are an expert academic research assistant. Extract the key findings and results from research papers concisely and accurately.`,
        user: `Extract the main findings and results from this paper. Include:
- Primary results/outcomes
- Statistical significance (if applicable)
- Key measurements and values
- Important observations

${formatInstruction}

Be specific and cite numbers/percentages when available. Keep it concise but comprehensive.`,
      };

    case 'methods':
      return {
        system: `You are an expert methodologist. Extract and summarize research methodology clearly and precisely.`,
        user: `Extract the methodology from this paper. Include:
- Study design
- Sample/participants (size, characteristics)
- Data collection methods
- Analysis techniques
- Tools/instruments used

${formatInstruction}

Be clear and detailed enough that someone could understand how the study was conducted.`,
      };

    case 'limitations':
      return {
        system: `You are a critical research evaluator. Extract study limitations objectively and comprehensively.`,
        user: `Extract the limitations and caveats from this paper. Include:
- Study limitations acknowledged by authors
- Methodological constraints
- Generalizability concerns
- Potential biases
- Future research needs

${formatInstruction}

Be objective and thorough. If limitations are not explicitly stated, infer potential limitations based on the methodology.`,
      };

    default:
      return {
        system: 'You are a research assistant.',
        user: 'Extract relevant information from this paper.',
      };
  }
}

/**
 * Get format-specific instructions
 */
function getFormatInstruction(format: string): string {
  switch (format) {
    case 'html':
      return 'Format the output as clean HTML with appropriate tags (<p>, <ul>, <li>, <strong>, etc.). Do not include <html> or <body> tags.';

    case 'text':
      return 'Format the output as plain text with bullet points (using - or •) and clear structure. No HTML or markdown.';

    case 'markdown':
    default:
      return 'Format the output in markdown with:\n- Bullet points for lists\n- **bold** for emphasis\n- Clear headings if needed (###)\n- Inline code for technical terms when appropriate';
  }
}
