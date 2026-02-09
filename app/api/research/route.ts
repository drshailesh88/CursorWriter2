/**
 * Deep Research API - Main Endpoint
 *
 * POST endpoint to initialize and execute deep research sessions.
 * - If userId is provided, creates a session and returns JSON { sessionId }
 * - Otherwise, falls back to the legacy SSE flow
 */

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { researchEngine } from '@/lib/deep-research/engine';
import type { ResearchMode, ResearchConfig, ResearchModel } from '@/lib/deep-research/types';
import { createResearchSession } from '@/lib/supabase/research-sessions-admin';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';
import {
  startResearch,
  generatePerspectives,
  buildExplorationTree,
  executeResearch,
  deduplicateSources,
  type ResearchProgress,
  type ResearchConfig as LegacyResearchConfig,
  type ResearchMode as LegacyResearchMode,
} from '@/lib/research/deep-research';

/**
 * Request body interface
 */
interface ResearchRequest {
  topic: string;
  mode?: ResearchMode;
  userId?: string;
  config?: Partial<ResearchConfig> | Partial<LegacyResearchConfig>;
  configOverrides?: Partial<ResearchConfig> | Partial<LegacyResearchConfig>;
  clarifications?: Array<{ question: string; answer: string }>;
  /** LLM model to use for research agents (same as chat dropdown) */
  model?: ResearchModel;
}

function buildLegacyConfig(
  rawConfig: Partial<ResearchConfig> | Partial<LegacyResearchConfig> | undefined,
  model: ResearchModel | undefined
): Partial<LegacyResearchConfig> {
  return {
    ...(rawConfig as Partial<LegacyResearchConfig>),
    ...(model ? { model } : {}),
  };
}

function buildSessionConfig(
  rawConfig: Partial<ResearchConfig> | Partial<LegacyResearchConfig> | undefined,
  model: ResearchModel | undefined
): Partial<ResearchConfig> {
  return {
    ...(rawConfig as Partial<ResearchConfig>),
    ...(model ? { model } : {}),
  };
}

async function legacySseResponse(
  topic: string,
  mode: ResearchMode,
  rawConfig: Partial<ResearchConfig> | Partial<LegacyResearchConfig> | undefined,
  model: ResearchModel | undefined
) {
  const encoder = new TextEncoder();
  const legacyConfig = buildLegacyConfig(rawConfig, model);

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendEvent('status', {
          stage: 'initialization',
          message: 'Starting research session...',
          progress: 0,
        });

        const session = await startResearch(topic.trim(), mode as 'quick' | 'standard' | 'deep' | 'exhaustive' | 'systematic', legacyConfig);

        sendEvent('session_created', {
          sessionId: session.id,
          topic: session.topic,
          mode: session.mode,
          config: session.config,
        });

        sendEvent('status', {
          stage: 'perspective-generation',
          message: 'Generating expert perspectives...',
          progress: 10,
        });

        const perspectives = await generatePerspectives(
          topic.trim(),
          session.config!
        );

        sendEvent('perspectives_generated', {
          count: perspectives.length,
          perspectives: perspectives.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
          })),
        });

        sendEvent('status', {
          stage: 'research',
          message: 'Building exploration tree...',
          progress: 20,
        });

        const tree = buildExplorationTree(topic.trim(), perspectives);

        sendEvent('tree_built', {
          totalNodes: tree.totalNodes,
          rootId: tree.rootId,
        });

        sendEvent('status', {
          stage: 'research',
          message: 'Executing parallel research across databases...',
          progress: 30,
        });

        const allSources = await executeResearch(
          tree,
          session.config!,
          (progress: ResearchProgress) => {
            const progressPercentage = 30 + (progress.sourcesFound / session.config!.maxSources) * 50;

            sendEvent('progress', {
              stage: progress.currentPhase,
              perspectivesGenerated: progress.perspectivesGenerated,
              nodesExplored: progress.nodesExplored,
              sourcesFound: progress.sourcesFound,
              progress: Math.min(progressPercentage, 80),
            });
          }
        );

        sendEvent('status', {
          stage: 'analysis',
          message: 'Deduplicating sources...',
          progress: 85,
        });

        const { deduplicated, duplicateCount } = deduplicateSources(allSources);

        sendEvent('sources_deduplicated', {
          totalSources: allSources.length,
          uniqueSources: deduplicated.length,
          duplicatesRemoved: duplicateCount,
        });

        sendEvent('status', {
          stage: 'synthesis',
          message: 'Research complete!',
          progress: 100,
        });

        sendEvent('complete', {
          sessionId: session.id,
          sources: deduplicated.map(source => ({
            id: source.id,
            title: source.title,
            authors: source.authors,
            year: source.year,
            journal: source.journal,
            abstract: source.abstract,
            url: source.url,
            doi: source.doi,
            pmid: source.pmid,
            citationCount: source.citationCount,
            source: source.source,
          })),
          perspectives,
          tree: {
            totalNodes: tree.totalNodes,
            completedNodes: tree.completedNodes,
          },
          metadata: {
            topic: session.topic,
            mode: session.mode,
            totalSources: deduplicated.length,
            duplicatesRemoved: duplicateCount,
          },
        });

        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Research execution error:', error);

        sendEvent('error', {
          message: errorMessage,
          stage: 'execution',
          recoverable: false,
        });

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * POST /api/research - Start a new deep research session
 */
export async function POST(request: NextRequest) {
  try {
    const body: ResearchRequest = await request.json();
    const { topic, mode = 'standard', userId, model } = body;
    const rawConfig = body.configOverrides ?? body.config;

    if (!topic || !topic.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const authResult = await resolveApiUser(request, {
      requestedUserId: userId,
      allowAnonymous: !userId,
    });
    if (!authResult.userId && userId) {
      return authErrorResponse(authResult);
    }

    if (!authResult.userId) {
      return legacySseResponse(topic, mode, rawConfig, model);
    }
    const authorizedUserId = authResult.userId;

    const sessionId = randomUUID();
    const configOverrides = buildSessionConfig(rawConfig, model);

    await createResearchSession({
      id: sessionId,
      userId: authorizedUserId,
      topic: topic.trim(),
      mode,
      status: 'clarifying',
      progress: 0,
    });

    await researchEngine.createSession(
      authorizedUserId,
      topic.trim(),
      mode,
      configOverrides,
      sessionId
    );

    return NextResponse.json({ sessionId });
  } catch (error) {
    console.error('Research API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process research request';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
