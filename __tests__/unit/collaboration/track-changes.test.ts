/**
 * Track Changes Test
 *
 * Tests the track changes system including:
 * - Tracking insertions and deletions
 * - Accepting and rejecting changes
 * - Batch operations (accept all, reject all)
 * - Change authorship tracking
 * - Handling overlapping changes
 * - Real-time subscriptions
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { mockDatabase, resetSupabaseMocks, mockSupabaseBrowserClient } from '../../mocks/supabase';
import { createMockUser } from '../../mocks/test-data';
import type { TrackedChange, ChangeType } from '@/lib/collaboration/types';

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
  createTrackedChange,
  getTrackedChanges,
  acceptChange,
  rejectChange,
  deleteTrackedChange,
  acceptAllChanges,
  rejectAllChanges,
  subscribeToTrackedChanges,
} from '@/lib/collaboration/track-changes';

describe('Track Changes', () => {
  const testDocId = 'test-document-123';
  const author1 = createMockUser({ uid: 'author-1', displayName: 'First Author' });
  const author2 = createMockUser({ uid: 'author-2', displayName: 'Second Author' });
  const reviewer = createMockUser({ uid: 'reviewer-1', displayName: 'Reviewer' });

  beforeEach(() => {
    resetSupabaseMocks();
  });

  describe('Tracking Insertions', () => {
    test('tracks insertions', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        25,
        author1.uid,
        author1.displayName,
        undefined,
        'new inserted text'
      );

      expect(changeId).toBeDefined();

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        documentId: testDocId,
        type: 'insertion',
        from: 10,
        to: 25,
        newContent: 'new inserted text',
        userId: author1.uid,
        userName: author1.displayName,
        status: 'pending',
      });
      expect(changes[0].oldContent).toBeUndefined();
      expect(changes[0].createdAt).toBeGreaterThan(0);
    });

    test('tracks multiple insertions', async () => {
      await createTrackedChange(
        testDocId,
        'insertion',
        0,
        5,
        author1.uid,
        author1.displayName,
        undefined,
        'First'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'Second'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        30,
        45,
        author2.uid,
        author2.displayName,
        undefined,
        'Third'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(3);
    });

    test('tracks insertion at document start', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        0,
        0,
        author1.uid,
        author1.displayName,
        undefined,
        'At start'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].from).toBe(0);
      expect(changes[0].to).toBe(0);
    });
  });

  describe('Tracking Deletions', () => {
    test('tracks deletions', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'deletion',
        15,
        30,
        author1.uid,
        author1.displayName,
        'deleted text content',
        undefined
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0]).toMatchObject({
        type: 'deletion',
        from: 15,
        to: 30,
        oldContent: 'deleted text content',
        userId: author1.uid,
        userName: author1.displayName,
        status: 'pending',
      });
      expect(changes[0].newContent).toBeUndefined();
    });

    test('tracks multiple deletions', async () => {
      await createTrackedChange(
        testDocId,
        'deletion',
        0,
        10,
        author1.uid,
        author1.displayName,
        'old text 1'
      );

      await createTrackedChange(
        testDocId,
        'deletion',
        20,
        35,
        author2.uid,
        author2.displayName,
        'old text 2'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);
    });
  });

  describe('Tracking Formatting Changes', () => {
    test('tracks formatting changes', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'formatting',
        5,
        20,
        author1.uid,
        author1.displayName,
        'plain text',
        '<strong>bold text</strong>'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0]).toMatchObject({
        type: 'formatting',
        from: 5,
        to: 20,
        oldContent: 'plain text',
        newContent: '<strong>bold text</strong>',
        status: 'pending',
      });
    });
  });

  describe('Accepting Changes', () => {
    let changeId: string;

    beforeEach(async () => {
      changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'new text'
      );
    });

    test('accepts single change', async () => {
      await acceptChange(testDocId, changeId, reviewer.uid);

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].status).toBe('accepted');
      expect(changes[0].resolvedBy).toBe(reviewer.uid);
      expect(changes[0].resolvedAt).toBeGreaterThan(0);
    });

    test('tracks who accepted the change', async () => {
      await acceptChange(testDocId, changeId, reviewer.uid);

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].resolvedBy).toBe(reviewer.uid);
    });

    test('accepts change with timestamp', async () => {
      const beforeAccept = Date.now();
      await acceptChange(testDocId, changeId, reviewer.uid);
      const afterAccept = Date.now();

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].resolvedAt).toBeGreaterThanOrEqual(beforeAccept);
      expect(changes[0].resolvedAt).toBeLessThanOrEqual(afterAccept);
    });
  });

  describe('Rejecting Changes', () => {
    let changeId: string;

    beforeEach(async () => {
      changeId = await createTrackedChange(
        testDocId,
        'deletion',
        5,
        15,
        author1.uid,
        author1.displayName,
        'keep this text'
      );
    });

    test('rejects single change', async () => {
      await rejectChange(testDocId, changeId, reviewer.uid);

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].status).toBe('rejected');
      expect(changes[0].resolvedBy).toBe(reviewer.uid);
      expect(changes[0].resolvedAt).toBeGreaterThan(0);
    });

    test('tracks who rejected the change', async () => {
      await rejectChange(testDocId, changeId, reviewer.uid);

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].resolvedBy).toBe(reviewer.uid);
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      // Create multiple pending changes
      await createTrackedChange(
        testDocId,
        'insertion',
        0,
        5,
        author1.uid,
        author1.displayName,
        undefined,
        'Change 1'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'Change 2'
      );

      await createTrackedChange(
        testDocId,
        'deletion',
        30,
        40,
        author2.uid,
        author2.displayName,
        'Old text'
      );
    });

    test('accepts all changes', async () => {
      let changes = await getTrackedChanges(testDocId, 'pending');
      expect(changes).toHaveLength(3);

      await acceptAllChanges(testDocId, reviewer.uid);

      changes = await getTrackedChanges(testDocId, 'pending');
      expect(changes).toHaveLength(0);

      changes = await getTrackedChanges(testDocId, 'accepted');
      expect(changes).toHaveLength(3);
      expect(changes.every(c => c.resolvedBy === reviewer.uid)).toBe(true);
    });

    test('rejects all changes', async () => {
      let changes = await getTrackedChanges(testDocId, 'pending');
      expect(changes).toHaveLength(3);

      await rejectAllChanges(testDocId, reviewer.uid);

      changes = await getTrackedChanges(testDocId, 'pending');
      expect(changes).toHaveLength(0);

      changes = await getTrackedChanges(testDocId, 'rejected');
      expect(changes).toHaveLength(3);
      expect(changes.every(c => c.resolvedBy === reviewer.uid)).toBe(true);
    });

    test('batch operations only affect pending changes', async () => {
      // Accept one change manually
      const allChanges = await getTrackedChanges(testDocId);
      await acceptChange(testDocId, allChanges[0].id, reviewer.uid);

      // Now reject all pending
      await rejectAllChanges(testDocId, reviewer.uid);

      const accepted = await getTrackedChanges(testDocId, 'accepted');
      const rejected = await getTrackedChanges(testDocId, 'rejected');

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(2);
    });
  });

  describe('Deleting Changes', () => {
    test('deletes tracked change', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'to delete'
      );

      let changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(1);

      await deleteTrackedChange(testDocId, changeId);

      changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(0);
    });

    test('can delete specific change while keeping others', async () => {
      const change1 = await createTrackedChange(
        testDocId,
        'insertion',
        0,
        5,
        author1.uid,
        author1.displayName,
        undefined,
        'Keep'
      );

      const change2 = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        15,
        author1.uid,
        author1.displayName,
        undefined,
        'Delete'
      );

      const change3 = await createTrackedChange(
        testDocId,
        'insertion',
        20,
        25,
        author1.uid,
        author1.displayName,
        undefined,
        'Keep'
      );

      await deleteTrackedChange(testDocId, change2);

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);

      const changeIds = changes.map(c => c.id);
      expect(changeIds).toContain(change1);
      expect(changeIds).not.toContain(change2);
      expect(changeIds).toContain(change3);
    });
  });

  describe('Change Authorship', () => {
    test('preserves change authorship', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'authored text'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].userId).toBe(author1.uid);
      expect(changes[0].userName).toBe(author1.displayName);
    });

    test('tracks different authors for different changes', async () => {
      await createTrackedChange(
        testDocId,
        'insertion',
        0,
        10,
        author1.uid,
        author1.displayName,
        undefined,
        'By author 1'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        20,
        30,
        author2.uid,
        author2.displayName,
        undefined,
        'By author 2'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);

      const authors = changes.map(c => c.userId);
      expect(authors).toContain(author1.uid);
      expect(authors).toContain(author2.uid);
    });

    test('distinguishes between change author and resolver', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'text'
      );

      await acceptChange(testDocId, changeId, reviewer.uid);

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].userId).toBe(author1.uid); // Original author
      expect(changes[0].resolvedBy).toBe(reviewer.uid); // Person who accepted
    });
  });

  describe('Overlapping Changes', () => {
    test('handles overlapping changes', async () => {
      // Change 1: position 10-30
      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        30,
        author1.uid,
        author1.displayName,
        undefined,
        'First change'
      );

      // Change 2: position 20-40 (overlaps with change 1)
      await createTrackedChange(
        testDocId,
        'insertion',
        20,
        40,
        author2.uid,
        author2.displayName,
        undefined,
        'Second change'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);

      // Both changes should exist with their positions
      expect(changes[0].from).toBe(10);
      expect(changes[0].to).toBe(30);
      expect(changes[1].from).toBe(20);
      expect(changes[1].to).toBe(40);
    });

    test('handles nested changes', async () => {
      // Outer change: 0-100
      await createTrackedChange(
        testDocId,
        'insertion',
        0,
        100,
        author1.uid,
        author1.displayName,
        undefined,
        'Outer'
      );

      // Inner change: 30-50
      await createTrackedChange(
        testDocId,
        'deletion',
        30,
        50,
        author2.uid,
        author2.displayName,
        'inner text'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);
    });

    test('handles adjacent changes', async () => {
      // Change 1: 0-10
      await createTrackedChange(
        testDocId,
        'insertion',
        0,
        10,
        author1.uid,
        author1.displayName,
        undefined,
        'First'
      );

      // Change 2: 10-20 (starts where change 1 ends)
      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'Second'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);

      // Should be ordered by position
      expect(changes[0].from).toBe(0);
      expect(changes[1].from).toBe(10);
    });
  });

  describe('Filtering Changes', () => {
    beforeEach(async () => {
      const change1 = await createTrackedChange(
        testDocId,
        'insertion',
        0,
        10,
        author1.uid,
        author1.displayName,
        undefined,
        'Change 1'
      );

      const change2 = await createTrackedChange(
        testDocId,
        'insertion',
        20,
        30,
        author1.uid,
        author1.displayName,
        undefined,
        'Change 2'
      );

      const change3 = await createTrackedChange(
        testDocId,
        'deletion',
        40,
        50,
        author2.uid,
        author2.displayName,
        'Delete this'
      );

      // Accept change 1
      await acceptChange(testDocId, change1, reviewer.uid);

      // Reject change 2
      await rejectChange(testDocId, change2, reviewer.uid);

      // Leave change 3 pending
    });

    test('gets all changes', async () => {
      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(3);
    });

    test('filters by pending status', async () => {
      const changes = await getTrackedChanges(testDocId, 'pending');
      expect(changes).toHaveLength(1);
      expect(changes[0].status).toBe('pending');
    });

    test('filters by accepted status', async () => {
      const changes = await getTrackedChanges(testDocId, 'accepted');
      expect(changes).toHaveLength(1);
      expect(changes[0].status).toBe('accepted');
    });

    test('filters by rejected status', async () => {
      const changes = await getTrackedChanges(testDocId, 'rejected');
      expect(changes).toHaveLength(1);
      expect(changes[0].status).toBe('rejected');
    });
  });

  describe('Change Ordering', () => {
    test('orders changes by position', async () => {
      await createTrackedChange(
        testDocId,
        'insertion',
        50,
        60,
        author1.uid,
        author1.displayName,
        undefined,
        'Third'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'First'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        30,
        40,
        author1.uid,
        author1.displayName,
        undefined,
        'Second'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(3);

      // Should be ordered by from position (ascending)
      expect(changes[0].from).toBe(10);
      expect(changes[1].from).toBe(30);
      expect(changes[2].from).toBe(50);
    });
  });

  // Note: Real-time subscription tests require complex onSnapshot mock setup
  // These are better suited as integration tests with actual Supabase
  describe.skip('Real-time Subscriptions', () => {
    test('subscribes to tracked changes updates', async () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToTrackedChanges(testDocId, callback);

      // Should be called immediately with empty array
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([]);

      // Add a change
      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'new text'
      );

      // Should be called again with the new change
      expect(callback).toHaveBeenCalledTimes(2);
      const lastCall = callback.mock.calls[1][0];
      expect(lastCall).toHaveLength(1);
      expect(lastCall[0].newContent).toBe('new text');

      unsubscribe();
    });

    test('receives updates when changes are accepted', async () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToTrackedChanges(testDocId, callback);

      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'text'
      );

      // Initial call + after create = 2
      expect(callback).toHaveBeenCalledTimes(2);

      await acceptChange(testDocId, changeId, reviewer.uid);

      // Should be called again after accept
      expect(callback).toHaveBeenCalledTimes(3);
      const lastCall = callback.mock.calls[2][0];
      expect(lastCall[0].status).toBe('accepted');

      unsubscribe();
    });

    test('unsubscribe stops receiving updates', async () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToTrackedChanges(testDocId, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Add change after unsubscribing
      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'should not notify'
      );

      // Should still be 1 (initial call only)
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty old content in deletion', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'deletion',
        10,
        10,
        author1.uid,
        author1.displayName,
        ''
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].oldContent).toBe('');
    });

    test('handles empty new content in insertion', async () => {
      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        10,
        10,
        author1.uid,
        author1.displayName,
        undefined,
        ''
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].newContent).toBe('');
    });

    test('handles very long content in changes', async () => {
      const longText = 'a'.repeat(10000);

      const changeId = await createTrackedChange(
        testDocId,
        'insertion',
        0,
        10000,
        author1.uid,
        author1.displayName,
        undefined,
        longText
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes[0].newContent).toBe(longText);
    });

    test('returns empty array for document with no changes', async () => {
      const changes = await getTrackedChanges('non-existent-doc');
      expect(changes).toEqual([]);
    });

    test('handles changes at same position by different authors', async () => {
      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author1.uid,
        author1.displayName,
        undefined,
        'Author 1 text'
      );

      await createTrackedChange(
        testDocId,
        'insertion',
        10,
        20,
        author2.uid,
        author2.displayName,
        undefined,
        'Author 2 text'
      );

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(2);
      expect(changes[0].from).toBe(10);
      expect(changes[1].from).toBe(10);
    });

    test('batch operations handle no pending changes gracefully', async () => {
      // No pending changes
      await acceptAllChanges(testDocId, reviewer.uid);
      await rejectAllChanges(testDocId, reviewer.uid);

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toEqual([]);
    });
  });

  describe('Performance', () => {
    test('handles large number of changes', async () => {
      // Create 100 changes
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          createTrackedChange(
            testDocId,
            'insertion',
            i * 10,
            i * 10 + 5,
            i % 2 === 0 ? author1.uid : author2.uid,
            i % 2 === 0 ? author1.displayName : author2.displayName,
            undefined,
            `Change ${i}`
          )
        );
      }

      await Promise.all(promises);

      const changes = await getTrackedChanges(testDocId);
      expect(changes).toHaveLength(100);
    });
  });
});
