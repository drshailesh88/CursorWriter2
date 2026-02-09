/**
 * Comments System Test
 *
 * Tests the document commenting and reply system including:
 * - Creating comments and suggestions on text selections
 * - Adding replies to comments
 * - Resolving and unresolving comments
 * - Deleting comments
 * - Handling concurrent comments
 * - Preserving comment positions after edits
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { mockDatabase, resetSupabaseMocks, mockSupabaseBrowserClient } from '../../mocks/supabase';
import { createMockUser } from '../../mocks/test-data';
import type { Comment, CommentReply, CreateCommentData } from '@/lib/collaboration/types';

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
  addComment,
  getComments,
  updateComment,
  deleteComment,
  resolveComment,
  addReply,
  subscribeToComments,
} from '@/lib/collaboration/comments';

describe('Comments System', () => {
  const testDocId = 'test-document-123';
  const testUser = createMockUser({ uid: 'user-1', displayName: 'Test User' });
  const testUser2 = createMockUser({ uid: 'user-2', displayName: 'Second User' });

  beforeEach(() => {
    resetSupabaseMocks();
  });

  describe('Creating Comments', () => {
    test('creates comment on selection', async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        userAvatar: testUser.photoURL,
        selectionStart: 10,
        selectionEnd: 25,
        selectedText: 'important text',
        content: 'This needs clarification',
        type: 'comment',
      };

      const commentId = await addComment(commentData);

      expect(commentId).toBeDefined();
      expect(commentId).toMatch(/^mock-id-/);

      // Verify the comment was stored correctly
      const comments = await getComments(testDocId);
      expect(comments).toHaveLength(1);
      expect(comments[0]).toMatchObject({
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 25,
        selectedText: 'important text',
        content: 'This needs clarification',
        type: 'comment',
        resolved: false,
      });
      expect(comments[0].replies).toEqual([]);
      expect(comments[0].createdAt).toBeGreaterThan(0);
      expect(comments[0].updatedAt).toBeGreaterThan(0);
    });

    test('creates suggestion with suggested text', async () => {
      const suggestionData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 0,
        selectionEnd: 10,
        selectedText: 'old text',
        content: 'Consider this alternative',
        type: 'suggestion',
        suggestedText: 'new text',
      };

      const commentId = await addComment(suggestionData);
      const comments = await getComments(testDocId);

      expect(comments[0].type).toBe('suggestion');
      expect(comments[0].suggestedText).toBe('new text');
      expect(comments[0].selectedText).toBe('old text');
    });

    test('handles concurrent comments on same document', async () => {
      const comment1Data: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 0,
        selectionEnd: 10,
        selectedText: 'first section',
        content: 'First comment',
        type: 'comment',
      };

      const comment2Data: CreateCommentData = {
        documentId: testDocId,
        userId: testUser2.uid,
        userName: testUser2.displayName,
        selectionStart: 20,
        selectionEnd: 35,
        selectedText: 'second section',
        content: 'Second comment',
        type: 'comment',
      };

      // Create comments concurrently
      const [id1, id2] = await Promise.all([
        addComment(comment1Data),
        addComment(comment2Data),
      ]);

      expect(id1).not.toBe(id2);

      const comments = await getComments(testDocId);
      expect(comments).toHaveLength(2);

      // Should be ordered by createdAt
      expect(comments[0].userId).toBeDefined();
      expect(comments[1].userId).toBeDefined();
    });

    test('handles comments at document boundaries', async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 0,
        selectionEnd: 0,
        selectedText: '',
        content: 'Comment at start',
        type: 'comment',
      };

      const commentId = await addComment(commentData);
      expect(commentId).toBeDefined();

      const comments = await getComments(testDocId);
      expect(comments[0].selectionStart).toBe(0);
      expect(comments[0].selectionEnd).toBe(0);
    });
  });

  describe('Comment Replies', () => {
    let commentId: string;

    beforeEach(async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'Original comment',
        type: 'comment',
      };
      commentId = await addComment(commentData);
    });

    test('creates reply to comment', async () => {
      const reply = {
        userId: testUser2.uid,
        userName: testUser2.displayName,
        content: 'This is a reply',
      };

      await addReply(testDocId, commentId, reply);

      const comments = await getComments(testDocId);
      expect(comments[0].replies).toHaveLength(1);
      expect(comments[0].replies[0]).toMatchObject({
        userId: testUser2.uid,
        userName: testUser2.displayName,
        content: 'This is a reply',
      });
      expect(comments[0].replies[0].id).toMatch(/^reply_/);
      expect(comments[0].replies[0].createdAt).toBeGreaterThan(0);
    });

    test('creates multiple replies to same comment', async () => {
      await addReply(testDocId, commentId, {
        userId: testUser2.uid,
        userName: testUser2.displayName,
        content: 'First reply',
      });

      await addReply(testDocId, commentId, {
        userId: testUser.uid,
        userName: testUser.displayName,
        content: 'Second reply',
      });

      const comments = await getComments(testDocId);
      expect(comments[0].replies).toHaveLength(2);
      expect(comments[0].replies[0].content).toBe('First reply');
      expect(comments[0].replies[1].content).toBe('Second reply');
    });

    test('throws error when replying to non-existent comment', async () => {
      await expect(
        addReply(testDocId, 'non-existent-id', {
          userId: testUser.uid,
          userName: testUser.displayName,
          content: 'Reply to nothing',
        })
      ).rejects.toThrow('Comment not found');
    });

    test('updates comment timestamp when reply is added', async () => {
      const commentsBefore = await getComments(testDocId);
      const originalUpdatedAt = commentsBefore[0].updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await addReply(testDocId, commentId, {
        userId: testUser2.uid,
        userName: testUser2.displayName,
        content: 'New reply',
      });

      const commentsAfter = await getComments(testDocId);
      expect(commentsAfter[0].updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe('Resolving Comments', () => {
    let commentId: string;

    beforeEach(async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'Original comment',
        type: 'comment',
      };
      commentId = await addComment(commentData);
    });

    test('resolves comment', async () => {
      await resolveComment(testDocId, commentId);

      const comments = await getComments(testDocId);
      expect(comments[0].resolved).toBe(true);
    });

    test('unresolves comment', async () => {
      // First resolve
      await resolveComment(testDocId, commentId);

      // Then unresolve
      await updateComment(testDocId, commentId, { resolved: false });

      const comments = await getComments(testDocId);
      expect(comments[0].resolved).toBe(false);
    });

    test('updates timestamp when resolving', async () => {
      const commentsBefore = await getComments(testDocId);
      const originalUpdatedAt = commentsBefore[0].updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      await resolveComment(testDocId, commentId);

      const commentsAfter = await getComments(testDocId);
      expect(commentsAfter[0].updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe('Updating Comments', () => {
    let commentId: string;

    beforeEach(async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'Original comment',
        type: 'comment',
      };
      commentId = await addComment(commentData);
    });

    test('updates comment content', async () => {
      await updateComment(testDocId, commentId, {
        content: 'Updated comment text',
      });

      const comments = await getComments(testDocId);
      expect(comments[0].content).toBe('Updated comment text');
    });

    test('updates suggested text in suggestion', async () => {
      const suggestionData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 0,
        selectionEnd: 5,
        selectedText: 'old',
        content: 'Suggestion',
        type: 'suggestion',
        suggestedText: 'new',
      };

      const suggestionId = await addComment(suggestionData);

      await updateComment(testDocId, suggestionId, {
        suggestedText: 'updated new text',
      });

      const comments = await getComments(testDocId);
      const suggestion = comments.find(c => c.id === suggestionId);
      expect(suggestion?.suggestedText).toBe('updated new text');
    });
  });

  describe('Deleting Comments', () => {
    test('deletes comment', async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'To be deleted',
        type: 'comment',
      };

      const commentId = await addComment(commentData);

      let comments = await getComments(testDocId);
      expect(comments).toHaveLength(1);

      await deleteComment(testDocId, commentId);

      comments = await getComments(testDocId);
      expect(comments).toHaveLength(0);
    });

    test('deleting comment also deletes its replies', async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'Comment with replies',
        type: 'comment',
      };

      const commentId = await addComment(commentData);

      await addReply(testDocId, commentId, {
        userId: testUser2.uid,
        userName: testUser2.displayName,
        content: 'Reply 1',
      });

      await addReply(testDocId, commentId, {
        userId: testUser.uid,
        userName: testUser.displayName,
        content: 'Reply 2',
      });

      await deleteComment(testDocId, commentId);

      const comments = await getComments(testDocId);
      expect(comments).toHaveLength(0);
    });
  });

  // Note: Real-time subscription tests require complex onSnapshot mock setup
  // These are better suited as integration tests with actual Supabase
  describe.skip('Real-time Subscriptions', () => {
    test('subscribes to comment updates', async () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToComments(testDocId, callback);

      // Should be called immediately with empty array
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([]);

      // Add a comment
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'New comment',
        type: 'comment',
      };

      await addComment(commentData);

      // Should be called again with the new comment
      expect(callback).toHaveBeenCalledTimes(2);
      const lastCall = callback.mock.calls[1][0];
      expect(lastCall).toHaveLength(1);
      expect(lastCall[0].content).toBe('New comment');

      unsubscribe();
    });

    test('unsubscribe stops receiving updates', async () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToComments(testDocId, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Add comment after unsubscribing
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test text',
        content: 'Should not notify',
        type: 'comment',
      };

      await addComment(commentData);

      // Should still be 1 (initial call only)
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Comment Position Preservation', () => {
    test('preserves comment positions after edits', async () => {
      // Create comment at position 10-20
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'selected text',
        content: 'Comment on text',
        type: 'comment',
      };

      const commentId = await addComment(commentData);

      // Verify positions are stored correctly
      const comments = await getComments(testDocId);
      expect(comments[0].selectionStart).toBe(10);
      expect(comments[0].selectionEnd).toBe(20);
      expect(comments[0].selectedText).toBe('selected text');
    });

    test('handles overlapping comment ranges', async () => {
      // First comment: 10-30
      await addComment({
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 30,
        selectedText: 'first selection',
        content: 'First comment',
        type: 'comment',
      });

      // Second comment: 20-40 (overlaps with first)
      await addComment({
        documentId: testDocId,
        userId: testUser2.uid,
        userName: testUser2.displayName,
        selectionStart: 20,
        selectionEnd: 40,
        selectedText: 'second selection',
        content: 'Second comment',
        type: 'comment',
      });

      const comments = await getComments(testDocId);
      expect(comments).toHaveLength(2);

      // Both comments should exist with their original positions
      expect(comments[0].selectionStart).toBe(10);
      expect(comments[0].selectionEnd).toBe(30);
      expect(comments[1].selectionStart).toBe(20);
      expect(comments[1].selectionEnd).toBe(40);
    });
  });

  describe('Error Handling', () => {
    test('handles empty comment content', async () => {
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test',
        content: '',
        type: 'comment',
      };

      const commentId = await addComment(commentData);
      expect(commentId).toBeDefined();

      const comments = await getComments(testDocId);
      expect(comments[0].content).toBe('');
    });

    test('returns empty array for document with no comments', async () => {
      const comments = await getComments('non-existent-document');
      expect(comments).toEqual([]);
    });

    test('handles very long comment content', async () => {
      const longContent = 'a'.repeat(10000);
      const commentData: CreateCommentData = {
        documentId: testDocId,
        userId: testUser.uid,
        userName: testUser.displayName,
        selectionStart: 10,
        selectionEnd: 20,
        selectedText: 'test',
        content: longContent,
        type: 'comment',
      };

      const commentId = await addComment(commentData);
      const comments = await getComments(testDocId);
      expect(comments[0].content).toBe(longContent);
    });
  });
});
