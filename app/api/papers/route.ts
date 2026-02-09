// Papers API - List and Create papers
import { NextRequest, NextResponse } from 'next/server';
import { getUserPapers, getUserPaperMetadata } from '@/lib/supabase/papers';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

// Force dynamic rendering (no static generation at build time)
export const dynamic = 'force-dynamic';

/**
 * GET /api/papers
 * List papers for a user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const metadataOnly = searchParams.get('metadata') === 'true';

    const authResult = await resolveApiUser(request, { requestedUserId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    if (metadataOnly) {
      const metadata = await getUserPaperMetadata(userId);
      return NextResponse.json({ papers: metadata });
    }

    const papers = await getUserPapers(userId, {
      orderByField: 'uploadedAt',
      orderDirection: 'desc',
    });

    return NextResponse.json({ papers });
  } catch (error) {
    console.error('Error fetching papers:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch papers',
        details: errorMessage,
        hint: 'Check Supabase permissions and configuration.',
      },
      { status: 500 }
    );
  }
}
