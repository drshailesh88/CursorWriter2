// Paper Chat API - Sophisticated RAG
// Hybrid retrieval (BM25 + Dense + RRF) with smart model routing and caching
//
// Architecture:
// Query → Cache Check → Hybrid Retrieve → Rerank → Model Select → LLM → Cache Store → Response

import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

// Force dynamic rendering (no static generation at build time)
export const dynamic = 'force-dynamic';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { getPaperContent, getPaper } from '@/lib/supabase/papers';
import type { PaperContent, Paper } from '@/lib/supabase/schema';
import {
  hybridRetrieve,
  papersToChunks,
  buildContext,
  selectModel,
  getCachedResponse,
  setCachedResponse,
  Citation,
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
} from '@/lib/rag';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  userId?: string;
  paperIds: string[];
  messages: ChatMessage[];
  model?: string; // Override model selection
  config?: Partial<RetrievalConfig>; // Override retrieval settings
  useCache?: boolean; // Enable/disable caching (default: true)
  useDenseRetrieval?: boolean; // Enable/disable embeddings (default: true)
}

/**
 * POST /api/papers/chat
 *
 * Sophisticated RAG-powered multi-paper chat with:
 * - Hybrid retrieval (BM25 + Dense + RRF fusion)
 * - Optional Cohere reranking
 * - Smart model routing for cost optimization
 * - Response caching to reduce LLM costs
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const {
      userId,
      paperIds,
      messages,
      model: modelOverride,
      config: configOverride,
      useCache = true,
      useDenseRetrieval = true,
    } = body;

    // Validation
    if (!paperIds || paperIds.length === 0) {
      return NextResponse.json(
        { error: 'paperIds are required' },
        { status: 400 }
      );
    }

    const authResult = await resolveApiUser(request, { requestedUserId: userId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const authorizedUserId = authResult.userId;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages are required' },
        { status: 400 }
      );
    }

    const userQuery = messages[messages.length - 1]?.content;
    if (!userQuery) {
      return NextResponse.json(
        { error: 'No user message found' },
        { status: 400 }
      );
    }

    // Step 1: Check cache (if enabled)
    if (useCache) {
      const cached = await getCachedResponse(authorizedUserId, userQuery, paperIds);
      if (cached) {
        // Return cached response as non-streaming
        return NextResponse.json({
          content: cached.response,
          citations: cached.citations,
          cached: true,
          costs: { embeddingTokens: 0, llmInputTokens: 0, llmOutputTokens: 0, estimatedCost: 0 },
        });
      }
    }

    // Step 2: Load paper contents
    const papersWithContent = await loadPapersWithContent(authorizedUserId, paperIds);

    if (papersWithContent.length === 0) {
      return NextResponse.json(
        { error: 'No papers found or papers not processed yet' },
        { status: 404 }
      );
    }

    // Step 3: Convert to chunks for retrieval
    const chunks = papersToChunks(
      papersWithContent.map(({ paper, content }) => ({
        paper: {
          id: paper.id,
          title: paper.title,
          authors: paper.authors.map((a) => a.name),
          year: paper.year,
        },
        content: {
          paragraphs: content.paragraphs.map((p) => ({
            text: p.text,
            section: p.section,
            pageNumber: p.pageNumber,
          })),
        },
      }))
    );

    // Step 4: Hybrid retrieval with RRF fusion
    const retrievalConfig: Partial<RetrievalConfig> = {
      ...configOverride,
      useDenseRetrieval: useDenseRetrieval && !!process.env.OPENAI_API_KEY,
      useBM25: true,
      useReranking: !!process.env.COHERE_API_KEY,
    };

    const retrievalResult = await hybridRetrieve(userQuery, chunks, retrievalConfig);
    const { results, citations, stats } = retrievalResult;

    // Step 5: Build context from retrieved chunks
    const context = buildContext(results);
    const contextLength = context.length;

    // Step 6: Smart model selection (unless overridden)
    let selectedModelId = modelOverride || 'gpt-4o-mini';
    let modelReason = 'User specified';

    if (!modelOverride) {
      const selection = selectModel(userQuery, contextLength);
      selectedModelId = selection.model.id;
      modelReason = selection.reason;
    }

    // Step 7: Build system prompt
    const systemPrompt = buildSystemPrompt(papersWithContent);

    // Step 8: Get appropriate model provider
    const modelProvider = getModelForId(selectedModelId);

    // Step 9: Stream response from LLM
    const result = await streamText({
      model: modelProvider,
      system: systemPrompt,
      messages: [
        // Include conversation history (last 5 exchanges)
        ...messages.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      prompt: `Context from papers:\n\n${context}\n\nUser question: ${userQuery}`,
      onFinish: async ({ text }) => {
        // Cache the response (fire and forget)
        if (useCache && text) {
          setCachedResponse(authorizedUserId, userQuery, paperIds, text, citations).catch(() => {});
        }
      },
    });

    // Return streaming response with metadata in headers
    const response = result.toDataStreamResponse();

    // Add metadata headers
    response.headers.set('X-Citations', JSON.stringify(citations));
    response.headers.set('X-Model-Used', selectedModelId);
    response.headers.set('X-Model-Reason', modelReason);
    response.headers.set('X-Retrieval-Stats', JSON.stringify(stats));
    response.headers.set('X-Cached', 'false');

    return response;
  } catch (error) {
    console.error('Paper chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}

/**
 * Load papers with their extracted content
 */
async function loadPapersWithContent(
  userId: string,
  paperIds: string[]
): Promise<Array<{ paper: Paper; content: PaperContent }>> {
  const results: Array<{ paper: Paper; content: PaperContent }> = [];

  await Promise.all(
    paperIds.map(async (paperId) => {
      const [paper, content] = await Promise.all([
        getPaper(paperId),
        getPaperContent(paperId),
      ]);

      if (paper && content && paper.userId === userId && paper.processingStatus === 'ready') {
        results.push({ paper, content });
      }
    })
  );

  return results;
}

/**
 * Get model instance for Vercel AI SDK
 */
function getModelForId(modelId: string) {
  switch (modelId) {
    case 'gemini-1.5-flash':
      return google('gemini-1.5-flash');
    case 'gemini-1.5-pro':
      return google('gemini-1.5-pro');
    case 'gpt-4o':
      return openai('gpt-4o');
    case 'gpt-4o-mini':
    default:
      return openai('gpt-4o-mini');
  }
}

/**
 * Build system prompt for academic paper Q&A
 */
function buildSystemPrompt(
  papersWithContent: Array<{ paper: Paper; content: PaperContent }>
): string {
  const paperList = papersWithContent
    .map((p) => `- "${p.paper.title}" (${p.paper.year || 'n.d.'})`)
    .join('\n');

  return `You are an academic research assistant helping analyze scientific papers.

PAPERS IN CONTEXT:
${paperList}

INSTRUCTIONS:
1. Answer questions based ONLY on the provided context from these papers
2. Always cite your sources using [1], [2], etc. corresponding to the context chunks
3. If the context doesn't contain relevant information, say so clearly
4. Use academic language appropriate for research discussions
5. When comparing papers, clearly distinguish which finding comes from which paper
6. Highlight agreements and disagreements between papers when relevant

CITATION FORMAT:
- Use inline citations like: "The study found significant effects [1]"
- For direct quotes: "as the authors noted, 'exact quote here' [2]"
- When synthesizing: "Multiple studies suggest... [1, 3, 4]"

Be concise but thorough. Focus on accuracy over speculation.`;
}
