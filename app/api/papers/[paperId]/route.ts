// Paper Detail API - Get, Update, Delete individual papers
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering (no static generation at build time)
export const dynamic = 'force-dynamic';

import {
  getPaper,
  updatePaper,
  deletePaper,
  togglePaperFavorite,
  addPaperTags,
  removePaperTags,
  getPaperContent,
} from '@/lib/supabase/papers';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

interface RouteParams {
  params: Promise<{ paperId: string }>;
}

/**
 * GET /api/papers/[paperId]
 * Get a single paper with optional content
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { paperId } = await params;
    const { searchParams } = new URL(request.url);
    const includeContent = searchParams.get('content') === 'true';
    const requestedUserId = searchParams.get('userId');

    const authResult = await resolveApiUser(request, { requestedUserId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    const paper = await getPaper(paperId);
    if (!paper || paper.userId !== userId) {
      return NextResponse.json(
        { error: 'Paper not found' },
        { status: 404 }
      );
    }

    let content = null;
    if (includeContent && paper.processingStatus === 'ready') {
      content = await getPaperContent(paperId);
    }

    return NextResponse.json({ paper, content });
  } catch (error) {
    console.error('Error fetching paper:', error);
    return NextResponse.json(
      { error: 'Failed to fetch paper' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/papers/[paperId]
 * Update paper metadata
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { paperId } = await params;
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const authResult = await resolveApiUser(request, { requestedUserId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }

    const paper = await getPaper(paperId);
    if (!paper || paper.userId !== authResult.userId) {
      return NextResponse.json(
        { error: 'Paper not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action, ...updates } = body;

    // Handle special actions
    if (action === 'favorite') {
      const isFavorite = await togglePaperFavorite(paperId);
      return NextResponse.json({ success: true, isFavorite });
    }

    if (action === 'addTags') {
      await addPaperTags(paperId, updates.tags);
      return NextResponse.json({ success: true });
    }

    if (action === 'removeTags') {
      await removePaperTags(paperId, updates.tags);
      return NextResponse.json({ success: true });
    }

    // Regular update
    await updatePaper(paperId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating paper:', error);
    return NextResponse.json(
      { error: 'Failed to update paper' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/papers/[paperId]
 * Delete a paper and all associated data
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { paperId } = await params;
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const authResult = await resolveApiUser(request, { requestedUserId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }

    const paper = await getPaper(paperId);
    if (!paper || paper.userId !== authResult.userId) {
      return NextResponse.json(
        { error: 'Paper not found' },
        { status: 404 }
      );
    }

    await deletePaper(paperId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting paper:', error);
    return NextResponse.json(
      { error: 'Failed to delete paper' },
      { status: 500 }
    );
  }
}
