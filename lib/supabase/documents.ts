// Document CRUD Operations (Supabase-backed)
'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Document, DocumentMetadata, DisciplineId } from './schema';

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  word_count: number | null;
  citations?: unknown;
  tags?: string[] | null;
  folder?: string | null;
  discipline?: string | null;
  created_at: string;
  updated_at: string;
};

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: row.content ?? '',
    wordCount: row.word_count ?? 0,
    citations: (row.citations as Document['citations']) || [],
    tags: row.tags ?? undefined,
    folder: row.folder ?? undefined,
    discipline: row.discipline as DisciplineId | undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function ensureDocumentExists(documentId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Document not found');
  }
}

// Create a new document
export async function createDocument(
  userId: string,
  title: string = 'Untitled Document'
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      title,
      content: '',
      word_count: 0,
      citations: [],
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating document:', error);
    throw error;
  }

  return data.id as string;
}

// Get a document by ID
export async function getDocument(documentId: string): Promise<Document | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !data) {
      return null;
    }

    return mapDocument(data as DocumentRow);
  } catch (error) {
    console.error('Error getting document:', error);
    return null;
  }
}

// Update document content
export async function updateDocument(
  documentId: string,
  updates: Partial<Document>
): Promise<void> {
  try {
    await ensureDocumentExists(documentId);

    const supabase = getSupabaseBrowserClient();
    const payload: Record<string, unknown> = {};

    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.content !== undefined) payload.content = updates.content;
    if (updates.wordCount !== undefined) payload.word_count = updates.wordCount;
    if (updates.citations !== undefined) payload.citations = updates.citations;
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.folder !== undefined) payload.folder = updates.folder;
    if (updates.discipline !== undefined) payload.discipline = updates.discipline;

    const { error } = await supabase
      .from('documents')
      .update(payload)
      .eq('id', documentId);

    if (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
}

// Save document content (auto-save)
export async function saveDocumentContent(
  documentId: string,
  content: string,
  wordCount: number
): Promise<void> {
  try {
    await ensureDocumentExists(documentId);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('documents')
      .update({ content, word_count: wordCount })
      .eq('id', documentId);

    if (error) {
      console.error('Error saving document content:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error saving document content:', error);
    throw error;
  }
}

// Delete a document
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from('documents').delete().eq('id', documentId);

    if (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

// Get all documents for a user
export async function getUserDocuments(
  userId: string,
  limitCount: number = 50
): Promise<DocumentMetadata[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, updated_at, word_count, folder, discipline')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limitCount);

    if (error || !data) {
      return [];
    }

    return data.map((row: {
      id: string;
      title: string;
      updated_at: string;
      word_count: number | null;
      folder: string | null;
      discipline: string | null;
    }) => ({
      id: row.id,
      title: row.title,
      updatedAt: new Date(row.updated_at),
      wordCount: row.word_count || 0,
      folder: row.folder || undefined,
      discipline: row.discipline as DisciplineId | undefined,
    }));
  } catch (error) {
    console.error('Error getting user documents:', error);
    return [];
  }
}

// Get recent documents
export async function getRecentDocuments(
  userId: string,
  limitCount: number = 10
): Promise<DocumentMetadata[]> {
  return getUserDocuments(userId, limitCount);
}

// Rename document
export async function renameDocument(
  documentId: string,
  newTitle: string
): Promise<void> {
  return updateDocument(documentId, { title: newTitle });
}

// Update document discipline
export async function updateDocumentDiscipline(
  documentId: string,
  discipline: DisciplineId
): Promise<void> {
  return updateDocument(documentId, { discipline });
}
