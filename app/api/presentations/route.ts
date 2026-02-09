/**
 * Presentations API - CRUD Operations
 * GET /api/presentations - List user's presentations
 * POST /api/presentations - Create/save new presentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Presentation } from '@/lib/presentations/types';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// ============================================================================
// TYPES
// ============================================================================

interface PresentationMetadata {
  id: string;
  title: string;
  theme: string;
  slideCount: number;
  documentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Supabase row types (for untyped client)
interface PresentationRow {
  id: string;
  title: string;
  theme: string;
  slides: unknown[];
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PresentationInsertRow {
  user_id: string;
  document_id: string | null;
  title: string;
  description: string | null;
  theme: string;
  slides: unknown;
  settings: unknown;
}

interface ListPresentationsResponse {
  success: boolean;
  presentations?: PresentationMetadata[];
  error?: string;
}

interface CreatePresentationResponse {
  success: boolean;
  presentationId?: string;
  error?: string;
}

// ============================================================================
// GET HANDLER - List User's Presentations
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const limitCount = parseInt(searchParams.get('limit') || '50', 10);
    const metadataOnly = searchParams.get('metadata') === 'true';

    const authResult = await resolveApiUser(request, { requestedUserId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    // Query presentations for user
    const supabase = getSupabaseAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('presentations')
      .select('id, title, theme, slides, document_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limitCount);

    if (error || !data) {
      throw error;
    }

    const presentations: PresentationMetadata[] = (data as PresentationRow[]).map((row: PresentationRow) => ({
      id: row.id,
      title: row.title,
      theme: row.theme,
      slideCount: (row.slides || []).length,
      documentId: row.document_id || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));

    return NextResponse.json({
      success: true,
      presentations,
    } as ListPresentationsResponse);

  } catch (error) {
    console.error('Error fetching presentations:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch presentations',
      } as ListPresentationsResponse,
      { status: 500 }
    );
  }
}

// ============================================================================
// POST HANDLER - Create/Save Presentation
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authResult = await resolveApiUser(request, { requestedUserId: body.userId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    // Validate required fields
    if (!body.title) {
      return NextResponse.json(
        {
          success: false,
          error: 'title is required',
        } as CreatePresentationResponse,
        { status: 400 }
      );
    }

    if (!body.theme) {
      return NextResponse.json(
        {
          success: false,
          error: 'theme is required',
        } as CreatePresentationResponse,
        { status: 400 }
      );
    }

    if (!body.slides || !Array.isArray(body.slides)) {
      return NextResponse.json(
        {
          success: false,
          error: 'slides array is required',
        } as CreatePresentationResponse,
        { status: 400 }
      );
    }

    const presentationData: Omit<Presentation, 'id'> = {
      userId,
      documentId: body.documentId,
      title: body.title,
      description: body.description,
      theme: body.theme,
      slides: body.slides,
      settings: body.settings || {
        aspectRatio: '16:9',
        showSlideNumbers: true,
        showProgressBar: true,
        autoAdvance: false,
        autoAdvanceInterval: 30,
        transition: 'fade',
        transitionDuration: 300,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const supabase = getSupabaseAdminClient();
    const insertData: PresentationInsertRow = {
      user_id: presentationData.userId,
      document_id: presentationData.documentId || null,
      title: presentationData.title,
      description: presentationData.description || null,
      theme: presentationData.theme,
      slides: presentationData.slides,
      settings: presentationData.settings,
    };

    // Use explicit any cast for untyped Supabase client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('presentations')
      .insert(insertData)
      .select('id')
      .single();

    if (error || !data) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      presentationId: data.id as string,
    } as CreatePresentationResponse);

  } catch (error) {
    console.error('Error creating presentation:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create presentation',
      } as CreatePresentationResponse,
      { status: 500 }
    );
  }
}
