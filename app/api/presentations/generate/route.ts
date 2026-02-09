/**
 * Presentation Generation API
 * POST /api/presentations/generate
 *
 * Generates presentation slides from document, text, or topic
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePresentation } from '@/lib/presentations/generator';
import { getDocument } from '@/lib/supabase/documents-admin';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';
import {
  GenerationConfig,
  PresentationFormat,
  ThemeId,
  GenerationOptions,
} from '@/lib/presentations/types';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

interface GenerateRequest {
  source: 'document' | 'text' | 'topic';
  sourceId?: string;      // Document ID if source is 'document'
  sourceText?: string;    // Text content or topic
  format: PresentationFormat;
  theme: ThemeId;
  options: GenerationOptions;
  model?: string;
  userId?: string;        // User ID for auth
}

interface GenerateResponse {
  success: boolean;
  presentationId?: string;
  slides?: any[];
  metadata?: {
    generationTime: number;
    sourceWordCount: number;
    slidesGenerated: number;
    visualizationsDetected: number;
    citationsFound: number;
  };
  error?: string;
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

function validateRequest(body: any): { valid: boolean; error?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required' };
  }

  // Validate source
  if (!body.source || !['document', 'text', 'topic'].includes(body.source)) {
    return { valid: false, error: 'Invalid source. Must be "document", "text", or "topic"' };
  }

  // Validate sourceId or sourceText based on source type
  if (body.source === 'document' && !body.sourceId) {
    return { valid: false, error: 'sourceId is required when source is "document"' };
  }

  if ((body.source === 'text' || body.source === 'topic') && !body.sourceText) {
    return { valid: false, error: 'sourceText is required when source is "text" or "topic"' };
  }

  // Validate format
  const validFormats: PresentationFormat[] = ['conference', 'lecture', 'poster', 'pitch'];
  if (!body.format || !validFormats.includes(body.format)) {
    return { valid: false, error: `Invalid format. Must be one of: ${validFormats.join(', ')}` };
  }

  // Validate theme
  const validThemes: ThemeId[] = ['academic', 'dark', 'minimal', 'medical', 'tech', 'humanities', 'nature'];
  if (!body.theme || !validThemes.includes(body.theme)) {
    return { valid: false, error: `Invalid theme. Must be one of: ${validThemes.join(', ')}` };
  }

  // Validate options
  if (!body.options || typeof body.options !== 'object') {
    return { valid: false, error: 'options object is required' };
  }

  return { valid: true };
}

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: GenerateRequest = await request.json();

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        } as GenerateResponse,
        { status: 400 }
      );
    }

    const authResult = await resolveApiUser(request, { requestedUserId: body.userId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    // Get source content
    let sourceContent: string | undefined;
    let documentId: string | undefined;

    if (body.source === 'document') {
      // Fetch document from Supabase
      const document = await getDocument(body.sourceId!);

      if (!document) {
        if (body.sourceText) {
          sourceContent = body.sourceText;
          documentId = body.sourceId;
        } else {
          return NextResponse.json(
            {
              success: false,
              error: 'Document not found',
            } as GenerateResponse,
            { status: 404 }
          );
        }
      }

      if (document) {
        if (document.userId !== userId) {
          return NextResponse.json(
            {
              success: false,
              error: 'Unauthorized access to document',
            } as GenerateResponse,
            { status: 403 }
          );
        }
        sourceContent = document.content;
        documentId = document.id;
      }
    } else {
      // Use provided text or topic
      sourceContent = body.sourceText;
    }

    // Build generation config
    const config: GenerationConfig = {
      source: body.source,
      sourceId: body.sourceId,
      sourceText: body.sourceText,
      format: body.format,
      theme: body.theme,
      options: {
        includeMethodology: body.options.includeMethodology ?? false,
        emphasizeFindings: body.options.emphasizeFindings ?? true,
        includeAllCitations: body.options.includeAllCitations ?? true,
        generateVisualizations: body.options.generateVisualizations ?? false,
        targetSlideCount: body.options.targetSlideCount,
        focusAreas: body.options.focusAreas,
      },
      model: body.model || 'gpt-4o',
    };

    // Generate presentation
    const result = await generatePresentation(config, sourceContent);

    // Return generated slides and metadata
    // Note: We're not saving to Supabase here - that will be done
    // by a separate endpoint when user saves the presentation
    return NextResponse.json({
      success: true,
      slides: result.slides,
      metadata: result.metadata,
    } as GenerateResponse);

  } catch (error) {
    console.error('Presentation generation error:', error);

    // Determine error type and status code
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate presentation';
    const isValidationError = errorMessage.includes('required') || errorMessage.includes('invalid');

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      } as GenerateResponse,
      { status: isValidationError ? 400 : 500 }
    );
  }
}
