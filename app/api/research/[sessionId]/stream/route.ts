// Research SSE Stream - Real-time progress updates
import { NextRequest } from 'next/server';
import { researchEngine, type EngineEvent } from '@/lib/deep-research/engine';
import {
  updateSessionStatus,
  addSessionClarifications,
  addSessionSources,
  setSessionSynthesis,
} from '@/lib/supabase/research-sessions-admin';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

/**
 * GET /api/research/[sessionId]/stream - SSE stream for real-time progress
 *
 * This endpoint streams research progress events to the client using
 * Server-Sent Events (SSE). The client connects and receives updates
 * as the research workflow executes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const authResult = await resolveApiUser(request);
  if (!authResult.userId) {
    return authErrorResponse(authResult);
  }
  const userId = authResult.userId;

  const { sessionId } = params;
  const encoder = new TextEncoder();

  // Check if session exists
  const session = researchEngine.getSession(sessionId);
  if (!session || session.userId !== userId) {
    return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE event
      const sendEvent = (event: EngineEvent) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Subscribe to engine events
      const unsubscribe = researchEngine.onSessionEvent(sessionId, async (event) => {
        // Send event to client
        sendEvent(event);

        // Persist important events to Supabase
        try {
          switch (event.type) {
            case 'status':
              await updateSessionStatus(sessionId, event.status, event.progress);
              break;
            case 'clarification_answered':
              await addSessionClarifications(sessionId, event.clarifications);
              break;
            case 'perspective_added':
              // Batch perspectives if needed
              break;
            case 'source_found':
              await addSessionSources(sessionId, [event.source]);
              break;
            case 'synthesis_ready':
              await setSessionSynthesis(sessionId, event.synthesis as unknown as Record<string, unknown>);
              break;
            case 'complete':
              await updateSessionStatus(sessionId, 'complete', 100);
              controller.close();
              break;
            case 'error':
              await updateSessionStatus(sessionId, 'error', session.progress || 0);
              controller.close();
              break;
          }
        } catch (persistError) {
          console.error('Error persisting event:', persistError);
        }
      });

      // Send initial status
      sendEvent({
        type: 'status',
        status: session.status || 'clarifying',
        progress: session.progress || 0,
      });

      // Start execution
      try {
        await researchEngine.executeSession(sessionId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        sendEvent({
          type: 'error',
          error: errorMessage,
          recoverable: false,
        });
        controller.close();
      }

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        researchEngine.pauseSession(sessionId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
