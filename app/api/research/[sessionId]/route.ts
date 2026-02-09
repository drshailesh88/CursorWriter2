// Research Session API - Get and delete sessions
import { NextRequest, NextResponse } from 'next/server';
import { researchEngine } from '@/lib/deep-research/engine';
import {
  getResearchSession,
  deleteResearchSession,
  toResearchSession,
} from '@/lib/supabase/research-sessions-admin';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

async function getOwnedSession(
  sessionId: string,
  userId: string
): Promise<{ engineSession?: ReturnType<typeof researchEngine.getSession>; storedSession?: Awaited<ReturnType<typeof getResearchSession>>; forbidden: boolean }> {
  const engineSession = researchEngine.getSession(sessionId);
  if (engineSession) {
    return {
      engineSession,
      forbidden: engineSession.userId !== userId,
    };
  }

  const storedSession = await getResearchSession(sessionId);
  if (storedSession) {
    return {
      storedSession,
      forbidden: storedSession.userId !== userId,
    };
  }

  return { forbidden: false };
}

/**
 * GET /api/research/[sessionId] - Get session details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const authResult = await resolveApiUser(request);
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    const ownedSession = await getOwnedSession(sessionId, userId);
    if (ownedSession.forbidden) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (ownedSession.engineSession) {
      return NextResponse.json({ session: ownedSession.engineSession });
    }

    if (ownedSession.storedSession) {
      return NextResponse.json({
        session: toResearchSession(ownedSession.storedSession),
      });
    }

    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error getting research session:', error);
    return NextResponse.json(
      { error: 'Failed to get research session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/research/[sessionId] - Cancel and delete session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const authResult = await resolveApiUser(request);
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    const ownedSession = await getOwnedSession(sessionId, userId);
    if (ownedSession.forbidden || (!ownedSession.engineSession && !ownedSession.storedSession)) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Cancel in engine if active
    researchEngine.cancelSession(sessionId);

    // Delete from Supabase
    await deleteResearchSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting research session:', error);
    return NextResponse.json(
      { error: 'Failed to delete research session' },
      { status: 500 }
    );
  }
}
