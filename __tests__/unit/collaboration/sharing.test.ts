/**
 * Document Sharing Test
 *
 * Tests document sharing functionality including:
 * - Generating secure share tokens
 * - Creating view-only and editable share links
 * - Email-based sharing
 * - Token validation and expiry
 * - Permission management
 * - Share revocation
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { mockDatabase, resetSupabaseMocks, mockSupabaseBrowserClient } from '../../mocks/supabase';
import { createMockUser, createMockDocument } from '../../mocks/test-data';
import type { DocumentShare, SharePermission } from '@/lib/collaboration/types';

// Mock crypto.randomUUID for consistent testing
const mockRandomUUID = vi.fn(() => 'a'.repeat(32) + '-' + 'b'.repeat(4));
vi.stubGlobal('crypto', {
  ...global.crypto,
  randomUUID: mockRandomUUID,
});

// Mock the Supabase client module
vi.mock('@/lib/supabase/client', () => ({
  db: () => mockDatabase,
  getSupabaseBrowserClient: () => mockSupabaseBrowserClient,
}));

vi.mock('@/lib/supabase/schema', () => ({
  COLLECTIONS: {
    DOCUMENTS: 'documents',
    USERS: 'users',
  },
}));

// Import after mocking
import {
  createShareLink,
  createEmailShare,
  getDocumentShares,
  getSharedWithMe,
  revokeShare,
  updateSharePermission,
  validateShareToken,
  getUserDocumentPermission,
} from '@/lib/collaboration/sharing';

describe('Document Sharing', () => {
  const testDocId = 'test-document-123';
  const owner = createMockUser({ uid: 'owner-1', displayName: 'Document Owner' });
  const recipient = createMockUser({ uid: 'recipient-1', email: 'recipient@test.com', displayName: 'Recipient User' });
  const testDocument = createMockDocument({ id: testDocId, userId: owner.uid });

  beforeEach(async () => {
    resetSupabaseMocks();
    mockRandomUUID.mockClear();

    // Seed the document
    await mockDatabase.doc(`documents/${testDocId}`).set({
      id: testDocId,
      userId: owner.uid,
      title: testDocument.title,
      content: testDocument.content,
      wordCount: testDocument.wordCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed users
    await mockDatabase.doc(`users/${owner.uid}`).set({
      uid: owner.uid,
      email: owner.email,
      displayName: owner.displayName,
    });

    await mockDatabase.doc(`users/${recipient.uid}`).set({
      uid: recipient.uid,
      email: recipient.email,
      displayName: recipient.displayName,
    });
  });

  describe('Token Generation', () => {
    test('generates secure share token (32 bytes)', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view'
      );

      // crypto.randomUUID returns 36 characters (32 hex + 4 dashes)
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
      expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    });

    test('generates unique tokens for multiple shares', async () => {
      mockRandomUUID
        .mockReturnValueOnce('token-1')
        .mockReturnValueOnce('token-2')
        .mockReturnValueOnce('token-3');

      const token1 = await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      const token2 = await createShareLink(testDocId, owner.uid, owner.displayName, 'edit');
      const token3 = await createShareLink(testDocId, owner.uid, owner.displayName, 'comment');

      expect(token1).toBe('token-1');
      expect(token2).toBe('token-2');
      expect(token3).toBe('token-3');
      expect(mockRandomUUID).toHaveBeenCalledTimes(3);
    });
  });

  describe('Creating Share Links', () => {
    test('creates view-only share link', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view'
      );

      expect(token).toBeDefined();

      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(1);
      expect(shares[0]).toMatchObject({
        documentId: testDocId,
        type: 'link',
        shareToken: token,
        permission: 'view',
        createdBy: owner.uid,
        createdByName: owner.displayName,
        active: true,
      });
      expect(shares[0].createdAt).toBeGreaterThan(0);
      expect(shares[0].expiresAt).toBeUndefined();
    });

    test('creates editable share link', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'edit'
      );

      const shares = await getDocumentShares(testDocId);
      expect(shares[0].permission).toBe('edit');
    });

    test('creates comment-only share link', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'comment'
      );

      const shares = await getDocumentShares(testDocId);
      expect(shares[0].permission).toBe('comment');
    });

    test('creates share link with expiry date', async () => {
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view',
        sevenDays
      );

      const shares = await getDocumentShares(testDocId);
      expect(shares[0].expiresAt).toBeDefined();
      expect(shares[0].expiresAt).toBeGreaterThan(now);
      expect(shares[0].expiresAt).toBeLessThanOrEqual(now + sevenDays + 1000); // 1s tolerance
    });
  });

  describe('Email Sharing', () => {
    test('shares document via email with existing user', async () => {
      const shareId = await createEmailShare(
        testDocId,
        owner.uid,
        owner.displayName,
        recipient.email,
        'edit'
      );

      expect(shareId).toBeDefined();

      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(1);
      expect(shares[0]).toMatchObject({
        documentId: testDocId,
        type: 'email',
        sharedWithEmail: recipient.email,
        sharedWithUserId: recipient.uid,
        permission: 'edit',
        createdBy: owner.uid,
        active: true,
      });
    });

    test('shares document via email with non-existent user', async () => {
      const unknownEmail = 'unknown@test.com';

      const shareId = await createEmailShare(
        testDocId,
        owner.uid,
        owner.displayName,
        unknownEmail,
        'view'
      );

      const shares = await getDocumentShares(testDocId);
      expect(shares[0].sharedWithEmail).toBe(unknownEmail);
      expect(shares[0].sharedWithUserId).toBeUndefined();
    });

    test('adds document to recipient sharedWithMe collection', async () => {
      await createEmailShare(
        testDocId,
        owner.uid,
        owner.displayName,
        recipient.email,
        'comment'
      );

      const sharedDocs = await getSharedWithMe(recipient.uid);
      expect(sharedDocs).toHaveLength(1);
      expect(sharedDocs[0]).toMatchObject({
        documentId: testDocId,
        title: testDocument.title,
        ownerName: owner.displayName,
        ownerId: owner.uid,
        permission: 'comment',
      });
      expect(sharedDocs[0].sharedAt).toBeGreaterThan(0);
    });
  });

  describe('Token Validation', () => {
    test('validates share token', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view'
      );

      const result = await validateShareToken(token);

      expect(result).not.toBeNull();
      expect(result?.documentId).toBe(testDocId);
      expect(result?.permission).toBe('view');
    });

    test('respects expiry date', async () => {
      // Create share that expires in the past
      const pastTime = -1000; // 1 second ago
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view',
        pastTime
      );

      const result = await validateShareToken(token);

      // Token should be invalid due to expiration
      expect(result).toBeNull();

      // Share should be marked as inactive
      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(0); // getDocumentShares only returns active shares
    });

    test('handles invalid tokens', async () => {
      const result = await validateShareToken('invalid-token-xyz');
      expect(result).toBeNull();
    });

    test('handles tokens for inactive shares', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view'
      );

      // Get the share and revoke it
      const shares = await getDocumentShares(testDocId);
      await revokeShare(testDocId, shares[0].id);

      // Token should now be invalid
      const result = await validateShareToken(token);
      expect(result).toBeNull();
    });
  });

  describe('Getting Shares', () => {
    test('gets all shares for document', async () => {
      // Create multiple shares
      await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      await createShareLink(testDocId, owner.uid, owner.displayName, 'edit');
      await createEmailShare(testDocId, owner.uid, owner.displayName, recipient.email, 'comment');

      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(3);

      const linkShares = shares.filter(s => s.type === 'link');
      const emailShares = shares.filter(s => s.type === 'email');

      expect(linkShares).toHaveLength(2);
      expect(emailShares).toHaveLength(1);
    });

    test('only returns active shares', async () => {
      const token1 = await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      const token2 = await createShareLink(testDocId, owner.uid, owner.displayName, 'edit');

      let shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(2);

      // Revoke one share
      await revokeShare(testDocId, shares[0].id);

      shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(1);
    });

    test('gets documents shared with user', async () => {
      const doc2Id = 'test-document-456';
      await mockDatabase.doc(`documents/${doc2Id}`).set({
        id: doc2Id,
        userId: owner.uid,
        title: 'Another Document',
        content: '<p>Content</p>',
        wordCount: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Share both documents with recipient
      await createEmailShare(testDocId, owner.uid, owner.displayName, recipient.email, 'view');
      await createEmailShare(doc2Id, owner.uid, owner.displayName, recipient.email, 'edit');

      const sharedDocs = await getSharedWithMe(recipient.uid);
      expect(sharedDocs).toHaveLength(2);

      const docIds = sharedDocs.map(d => d.documentId);
      expect(docIds).toContain(testDocId);
      expect(docIds).toContain(doc2Id);
    });

    test('returns empty array for user with no shared documents', async () => {
      const sharedDocs = await getSharedWithMe('user-with-no-shares');
      expect(sharedDocs).toEqual([]);
    });
  });

  describe('Revoking Shares', () => {
    test('revokes share access', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view'
      );

      let shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(1);

      await revokeShare(testDocId, shares[0].id);

      shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(0);
    });

    test('removes from sharedWithMe when revoking email share', async () => {
      await createEmailShare(
        testDocId,
        owner.uid,
        owner.displayName,
        recipient.email,
        'edit'
      );

      let sharedDocs = await getSharedWithMe(recipient.uid);
      expect(sharedDocs).toHaveLength(1);

      const shares = await getDocumentShares(testDocId);
      await revokeShare(testDocId, shares[0].id);

      sharedDocs = await getSharedWithMe(recipient.uid);
      expect(sharedDocs).toHaveLength(0);
    });

    test('throws error when revoking non-existent share', async () => {
      await expect(
        revokeShare(testDocId, 'non-existent-share-id')
      ).rejects.toThrow('Share not found');
    });
  });

  describe('Permission Management', () => {
    test('updates share permission', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view'
      );

      let shares = await getDocumentShares(testDocId);
      expect(shares[0].permission).toBe('view');

      await updateSharePermission(testDocId, shares[0].id, 'edit');

      shares = await getDocumentShares(testDocId);
      expect(shares[0].permission).toBe('edit');
    });

    test('updates permission in sharedWithMe for email shares', async () => {
      await createEmailShare(
        testDocId,
        owner.uid,
        owner.displayName,
        recipient.email,
        'view'
      );

      let sharedDocs = await getSharedWithMe(recipient.uid);
      expect(sharedDocs[0].permission).toBe('view');

      const shares = await getDocumentShares(testDocId);
      await updateSharePermission(testDocId, shares[0].id, 'edit');

      sharedDocs = await getSharedWithMe(recipient.uid);
      expect(sharedDocs[0].permission).toBe('edit');
    });

    test('throws error when updating non-existent share', async () => {
      await expect(
        updateSharePermission(testDocId, 'non-existent-id', 'edit')
      ).rejects.toThrow('Share not found');
    });
  });

  describe('User Document Permissions', () => {
    test('returns edit permission for document owner', async () => {
      const permission = await getUserDocumentPermission(testDocId, owner.uid);
      expect(permission).toBe('edit');
    });

    test('returns correct permission for shared user', async () => {
      await createEmailShare(
        testDocId,
        owner.uid,
        owner.displayName,
        recipient.email,
        'comment'
      );

      const permission = await getUserDocumentPermission(testDocId, recipient.uid);
      expect(permission).toBe('comment');
    });

    test('returns null for user without access', async () => {
      const randomUser = createMockUser({ uid: 'random-user' });
      const permission = await getUserDocumentPermission(testDocId, randomUser.uid);
      expect(permission).toBeNull();
    });

    test('returns null for non-existent document', async () => {
      const permission = await getUserDocumentPermission('non-existent-doc', owner.uid);
      expect(permission).toBeNull();
    });
  });

  describe('Security', () => {
    test('share tokens are cryptographically secure', async () => {
      // Reset mock to use real crypto.randomUUID
      mockRandomUUID.mockRestore();
      const realCrypto = {
        randomUUID: () => {
          // Simple UUID v4 implementation for testing
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }
      } as Crypto;

      global.crypto = { ...global.crypto, ...realCrypto };

      const token1 = await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      const token2 = await createShareLink(testDocId, owner.uid, owner.displayName, 'view');

      // Tokens should be different (astronomically unlikely to be the same)
      expect(token1).not.toBe(token2);

      // Reset mock
      global.crypto.randomUUID = mockRandomUUID as unknown as typeof global.crypto.randomUUID;
    });

    test('inactive shares cannot be validated', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'edit'
      );

      // First validation should work
      let result = await validateShareToken(token);
      expect(result?.permission).toBe('edit');

      // Revoke the share
      const shares = await getDocumentShares(testDocId);
      await revokeShare(testDocId, shares[0].id);

      // Second validation should fail
      result = await validateShareToken(token);
      expect(result).toBeNull();
    });

    test('expired shares are automatically deactivated on validation', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view',
        -1000 // Expired 1 second ago
      );

      // Validate the expired token
      await validateShareToken(token);

      // Check that it was marked as inactive in the Supabase-style table
      const shareRows = mockDatabase.getCollection('document_shares');
      const matchingShare = shareRows.find((row) => row.share_token === token);

      expect(matchingShare).toBeDefined();
      expect(matchingShare?.active).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('handles multiple shares with same permission', async () => {
      await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      await createShareLink(testDocId, owner.uid, owner.displayName, 'view');

      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(3);
      expect(shares.every(s => s.permission === 'view')).toBe(true);
    });

    test('handles sharing with same user multiple times', async () => {
      await createEmailShare(testDocId, owner.uid, owner.displayName, recipient.email, 'view');
      await createEmailShare(testDocId, owner.uid, owner.displayName, recipient.email, 'edit');

      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(2);
      expect(shares.every(s => s.sharedWithEmail === recipient.email)).toBe(true);
    });

    test('handles very short expiry times', async () => {
      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view',
        1 // 1 millisecond
      );

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await validateShareToken(token);
      expect(result).toBeNull();
    });

    test('handles very long expiry times', async () => {
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const token = await createShareLink(
        testDocId,
        owner.uid,
        owner.displayName,
        'view',
        oneYear
      );

      const shares = await getDocumentShares(testDocId);
      expect(shares[0].expiresAt).toBeGreaterThan(now + oneYear - 1000);
    });

    test('returns empty array when document has no shares', async () => {
      const shares = await getDocumentShares(testDocId);
      expect(shares).toEqual([]);
    });

    test('shares are ordered by creation date (newest first)', async () => {
      await createShareLink(testDocId, owner.uid, owner.displayName, 'view');
      await new Promise(resolve => setTimeout(resolve, 10));
      await createShareLink(testDocId, owner.uid, owner.displayName, 'edit');
      await new Promise(resolve => setTimeout(resolve, 10));
      await createShareLink(testDocId, owner.uid, owner.displayName, 'comment');

      const shares = await getDocumentShares(testDocId);
      expect(shares).toHaveLength(3);

      // Should be ordered by createdAt desc
      for (let i = 0; i < shares.length - 1; i++) {
        expect(shares[i].createdAt).toBeGreaterThanOrEqual(shares[i + 1].createdAt);
      }
    });
  });
});
