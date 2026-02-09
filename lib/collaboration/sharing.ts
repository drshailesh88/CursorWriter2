// Document Sharing Operations (Supabase)
'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { DocumentShare, SharedDocument, SharePermission } from './types';

function generateShareToken(): string {
  return crypto.randomUUID();
}

type ShareRow = {
  id: string;
  document_id: string;
  type: 'link' | 'email';
  share_token: string | null;
  shared_with_email: string | null;
  shared_with_user_id: string | null;
  permission: SharePermission;
  created_by: string;
  created_by_name: string;
  active: boolean;
  created_at: string;
  expires_at: string | null;
};

type SharedRow = {
  id: string;
  user_id: string;
  document_id: string;
  share_id: string;
  permission: SharePermission;
  owner_id: string;
  owner_name: string;
  title: string;
  shared_at: string;
  updated_at: string;
  word_count: number;
};

function mapShare(row: ShareRow): DocumentShare {
  return {
    id: row.id,
    documentId: row.document_id,
    type: row.type,
    shareToken: row.share_token || undefined,
    sharedWithEmail: row.shared_with_email || undefined,
    sharedWithUserId: row.shared_with_user_id || undefined,
    permission: row.permission,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
    active: row.active,
  };
}

function mapShared(row: SharedRow): SharedDocument {
  return {
    documentId: row.document_id,
    title: row.title,
    ownerName: row.owner_name,
    ownerId: row.owner_id,
    permission: row.permission,
    sharedAt: new Date(row.shared_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    wordCount: row.word_count,
  };
}

export async function createShareLink(
  documentId: string,
  userId: string,
  userName: string,
  permission: SharePermission,
  expiresIn?: number
): Promise<string> {
  try {
    const shareToken = generateShareToken();
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn).toISOString() : null;
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase
      .from('document_shares')
      .insert({
        document_id: documentId,
        type: 'link',
        share_token: shareToken,
        permission,
        created_by: userId,
        created_by_name: userName,
        active: true,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Error creating share link:', error);
      throw error;
    }

    return shareToken;
  } catch (error) {
    console.error('Error creating share link:', error);
    throw error;
  }
}

export async function createEmailShare(
  documentId: string,
  userId: string,
  userName: string,
  email: string,
  permission: SharePermission
): Promise<string> {
  try {
    const supabase = getSupabaseBrowserClient();

    let { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!profile) {
      const { data: legacyUser } = await supabase
        .from('users')
        .select('id, uid')
        .eq('email', email)
        .maybeSingle();

      if (legacyUser) {
        profile = {
          id: (legacyUser.id || legacyUser.uid) as string,
        };
      }
    }

    const sharedWithUserId = profile?.id || null;

    const { data, error } = await supabase
      .from('document_shares')
      .insert({
        document_id: documentId,
        type: 'email',
        shared_with_email: email,
        shared_with_user_id: sharedWithUserId,
        permission,
        created_by: userId,
        created_by_name: userName,
        active: true,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Error creating email share:', error);
      throw error;
    }

    if (sharedWithUserId) {
      await addToSharedWithMe(sharedWithUserId, documentId, data.id as string, permission);
    }

    return data.id as string;
  } catch (error) {
    console.error('Error creating email share:', error);
    throw error;
  }
}

async function addToSharedWithMe(
  userId: string,
  documentId: string,
  shareId: string,
  permission: SharePermission
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error('Document not found');
    }

    const ownerId = (doc.user_id || doc.userId) as string;
    const updatedAt = (doc.updated_at || doc.updatedAt) as string;
    const wordCount = (doc.word_count || doc.wordCount || 0) as number;

    let { data: ownerProfile } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', ownerId)
      .maybeSingle();

    if (!ownerProfile) {
      let { data: legacyOwner } = await supabase
        .from('users')
        .select('displayName, email, uid, id')
        .eq('uid', ownerId)
        .maybeSingle();

      if (!legacyOwner) {
        const ownerById = await supabase
          .from('users')
          .select('displayName, email, uid, id')
          .eq('id', ownerId)
          .maybeSingle();
        legacyOwner = ownerById.data as typeof legacyOwner;
      }

      if (legacyOwner) {
        ownerProfile = {
          display_name: legacyOwner.displayName as string | undefined,
          email: legacyOwner.email as string | undefined,
        };
      }
    }

    const ownerName = ownerProfile?.display_name || ownerProfile?.email || 'Unknown';

    const { error } = await supabase
      .from('shared_documents')
      .insert({
        user_id: userId,
        document_id: documentId,
        share_id: shareId,
        permission,
        owner_id: ownerId,
        owner_name: ownerName,
        title: doc.title,
        shared_at: new Date().toISOString(),
        updated_at: updatedAt,
        word_count: wordCount,
      });

    if (error) {
      console.error('Error adding to sharedWithMe:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error adding to sharedWithMe:', error);
    throw error;
  }
}

export async function getDocumentShares(documentId: string): Promise<DocumentShare[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('document_shares')
      .select('*')
      .eq('document_id', documentId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return (data as ShareRow[]).map(mapShare);
  } catch (error) {
    console.error('Error getting document shares:', error);
    return [];
  }
}

export async function getSharedWithMe(userId: string): Promise<SharedDocument[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('shared_documents')
      .select('*')
      .eq('user_id', userId)
      .order('shared_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return (data as SharedRow[]).map(mapShared);
  } catch (error) {
    console.error('Error getting shared documents:', error);
    return [];
  }
}

export async function revokeShare(documentId: string, shareId: string): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('document_shares')
      .select('*')
      .eq('id', shareId)
      .eq('document_id', documentId)
      .single();

    if (error || !data) {
      throw new Error('Share not found');
    }

    await supabase
      .from('document_shares')
      .update({ active: false })
      .eq('id', shareId);

    if (data.type === 'email' && data.shared_with_user_id) {
      await supabase
        .from('shared_documents')
        .delete()
        .eq('share_id', shareId)
        .eq('user_id', data.shared_with_user_id);
    }
  } catch (error) {
    console.error('Error revoking share:', error);
    throw error;
  }
}

