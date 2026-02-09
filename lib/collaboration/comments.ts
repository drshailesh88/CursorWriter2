// Supabase operations for comments
'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Comment, CommentReply, CreateCommentData, UpdateCommentData } from './types';

type CommentRow = {
  id: string;
  document_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  selection_start: number;
  selection_end: number;
  selected_text: string;
  content: string;
  type: 'comment' | 'suggestion';
  suggested_text: string | null;
  resolved: boolean;
  replies: CommentReply[];
  created_at: string;
  updated_at: string;
};

function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    documentId: row.document_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar || undefined,
    selectionStart: row.selection_start,
    selectionEnd: row.selection_end,
    selectedText: row.selected_text,
    content: row.content,
    type: row.type,
    suggestedText: row.suggested_text || undefined,
    resolved: row.resolved,
    replies: row.replies || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function addComment(data: CreateCommentData): Promise<string> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: created, error } = await supabase
      .from('document_comments')
      .insert({
        document_id: data.documentId,
        user_id: data.userId,
        user_name: data.userName,
        user_avatar: data.userAvatar || null,
        selection_start: data.selectionStart,
        selection_end: data.selectionEnd,
        selected_text: data.selectedText,
        content: data.content,
        type: data.type,
        suggested_text: data.suggestedText || null,
        resolved: false,
        replies: [],
      })
      .select('id')
      .single();

    if (error || !created) {
      console.error('Error adding comment:', error);
      throw error;
    }

    return created.id as string;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
}

export async function getComments(documentId: string): Promise<Comment[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('document_comments')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return (data as CommentRow[]).map(mapComment);
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
}

export async function updateComment(
  commentId: string,
  updates: UpdateCommentData
): Promise<void>;
export async function updateComment(
  documentId: string,
  commentId: string,
  updates: UpdateCommentData
): Promise<void>;
export async function updateComment(
  arg1: string,
  arg2: string | UpdateCommentData,
  arg3?: UpdateCommentData
): Promise<void> {
  const commentId = typeof arg2 === 'string' ? arg2 : arg1;
  const updates = (typeof arg2 === 'string' ? arg3 : arg2) as UpdateCommentData;

  if (!updates) {
    throw new Error('Updates are required');
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const payload: Record<string, unknown> = {};

    if (updates.content !== undefined) payload.content = updates.content;
    if (updates.resolved !== undefined) payload.resolved = updates.resolved;
    if (updates.suggestedText !== undefined) payload.suggested_text = updates.suggestedText;

    const { error } = await supabase
      .from('document_comments')
      .update(payload)
      .eq('id', commentId);

    if (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating comment:', error);
    throw error;
  }
}

export async function deleteComment(documentId: string, commentId: string): Promise<void>;
export async function deleteComment(commentId: string): Promise<void>;
export async function deleteComment(arg1: string, arg2?: string): Promise<void> {
  const commentId = arg2 || arg1;
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from('document_comments').delete().eq('id', commentId);

    if (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}

export async function resolveComment(commentId: string, resolved?: boolean): Promise<void>;
export async function resolveComment(documentId: string, commentId: string, resolved?: boolean): Promise<void>;
export async function resolveComment(
  arg1: string,
  arg2?: string | boolean,
  arg3?: boolean
): Promise<void> {
  const commentId = typeof arg2 === 'string' ? arg2 : arg1;
  const resolved = typeof arg2 === 'string' ? (arg3 ?? true) : (arg2 ?? true);
  return updateComment(commentId, { resolved });
}

export async function addReply(
  documentId: string,
  commentId: string,
  reply: Omit<CommentReply, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('document_comments')
      .select('*')
      .eq('id', commentId)
      .eq('document_id', documentId)
      .single();

    if (error || !data) {
      throw new Error('Comment not found');
    }

    const existing = mapComment(data as CommentRow);
    const newReply: CommentReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...reply,
      createdAt: Date.now(),
    };

    const { error: updateError } = await supabase
      .from('document_comments')
      .update({
        replies: [...(existing.replies || []), newReply],
      })
      .eq('id', commentId);

    if (updateError) {
      console.error('Error adding reply:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error adding reply:', error);
    throw error;
  }
}

export function subscribeToComments(
  documentId: string,
  callback: (comments: Comment[]) => void
): () => void {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`comments-${documentId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'document_comments', filter: `document_id=eq.${documentId}` },
      async () => {
        try {
          const comments = await getComments(documentId);
          callback(comments);
        } catch (error) {
          console.error('Error fetching comments in subscription:', error);
        }
      }
    )
    .subscribe((status: string) => {
      if (status === 'CHANNEL_ERROR') {
        console.error(`Comments subscription error for document ${documentId}`);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
