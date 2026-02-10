// Structured Data Extraction Pipeline
// Extract specific fields from papers using instruction-based queries
// Inspired by Elicit's compositional subtask architecture

import { hybridRetrieve, papersToChunks, buildContext } from '@/lib/rag/retriever';
import type { RetrievalConfig } from '@/lib/rag/types';

// --- Schema Definitions ---

export interface ExtractionSchema {
  id: string;
  name: string;
  description: string;
  fields: ExtractionField[];
}

export interface ExtractionField {
  id: string;
  name: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'list' | 'enum';
  required: boolean;
  enumValues?: string[];  // For enum type
  examples?: string[];    // Few-shot examples for the LLM
}

// --- Built-in Schemas ---

export const CLINICAL_TRIAL_SCHEMA: ExtractionSchema = {
  id: 'clinical-trial',
  name: 'Clinical Trial Data',
  description: 'Extract key data from clinical trials and RCTs',
  fields: [
    { id: 'study_design', name: 'Study Design', description: 'Type of study (RCT, cohort, case-control, etc.)', type: 'text', required: true, examples: ['Randomized controlled trial', 'Prospective cohort study'] },
    { id: 'sample_size', name: 'Sample Size', description: 'Total number of participants/subjects', type: 'number', required: true },
    { id: 'population', name: 'Population', description: 'Study population characteristics (age, condition, demographics)', type: 'text', required: true },
    { id: 'intervention', name: 'Intervention', description: 'Primary intervention or treatment being studied', type: 'text', required: true },
    { id: 'comparator', name: 'Comparator', description: 'Control or comparison group treatment', type: 'text', required: false },
    { id: 'primary_outcome', name: 'Primary Outcome', description: 'Main outcome measure', type: 'text', required: true },
    { id: 'effect_size', name: 'Effect Size', description: 'Reported effect size or main result (OR, RR, HR, mean difference, etc.)', type: 'text', required: false },
    { id: 'p_value', name: 'P-value', description: 'Statistical significance', type: 'text', required: false },
    { id: 'confidence_interval', name: 'Confidence Interval', description: '95% CI for the main result', type: 'text', required: false },
    { id: 'follow_up', name: 'Follow-up Duration', description: 'Duration of follow-up period', type: 'text', required: false },
    { id: 'key_finding', name: 'Key Finding', description: 'One-sentence summary of the main finding', type: 'text', required: true },
    { id: 'limitations', name: 'Limitations', description: 'Main limitations noted by the authors', type: 'list', required: false },
  ],
};

export const SYSTEMATIC_REVIEW_SCHEMA: ExtractionSchema = {
  id: 'systematic-review',
  name: 'Systematic Review Data',
  description: 'Extract key data from systematic reviews and meta-analyses',
  fields: [
    { id: 'review_type', name: 'Review Type', description: 'Systematic review, meta-analysis, scoping review, etc.', type: 'text', required: true },
    { id: 'databases_searched', name: 'Databases Searched', description: 'Which databases were searched', type: 'list', required: true },
    { id: 'studies_included', name: 'Studies Included', description: 'Number of studies included in final analysis', type: 'number', required: true },
    { id: 'total_participants', name: 'Total Participants', description: 'Total number of participants across all studies', type: 'number', required: false },
    { id: 'pico', name: 'PICO', description: 'Population, Intervention, Comparison, Outcome criteria', type: 'text', required: true },
    { id: 'pooled_effect', name: 'Pooled Effect', description: 'Meta-analytic pooled effect size', type: 'text', required: false },
    { id: 'heterogeneity', name: 'Heterogeneity', description: 'I-squared or other heterogeneity measure', type: 'text', required: false },
    { id: 'main_conclusion', name: 'Main Conclusion', description: 'Primary conclusion of the review', type: 'text', required: true },
    { id: 'evidence_quality', name: 'Evidence Quality', description: 'GRADE or other quality assessment', type: 'text', required: false },
  ],
};

export const GENERAL_RESEARCH_SCHEMA: ExtractionSchema = {
  id: 'general-research',
  name: 'General Research Data',
  description: 'Extract key information from any research paper',
  fields: [
    { id: 'objective', name: 'Objective', description: 'Main research objective or question', type: 'text', required: true },
    { id: 'methodology', name: 'Methodology', description: 'Research methodology and approach', type: 'text', required: true },
    { id: 'sample_size', name: 'Sample Size', description: 'Number of subjects/samples/data points', type: 'text', required: false },
    { id: 'key_findings', name: 'Key Findings', description: 'Top 2-3 findings from the study', type: 'list', required: true },
    { id: 'main_result', name: 'Main Result', description: 'Primary quantitative or qualitative result', type: 'text', required: true },
    { id: 'limitations', name: 'Limitations', description: 'Study limitations acknowledged by authors', type: 'list', required: false },
    { id: 'conclusion', name: 'Conclusion', description: 'Main conclusion in one sentence', type: 'text', required: true },
    { id: 'future_work', name: 'Future Work', description: 'Suggested future research directions', type: 'text', required: false },
  ],
};

