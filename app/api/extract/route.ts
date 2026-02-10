import { NextRequest, NextResponse } from 'next/server';
import {
  instructionExtract,
  batchExtract,
  BUILTIN_SCHEMAS,
  type PaperInput,
} from '@/lib/extraction';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instruction, schemaId, paperIds, model } = body as {
      instruction?: string;
      schemaId?: string;
      paperIds?: string[];
      model?: string;
    };

    if (!paperIds || !Array.isArray(paperIds) || paperIds.length === 0) {
      return NextResponse.json({ error: 'paperIds required' }, { status: 400 });
    }

    if (!instruction && !schemaId) {
      return NextResponse.json(
        { error: 'Either instruction or schemaId required' },
        { status: 400 }
      );
    }

    // Load papers from Supabase
    const supabase = getSupabaseAdminClient();
    const papers: PaperInput[] = [];

    for (const paperId of paperIds) {
      const { data: paper } = await supabase
        .from('papers')
        .select('id, title, authors, year')
        .eq('id', paperId)
        .single();

      const { data: content } = await supabase
        .from('paper_contents')
        .select('paragraphs')
        .eq('paper_id', paperId)
        .single();

      if (paper && content) {
        papers.push({
          id: paper.id as string,
          title: paper.title as string,
          authors: (paper.authors as string[]) || [],
          year: paper.year as number,
          content: {
            paragraphs: ((content.paragraphs as Array<{ text: string; section?: string; pageNumber?: number }>) || []),
          },
        });
      }
    }

    if (papers.length === 0) {
      return NextResponse.json({ error: 'No papers found' }, { status: 404 });
    }

    let result;
    if (instruction) {
      // Instruction-based extraction
      result = await instructionExtract(instruction, papers, model || 'gpt-4o-mini');
    } else {
      // Schema-based extraction
      const schema = BUILTIN_SCHEMAS.find(s => s.id === schemaId);
      if (!schema) {
        return NextResponse.json({ error: 'Schema not found' }, { status: 404 });
      }
      result = await batchExtract(papers, schema, model || 'gpt-4o-mini');
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
