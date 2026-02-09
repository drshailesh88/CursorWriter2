// Paper Upload API
// Handles PDF file uploads and initiates processing

import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering (no static generation at build time)
export const dynamic = 'force-dynamic';
import { uploadPaperFile, createPaper, updatePaperStatus, updatePaperMetadata } from '@/lib/supabase/papers';
import { savePaperContent } from '@/lib/supabase/papers';
import { PDFProcessor } from '@/lib/papers/pdf-processor';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';

// Max file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = ['application/pdf'];

/**
 * POST /api/papers/upload
 * Upload a PDF file
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const requestedUserId = formData.get('userId') as string | null;

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const authResult = await resolveApiUser(request, { requestedUserId });
    if (!authResult.userId) {
      return authErrorResponse(authResult);
    }
    const userId = authResult.userId;

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 100MB limit' },
        { status: 400 }
      );
    }

    // Generate a temporary paper ID
    const tempId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Convert File to ArrayBuffer for storage
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });

    // Upload to Supabase Storage
    const { url, path } = await uploadPaperFile(userId, tempId, blob, file.name);

    // Create paper document in Supabase
    const paperId = await createPaper(userId, {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      storageUrl: url,
      storagePath: path,
    });

    // Start background processing
    processInBackground(paperId, userId, arrayBuffer, file.name).catch((err) => {
      console.error('Background processing failed:', err);
    });

    return NextResponse.json({
      paperId,
      status: 'uploading',
      message: 'Upload successful, processing started',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}

/**
 * Process paper in background
 */
async function processInBackground(
  paperId: string,
  userId: string,
  buffer: ArrayBuffer,
  fileName: string
): Promise<void> {
  const processor = new PDFProcessor();

  try {
    // Update status to processing
    await updatePaperStatus(paperId, 'processing');

    // Process the PDF
    const result = await processor.processPaper(
      buffer,
      fileName,
      async (status, progress) => {
        // Update status in Supabase
        const statusMap: Record<string, string> = {
          'Extracting text...': 'extracting_text',
          'Extracting figures...': 'extracting_figures',
          'Extracting tables...': 'extracting_tables',
          'Parsing references...': 'parsing_references',
        };

        const mappedStatus = statusMap[status];
        if (mappedStatus) {
          await updatePaperStatus(paperId, mappedStatus as any);
        }
      }
    );

    // Update paper with extracted metadata
    await updatePaperMetadata(paperId, {
      title: result.title,
      authors: result.authors,
      year: result.year,
      journal: result.journal,
      doi: result.doi,
      abstract: result.abstract,
      keywords: result.keywords,
    });

    // Save extracted content
    await savePaperContent(paperId, userId, {
      fullText: result.fullText,
      pageCount: result.pageCount,
      sections: result.sections,
      paragraphs: result.paragraphs,
      figures: result.figures,
      tables: result.tables,
      references: result.references,
      equations: result.equations,
      extractionQuality: result.extractionQuality,
      ocrRequired: result.ocrRequired,
      processingTimeMs: result.processingTimeMs,
    });

    // Mark as ready
    await updatePaperStatus(paperId, 'ready');
  } catch (error) {
    console.error('Processing failed:', error);
    await updatePaperStatus(
      paperId,
      'error',
      error instanceof Error ? error.message : 'Processing failed'
    );
  }
}