export const BUILTIN_SCHEMAS: ExtractionSchema[] = [
  CLINICAL_TRIAL_SCHEMA,
  SYSTEMATIC_REVIEW_SCHEMA,
  GENERAL_RESEARCH_SCHEMA,
];

// --- Extraction Results ---

export interface ExtractionResult {
  paperId: string;
  paperTitle: string;
  authors: string;
  year: number;
  schemaId: string;
  fields: ExtractedField[];
  confidence: number;     // 0-1 overall confidence
  extractedAt: Date;
}

export interface ExtractedField {
  fieldId: string;
  fieldName: string;
  value: string | number | boolean | string[] | null;
  confidence: number;     // 0-1 per-field confidence
  sourceQuote?: string;   // Supporting text from the paper
  sourceSection?: string; // Which section it came from
}

export interface ExtractionTableRow {
  paperId: string;
  paperTitle: string;
  authors: string;
  year: number;
  [fieldId: string]: string | number | boolean | string[] | null | undefined;
}

export interface BatchExtractionResult {
  schema: ExtractionSchema;
  results: ExtractionResult[];
  table: ExtractionTableRow[];
  stats: {
    papersProcessed: number;
    totalFieldsExtracted: number;
    avgConfidence: number;
    processingTimeMs: number;
  };
}

// --- Custom Schema Builder ---

export interface CustomExtractionRequest {
  instruction: string;  // e.g., "From each paper, extract the sample size and primary outcome"
  papers: PaperInput[];
}

export interface PaperInput {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  content: {
    paragraphs: Array<{ text: string; section?: string; pageNumber?: number }>;
  };
}

// --- Extraction Engine ---

/**
 * Build an LLM prompt for extracting structured data from a paper
 */
function buildExtractionPrompt(
  schema: ExtractionSchema,
  context: string,
  paperTitle: string
): string {
  const fieldDescriptions = schema.fields
    .map(f => {
      let desc = `- **${f.name}** (${f.id}): ${f.description}`;
      if (f.type === 'number') desc += ' [Respond with a number only]';
      if (f.type === 'boolean') desc += ' [Respond with true/false]';
      if (f.type === 'list') desc += ' [Respond with items separated by |]';
      if (f.type === 'enum' && f.enumValues) desc += ` [One of: ${f.enumValues.join(', ')}]`;
      if (f.examples?.length) desc += ` Examples: ${f.examples.join('; ')}`;
      if (f.required) desc += ' (REQUIRED)';
      return desc;
    })
    .join('\n');

  return `You are a precise academic data extraction system. Extract structured data from the following paper content.

## Paper: "${paperTitle}"

## Relevant Content:
${context}

## Fields to Extract:
${fieldDescriptions}

## Instructions:
1. Extract ONLY information explicitly stated in the provided content
2. If a field value is not found in the content, respond with "NOT_FOUND" for required fields or skip optional fields
3. For each field, also provide a confidence score (0.0-1.0) and the source quote
4. Be precise — extract exact numbers, not approximations
5. Do not infer or make assumptions beyond what the text states

## Response Format (JSON):
{
  "fields": [
    {
      "fieldId": "field_id",
      "value": "extracted value",
      "confidence": 0.9,
      "sourceQuote": "exact quote from text",
      "sourceSection": "section name"
    }
  ],
  "overallConfidence": 0.85
}

Respond with ONLY valid JSON. No explanation or commentary.`;
}

/**
 * Parse LLM extraction response
 */
function parseExtractionResponse(
  response: string,
  schema: ExtractionSchema
): { fields: ExtractedField[]; confidence: number } {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { fields: [], confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const fields: ExtractedField[] = (parsed.fields || []).map(
      (f: { fieldId: string; value: unknown; confidence?: number; sourceQuote?: string; sourceSection?: string }) => {
        const schemaField = schema.fields.find(sf => sf.id === f.fieldId);
        return {
          fieldId: f.fieldId,
          fieldName: schemaField?.name || f.fieldId,
          value: f.value === 'NOT_FOUND' ? null : f.value,
          confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
          sourceQuote: f.sourceQuote || undefined,
          sourceSection: f.sourceSection || undefined,
        };
      }
    );

    return {
      fields,
      confidence: typeof parsed.overallConfidence === 'number' ? parsed.overallConfidence : 0.5,
    };
  } catch {
    return { fields: [], confidence: 0 };
  }
}

/**
 * Extract structured data from a single paper using a schema
 */
