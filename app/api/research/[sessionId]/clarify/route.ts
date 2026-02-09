// Research Clarification API - Submit clarification answers
import { NextRequest, NextResponse } from 'next/server';
import { researchEngine, type ClarificationAnswer } from '@/lib/deep-research/engine';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

interface ClarifyRequest {
  answers: ClarificationAnswer[];
  skip?: boolean;
}

/**
 * POST /api/research/[sessionId]/clarify - Submit clarification answers
 */
export async function POST(
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

    const body: ClarifyRequest = await request.json();
    const { answers, skip } = body;

    // Check if session exists
    const session = researchEngine.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (skip) {
      // Skip clarification and use defaults
      await researchEngine.skipClarification(sessionId);
    } else {
      // Validate answers
      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return NextResponse.json(
          { error: 'Answers array is required' },
          { status: 400 }
        );
      }

      // Submit clarifications
      await researchEngine.submitClarifications(sessionId, answers);
    }

    return NextResponse.json({
      success: true,
      message: skip ? 'Clarification skipped' : 'Clarifications submitted',
    });
  } catch (error) {
    console.error('Error submitting clarifications:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
