import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';
import { getSystemPrompt, type DisciplineId } from '@/lib/prompts/disciplines';
import {
  unifiedSearch,
  searchDatabase,
  formatResultsForAI,
  generateCitation,
  type DatabaseSource,
} from '@/lib/research';

// Valid discipline IDs for runtime validation
const VALID_DISCIPLINES: DisciplineId[] = [
  'life-sciences',
  'bioinformatics',
  'chemistry',
  'clinical-medicine',
  'physics',
  'astronomy',
  'computer-science',
  'engineering',
  'materials-science',
  'earth-sciences',
  'mathematics',
  'neuroscience',
  'social-sciences',
  'economics',
  'environmental-science',
];

// Personal API key types
interface PersonalApiKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  zhipu?: string;
  deepseek?: string;
}

// Get API key with fallback to environment variables
function getApiKey(personalKey: string | undefined, envKey: string): string | undefined {
  return personalKey || process.env[envKey];
}

// Create model instance based on model type and API key
function createModelInstance(modelType: string, personalApiKeys: PersonalApiKeys) {
  switch (modelType) {
    case 'openai': {
      const apiKey = getApiKey(personalApiKeys.openai, 'OPENAI_API_KEY');
      if (!apiKey) throw new Error('OpenAI API key not configured. Add it in Settings or .env.local.');
      const openai = createOpenAI({ apiKey });
      return openai('gpt-4o');
    }

    case 'claude': {
      const apiKey = getApiKey(personalApiKeys.anthropic, 'ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('Anthropic API key not configured. Add it in Settings or .env.local.');
      const anthropic = createAnthropic({ apiKey });
      return anthropic('claude-sonnet-4-20250514');
    }

    case 'gemini': {
      const apiKey = getApiKey(personalApiKeys.google, 'GOOGLE_API_KEY');
      if (!apiKey) throw new Error('Google API key not configured. Add it in Settings or .env.local.');
      const google = createGoogleGenerativeAI({ apiKey });
      return google('gemini-1.5-flash'); // Using stable model name
    }

    case 'glm-4-plus': {
      // Z.AI/Zhipu key - check multiple possible env var names (case variations)
      const apiKey = personalApiKeys.zhipu
        || process.env.ZAI_API_KEY
        || process.env.ZAI_API_Key
        || process.env.ZHIPU_API_KEY;
      if (!apiKey) throw new Error('Z.AI API key not configured. Add it in Settings or set ZAI_API_KEY in .env.local.');
      // Zhipu AI (Z.AI) uses OpenAI-compatible API
      const zhipu = createOpenAI({
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey,
      });
      return zhipu('glm-4-plus'); // GLM-4.7
    }

    case 'deepseek': {
      // DeepSeek - cheapest and reliable option
      const apiKey = personalApiKeys.deepseek || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('DeepSeek API key not configured. Add it in Settings or set DEEPSEEK_API_KEY in .env.local.');
      // DeepSeek uses OpenAI-compatible API
      const deepseek = createOpenAI({
        baseURL: 'https://api.deepseek.com/v1',
        apiKey,
      });
      return deepseek('deepseek-chat');
    }

    default:
      throw new Error(`Unknown model: ${modelType}. Please select a valid model.`);
  }
}

// Default discipline for backwards compatibility
const DEFAULT_DISCIPLINE: DisciplineId = 'life-sciences';

// Models that support tool/function calling (research tools)
const MODELS_WITH_TOOL_SUPPORT = [
  'openai',
  'claude',
  'gemini',
  'glm-4-plus', // GLM-4.7 supports function calling
  'deepseek', // DeepSeek supports function calling
];

export async function POST(req: NextRequest) {
  const authResult = await resolveApiUser(req);
  if (!authResult.userId) {
    return authErrorResponse(authResult);
  }

  try {
    const body = await req.json();
    console.log('[CHAT API] Received request:', JSON.stringify({ model: body.model, discipline: body.discipline, messageCount: body.messages?.length }));

    const {
      messages,
      model = 'claude', // Changed default to claude
      documentId,
      discipline = DEFAULT_DISCIPLINE,
      personalApiKeys = {},
    } = body;

    // Create model instance with personal API key
    // Normalize model name before creating instance (handle legacy "anthropic" value)
    const normalizedModelName = model === 'anthropic' ? 'claude' : model;
    console.log('[CHAT API] Creating model instance for:', normalizedModelName);
    let selectedModel;
    try {
      selectedModel = createModelInstance(normalizedModelName, personalApiKeys);
    } catch (modelError) {
      console.error('[CHAT API] Model creation error:', modelError);
      throw modelError;
    }
    const supportsTools = MODELS_WITH_TOOL_SUPPORT.includes(normalizedModelName);

    // Validate discipline at runtime and use default if invalid
    const validatedDiscipline = VALID_DISCIPLINES.includes(discipline as DisciplineId)
      ? (discipline as DisciplineId)
      : DEFAULT_DISCIPLINE;

    // Get discipline-specific system prompt
    const systemPrompt = getSystemPrompt(validatedDiscipline);

    const result = await streamText({
      model: selectedModel,
      messages,
      system: systemPrompt,
      ...(supportsTools && {
        tools: {
        // Unified search across all databases
        searchResearch: tool({
          description: `Search academic databases for research papers. Automatically searches the most relevant databases for the current discipline (${validatedDiscipline}). Returns papers with citations, abstracts, and metadata.`,
          parameters: z.object({
            query: z.string().describe('Search query (e.g., "machine learning protein folding")'),
            maxResults: z.number().default(15).describe('Maximum number of results'),
            yearStart: z.number().optional().describe('Filter: minimum publication year'),
            yearEnd: z.number().optional().describe('Filter: maximum publication year'),
            openAccessOnly: z.boolean().default(false).describe('Only return open access papers'),
          }),
          execute: async ({ query, maxResults, yearStart, yearEnd, openAccessOnly }) => {
            try {
              const response = await unifiedSearch({
                text: query,
                discipline: validatedDiscipline,
                limit: maxResults,
                yearRange: yearStart || yearEnd ? { start: yearStart, end: yearEnd } : undefined,
                openAccessOnly,
                deduplicate: true,
              });

              const citations = response.results.map((r) => generateCitation(r));
              const formatted = formatResultsForAI(response.results);

              return {
                success: true,
                count: response.results.length,
                totalFound: response.total,
                sources: response.bySource,
                duplicatesRemoved: response.deduplicated,
                searchTimeMs: response.executionTimeMs,
                citations: citations.join(', '),
                results: formatted,
                message: `Found ${response.results.length} papers across ${Object.keys(response.bySource).join(', ')}. Use these citations: ${citations.slice(0, 5).join(', ')}${citations.length > 5 ? '...' : ''}`,
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Search failed',
                message: 'Research search failed. Please try again.',
              };
            }
          },
        }),

        // PubMed-specific search (for medical/life sciences)
        searchPubMed: tool({
          description: 'Search PubMed specifically for biomedical and life sciences literature. Best for clinical medicine, pharmacology, and biology.',
          parameters: z.object({
            query: z.string().describe('PubMed search query (e.g., "SGLT2 inhibitors heart failure")'),
            maxResults: z.number().default(15).describe('Maximum number of results'),
            yearStart: z.number().optional().describe('Minimum publication year'),
            yearEnd: z.number().optional().describe('Maximum publication year'),
          }),
          execute: async ({ query, maxResults, yearStart, yearEnd }) => {
            try {
              const response = await searchDatabase('pubmed', {
                text: query,
                limit: maxResults,
                yearRange: yearStart || yearEnd ? { start: yearStart, end: yearEnd } : undefined,
              });

              const citations = response.results.map((r) => generateCitation(r));

              return {
                success: true,
                count: response.results.length,
                source: 'PubMed',
                citations: citations.join(', '),
                results: formatResultsForAI(response.results),
                message: `Found ${response.results.length} PubMed articles. Citations: ${citations.slice(0, 5).join(', ')}`,
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : 'PubMed search failed',
              };
            }
          },
        }),

        // arXiv-specific search (for physics, CS, math)
        searchArxiv: tool({
          description: 'Search arXiv for preprints in physics, mathematics, computer science, quantitative biology, astronomy, and economics.',
          parameters: z.object({
            query: z.string().describe('arXiv search query'),
            category: z.enum([
              'physics', 'hep-ph', 'hep-th', 'cond-mat', 'quant-ph', 'astro-ph',
              'math', 'cs', 'cs.AI', 'cs.LG', 'cs.CV', 'cs.CL',
              'q-bio', 'stat', 'stat.ML', 'econ', 'eess'
            ]).optional().describe('arXiv category to filter'),
            maxResults: z.number().default(10).describe('Maximum number of results'),
          }),
          execute: async ({ query, category, maxResults }) => {
            try {
              const response = await searchDatabase('arxiv', {
                text: query,
                categories: category ? [category] : undefined,
                limit: maxResults,
              });

              const citations = response.results.map((r) => generateCitation(r));

              return {
                success: true,
                count: response.results.length,
                source: 'arXiv',
                citations: citations.join(', '),
                results: formatResultsForAI(response.results),
                message: `Found ${response.results.length} arXiv preprints. Citations: ${citations.slice(0, 5).join(', ')}`,
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : 'arXiv search failed',
              };
            }
          },
        }),

        // Semantic Scholar search (all disciplines, with citations)
        searchSemanticScholar: tool({
          description: 'Search Semantic Scholar for papers across all disciplines. Includes citation counts and can find related papers.',
          parameters: z.object({
            query: z.string().describe('Search query'),
            maxResults: z.number().default(10).describe('Maximum number of results'),
            yearStart: z.number().optional().describe('Minimum publication year'),
            fieldsOfStudy: z.array(z.string()).optional().describe('Filter by fields (e.g., ["Computer Science", "Medicine"])'),
          }),
          execute: async ({ query, maxResults, yearStart, fieldsOfStudy }) => {
            try {
              const response = await searchDatabase('semantic-scholar', {
                text: query,
                limit: maxResults,
                yearRange: yearStart ? { start: yearStart } : undefined,
                categories: fieldsOfStudy,
              });

              const citations = response.results.map((r) => generateCitation(r));

              // Sort by citation count for this source
              const sorted = response.results.sort((a, b) =>
                (b.citationCount || 0) - (a.citationCount || 0)
              );

              return {
                success: true,
                count: sorted.length,
                source: 'Semantic Scholar',
                citations: citations.join(', '),
                results: formatResultsForAI(sorted),
                topCited: sorted.slice(0, 3).map((r) => ({
                  title: r.title,
                  citations: r.citationCount,
                  year: r.year,
                })),
                message: `Found ${sorted.length} papers. Most cited: ${sorted[0]?.title} (${sorted[0]?.citationCount} citations)`,
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Semantic Scholar search failed',
              };
            }
          },
        }),

        // OpenAlex search (comprehensive, 250M+ works)
        searchOpenAlex: tool({
          description: 'Search OpenAlex, a comprehensive open catalog of 250M+ scholarly works across all disciplines.',
          parameters: z.object({
            query: z.string().describe('Search query'),
            maxResults: z.number().default(10).describe('Maximum number of results'),
            openAccessOnly: z.boolean().default(false).describe('Only return open access works'),
          }),
          execute: async ({ query, maxResults, openAccessOnly }) => {
            try {
              const response = await searchDatabase('openalex', {
                text: query,
                limit: maxResults,
                openAccessOnly,
              });

              const citations = response.results.map((r) => generateCitation(r));

              return {
                success: true,
                count: response.results.length,
                source: 'OpenAlex',
                citations: citations.join(', '),
                results: formatResultsForAI(response.results),
                message: `Found ${response.results.length} works in OpenAlex. Citations: ${citations.slice(0, 5).join(', ')}`,
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : 'OpenAlex search failed',
              };
            }
          },
        }),
        },
        maxSteps: 5,
      }),
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);

    // Provide more specific error messages
    let errorMessage = 'Failed to process chat request';

    if (error instanceof Error) {
      if (error.message.includes('API key is missing')) {
        errorMessage = 'API key not configured. Please add your API keys to .env.local file.';
      } else if (error.message.includes('invalid_api_key') || error.message.includes('Incorrect API key')) {
        errorMessage = 'Invalid API key. Please check your API key configuration.';
      } else if (error.message.includes('rate_limit') || error.message.includes('Rate limit')) {
        errorMessage = 'Rate limit exceeded. Please try again in a moment.';
      } else if (error.message.includes('insufficient_quota')) {
        errorMessage = 'API quota exceeded. Please check your billing or try a different model.';
      } else if (error.message.includes('tool use') || error.message.includes('No endpoints found')) {
        errorMessage = 'This model does not support research tools. Try a premium model (Claude, GPT-4o, or Gemini) for PubMed search and research features.';
      } else {
        errorMessage = error.message;
      }
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