export async function extractFromPaper(
  paper: PaperInput,
  schema: ExtractionSchema,
  model: string = 'gpt-4o-mini'
): Promise<ExtractionResult> {
  // Convert paper to chunks for retrieval
  const chunks = papersToChunks([{
    paper: { id: paper.id, title: paper.title, authors: paper.authors, year: paper.year },
    content: paper.content,
  }]);

  // Create a focused retrieval query based on the schema fields
  const retrievalQuery = `${schema.description}: ${schema.fields.map(f => f.name).join(', ')}`;

  // Retrieve relevant chunks
  const retrievalConfig: Partial<RetrievalConfig> = {
    topK: 15,
    useDenseRetrieval: !!process.env.OPENAI_API_KEY,
    useBM25: true,
    useReranking: true,
    rerankTopK: 8,
    useMultiQuery: false,  // Don't expand for extraction
    useHyDE: false,
  };

  const { results } = await hybridRetrieve(retrievalQuery, chunks, retrievalConfig);
  const context = buildContext(results);

  // Build extraction prompt
  const prompt = buildExtractionPrompt(schema, context, paper.title);

  // Call LLM
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for extraction');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,  // Low temperature for precise extraction
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM extraction failed: ${await response.text()}`);
  }

  const data = await response.json();
  const llmResponse = data.choices[0].message.content;

  // Parse the response
  const { fields, confidence } = parseExtractionResponse(llmResponse, schema);

  return {
    paperId: paper.id,
    paperTitle: paper.title,
    authors: paper.authors?.join(', ') || '',
    year: paper.year || 0,
    schemaId: schema.id,
    fields,
    confidence,
    extractedAt: new Date(),
  };
}

/**
 * Batch extract from multiple papers
 */
export async function batchExtract(
  papers: PaperInput[],
  schema: ExtractionSchema,
  model: string = 'gpt-4o-mini',
  onProgress?: (completed: number, total: number, paperTitle: string) => void
): Promise<BatchExtractionResult> {
  const startTime = Date.now();
  const results: ExtractionResult[] = [];

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    onProgress?.(i, papers.length, paper.title);

    try {
      const result = await extractFromPaper(paper, schema, model);
      results.push(result);
    } catch (error) {
      console.error(`Extraction failed for paper ${paper.id}:`, error);
      // Add empty result for failed papers
      results.push({
        paperId: paper.id,
        paperTitle: paper.title,
        authors: paper.authors?.join(', ') || '',
        year: paper.year || 0,
        schemaId: schema.id,
        fields: [],
        confidence: 0,
        extractedAt: new Date(),
      });
    }
  }

  // Build table
  const table = results.map(result => {
    const row: ExtractionTableRow = {
      paperId: result.paperId,
      paperTitle: result.paperTitle,
      authors: result.authors,
      year: result.year,
    };

    for (const field of result.fields) {
      row[field.fieldId] = field.value;
    }

    return row;
  });

  // Calculate stats
  const totalFields = results.reduce((sum, r) => sum + r.fields.filter(f => f.value !== null).length, 0);
  const avgConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    : 0;

  return {
    schema,
    results,
    table,
    stats: {
      papersProcessed: papers.length,
      totalFieldsExtracted: totalFields,
      avgConfidence,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Generate a schema from a natural language instruction
 * This enables the "instruction-based query" pattern from Elicit
 */
export async function generateSchemaFromInstruction(
  instruction: string
): Promise<ExtractionSchema> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fall back to general schema
    return GENERAL_RESEARCH_SCHEMA;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a research data schema designer. Given a natural language instruction about what data to extract from academic papers, generate a structured extraction schema.

Respond with ONLY valid JSON in this format:
{
  "id": "custom-schema",
  "name": "Schema Name",
  "description": "Brief description",
  "fields": [
    {
      "id": "field_id_snake_case",
      "name": "Human Readable Name",
      "description": "What to extract",
      "type": "text|number|boolean|list",
      "required": true/false
    }
  ]
}

Keep it focused — 4-8 fields maximum. Each field should be clearly extractable from a paper.`,
          },
          {
            role: 'user',
            content: instruction,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return GENERAL_RESEARCH_SCHEMA;

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      id: parsed.id || 'custom',
      name: parsed.name || 'Custom Extraction',
      description: parsed.description || instruction,
      fields: (parsed.fields || []).map(
        (f: { id: string; name: string; description: string; type?: string; required?: boolean }) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          type: f.type || 'text',
          required: f.required !== false,
        })
      ),
    };
  } catch {
    return GENERAL_RESEARCH_SCHEMA;
  }
}

/**
 * Full instruction-based extraction pipeline
 * User says: "From each paper, extract the sample size, primary outcome, and effect size"
 * System: generates schema -> extracts from each paper -> returns table
 */
export async function instructionExtract(
  instruction: string,
  papers: PaperInput[],
  model: string = 'gpt-4o-mini',
  onProgress?: (completed: number, total: number, paperTitle: string) => void
): Promise<BatchExtractionResult> {
  // Step 1: Generate schema from instruction
  const schema = await generateSchemaFromInstruction(instruction);

  // Step 2: Extract from all papers using that schema
  return batchExtract(papers, schema, model, onProgress);
}