export async function updateSharePermission(
  documentId: string,
  shareId: string,
  permission: SharePermission
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('document_shares')
      .select('*')
      .eq('id', shareId)
      .eq('document_id', documentId)
      .single();

    if (error || !data) {
      throw new Error('Share not found');
    }

    await supabase
      .from('document_shares')
      .update({ permission })
      .eq('id', shareId);

    if (data.type === 'email' && data.shared_with_user_id) {
      await supabase
        .from('shared_documents')
        .update({ permission })
        .eq('share_id', shareId)
        .eq('user_id', data.shared_with_user_id);
    }
  } catch (error) {
    console.error('Error updating share permission:', error);
    throw error;
  }
}

export async function validateShareToken(
  token: string
): Promise<{ documentId: string; permission: SharePermission } | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('document_shares')
      .select('*')
      .eq('share_token', token)
      .eq('active', true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      await supabase
        .from('document_shares')
        .update({ active: false })
        .eq('id', data.id);
      return null;
    }

    return {
      documentId: data.document_id,
      permission: data.permission as SharePermission,
    };
  } catch (error) {
    console.error('Error validating share token:', error);
    return null;
  }
}

export async function getUserDocumentPermission(
  documentId: string,
  userId: string
): Promise<SharePermission | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle();

    if (!doc) {
      return null;
    }

    const ownerId = (doc.user_id || doc.userId) as string | undefined;
    if (ownerId === userId) {
      return 'edit';
    }

    const { data: shared } = await supabase
      .from('shared_documents')
      .select('permission')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .maybeSingle();

    return (shared?.permission as SharePermission) || null;
  } catch (error) {
    console.error('Error checking user document permission:', error);
    return null;
  }
}
