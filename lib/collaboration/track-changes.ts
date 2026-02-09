// Supabase operations for tracked changes
'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { TrackedChange, ChangeType } from './types';

type ChangeRow = {
  id: string;
  document_id: string;
  type: ChangeType;
  from_pos: number;
  to_pos: number;
  old_content: string | null;
  new_content: string | null;
  user_id: string;
  user_name: string;
  status: 'pending' | 'accepted' | 'rejected';
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

function mapChange(row: ChangeRow): TrackedChange {
  return {
    id: row.id,
    documentId: row.document_id,
    type: row.type,
    from: row.from_pos,
    to: row.to_pos,
    oldContent: row.old_content ?? undefined,
    newContent: row.new_content ?? undefined,
    userId: row.user_id,
    userName: row.user_name,
    status: row.status,
    resolvedBy: row.resolved_by || undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function createTrackedChange(
  documentId: string,
  type: ChangeType,
  from: number,
  to: number,
  userId: string,
  userName: string,
  oldContent?: string,
  newContent?: string
): Promise<string> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('tracked_changes')
      .insert({
        document_id: documentId,
        type,
        from_pos: from,
        to_pos: to,
        old_content: oldContent ?? null,
        new_content: newContent ?? null,
        user_id: userId,
        user_name: userName,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Error creating tracked change:', error);
      throw error;
    }

    return data.id as string;
  } catch (error) {
    console.error('Error creating tracked change:', error);
    throw error;
  }
}

export async function getTrackedChanges(
  documentId: string,
  status?: 'pending' | 'accepted' | 'rejected'
): Promise<TrackedChange[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    let query = supabase
      .from('tracked_changes')
      .select('*')
      .eq('document_id', documentId)
      .order('from_pos', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error || !data) {
      console.error('Error getting tracked changes:', error);
      return [];
    }

    return (data as ChangeRow[]).map(mapChange);
  } catch (error) {
    console.error('Error getting tracked changes:', error);
    return [];
  }
}

export async function acceptChange(
  documentId: string,
  changeId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('tracked_changes')
      .update({
        status: 'accepted',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', changeId)
      .eq('document_id', documentId);

    if (error) {
      console.error('Error accepting change:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error accepting change:', error);
    throw error;
  }
}

export async function rejectChange(
  documentId: string,
  changeId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('tracked_changes')
      .update({
        status: 'rejected',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', changeId)
      .eq('document_id', documentId);

    if (error) {
      console.error('Error rejecting change:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error rejecting change:', error);
    throw error;
  }
}

export async function deleteTrackedChange(
  documentId: string,
  changeId: string
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('tracked_changes')
      .delete()
      .eq('id', changeId)
      .eq('document_id', documentId);

    if (error) {
      console.error('Error deleting change:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting change:', error);
    throw error;
  }
}

export async function acceptAllChanges(
  documentId: string,
  userId: string
): Promise<void> {
  const changes = await getTrackedChanges(documentId, 'pending');
  await Promise.all(changes.map((change) => acceptChange(documentId, change.id, userId)));
}

export async function rejectAllChanges(
  documentId: string,
  userId: string
): Promise<void> {
  const changes = await getTrackedChanges(documentId, 'pending');
  await Promise.all(changes.map((change) => rejectChange(documentId, change.id, userId)));
}

export function subscribeToTrackedChanges(
  documentId: string,
  callback: (changes: TrackedChange[]) => void
): () => void {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`tracked-changes-${documentId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tracked_changes', filter: `document_id=eq.${documentId}` },
      async () => {
        try {
          const changes = await getTrackedChanges(documentId);
          callback(changes);
        } catch (error) {
          console.error('Error fetching tracked changes in subscription:', error);
        }
      }
    )
    .subscribe((status: string) => {
      if (status === 'CHANNEL_ERROR') {
        console.error(`Track changes subscription error for document ${documentId}`);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
