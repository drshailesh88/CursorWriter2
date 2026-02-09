import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSemanticScholarById } from '@/lib/research/semantic-scholar';

const requestSchema = z.object({
  paperIds: z.array(z.string().min(1)).min(1).max(100),
});

interface PaperDetail {
  paperId: string;
  title: string;
  authors: string[];
  year: number;
  citationCount: number;
  journal?: string;
  pdfUrl?: string;
  openAccess: boolean;
  url?: string;
}

/**
 * POST /api/discovery/papers
 * Resolve paper metadata for one or more Semantic Scholar paper IDs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const uniquePaperIds = Array.from(new Set(parsed.data.paperIds)).slice(0, 100);

    const results = await Promise.all(
      uniquePaperIds.map(async (paperId) => {
        const paper = await getSemanticScholarById(paperId);
        if (!paper) {
          return null;
        }

        const detail: PaperDetail = {
          paperId,
          title: paper.title,
          authors: paper.authors.map((author) => author.name),
          year: paper.year,
          citationCount: paper.citationCount || 0,
          journal: paper.journal || paper.venue,
          pdfUrl: paper.pdfUrl,
          openAccess: paper.openAccess,
          url: paper.url,
        };

        return detail;
      })
    );

    const papers = results.reduce<Record<string, PaperDetail>>((acc, paper) => {
      if (paper) {
        acc[paper.paperId] = paper;
      }
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      papers,
      resolved: Object.keys(papers).length,
      requested: uniquePaperIds.length,
    });
  } catch (error) {
    console.error('Discovery paper metadata error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch paper metadata',
      },
      { status: 500 }
    );
  }
}
