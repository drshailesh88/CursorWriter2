/**
 * Version History Test
 *
 * Tests document version control including:
 * - Creating auto and manual versions
 * - Restoring to previous versions
 * - Version cleanup (max 50 auto versions)
 * - Version comparison
 * - Version metadata management
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { mockDatabase, resetSupabaseMocks, mockSupabaseBrowserClient } from '../../mocks/supabase';
import { createMockUser, createMockDocument } from '../../mocks/test-data';
import type { DocumentVersion, CreateVersionOptions } from '@/lib/collaboration/types';

// Mock the Supabase client module
vi.mock('@/lib/supabase/client', () => ({
  db: () => mockDatabase,
  getSupabaseBrowserClient: () => mockSupabaseBrowserClient,
}));

vi.mock('@/lib/supabase/documents', () => ({
  getDocument: vi.fn(async (documentId: string) => {
    const docRef = mockDatabase.doc(`documents/${documentId}`);
    const snapshot = await docRef.get();
    if (snapshot.exists()) {
      return snapshot.data();
    }
    return null;
  }),
  updateDocument: vi.fn(async (documentId: string, data: Record<string, unknown>) => {
    const docRef = mockDatabase.doc(`documents/${documentId}`);
    await docRef.update(data);
  }),
}));

// Import after mocking
import {
  createVersion,
  getVersions,
  getVersion,
  deleteVersion,
  restoreVersion,
  updateVersionLabel,
  updateVersionDescription,
  getVersionStats,
} from '@/lib/collaboration/versions';

describe('Version History', () => {
  const testDocId = 'test-document-123';
  const testUser = createMockUser({ uid: 'user-1', displayName: 'Test User' });
  const testDocument = createMockDocument({ id: testDocId, userId: testUser.uid });

  beforeEach(async () => {
    resetSupabaseMocks();

    // Seed the document in the mock database
    await mockDatabase.doc(`documents/${testDocId}`).set({
      id: testDocId,
      userId: testUser.uid,
      title: testDocument.title,
      content: testDocument.content,
      wordCount: testDocument.wordCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  describe('Creating Versions', () => {
    test('creates auto-version every 5 minutes', async () => {
      const options: CreateVersionOptions = {
        type: 'auto',
      };

      const versionId = await createVersion(
        testDocId,
        '<p>Auto-saved content</p>',
        100,
        testUser.uid,
        testUser.displayName,
        options
      );

      expect(versionId).toBeDefined();

      const versions = await getVersions(testDocId);
      expect(versions).toHaveLength(1);
      expect(versions[0].type).toBe('auto');
      expect(versions[0].versionNumber).toBe(1);
      expect(versions[0].userId).toBe(testUser.uid);
      expect(versions[0].userName).toBe(testUser.displayName);
      expect(versions[0].content).toBe('<p>Auto-saved content</p>');
      expect(versions[0].wordCount).toBe(100);
    });

    test('creates manual version snapshot', async () => {
      const options: CreateVersionOptions = {
        type: 'manual',
        label: 'Draft 1',
        description: 'First complete draft',
      };

      const versionId = await createVersion(
        testDocId,
        '<p>Manual save content</p>',
        150,
        testUser.uid,
        testUser.displayName,
        options
      );

      const versions = await getVersions(testDocId);
      expect(versions).toHaveLength(1);
      expect(versions[0].type).toBe('manual');
      expect(versions[0].label).toBe('Draft 1');
      expect(versions[0].description).toBe('First complete draft');
    });

    test('increments version number correctly', async () => {
      const options: CreateVersionOptions = { type: 'auto' };

      // Create multiple versions
      await createVersion(testDocId, '<p>V1</p>', 10, testUser.uid, testUser.displayName, options);
      await createVersion(testDocId, '<p>V2</p>', 20, testUser.uid, testUser.displayName, options);
      await createVersion(testDocId, '<p>V3</p>', 30, testUser.uid, testUser.displayName, options);

      const versions = await getVersions(testDocId);
      expect(versions).toHaveLength(3);

      // Should be ordered by createdAt desc (newest first)
      const versionNumbers = versions.map(v => v.versionNumber).sort();
      expect(versionNumbers).toEqual([1, 2, 3]);
    });

    test('captures document title in version', async () => {
      const options: CreateVersionOptions = { type: 'manual' };

      const versionId = await createVersion(
        testDocId,
        '<p>Content</p>',
        50,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version = await getVersion(testDocId, versionId);
      expect(version?.title).toBe(testDocument.title);
    });
  });

  describe('Version Cleanup', () => {
    test('limits version count (keeps 50)', async () => {
      const options: CreateVersionOptions = { type: 'auto' };

      // Create 55 auto versions
      for (let i = 0; i < 55; i++) {
        await createVersion(
          testDocId,
          `<p>Version ${i}</p>`,
          10,
          testUser.uid,
          testUser.displayName,
          options
        );
      }

      const versions = await getVersions(testDocId);

      // Should only keep 50 versions
      expect(versions.length).toBeLessThanOrEqual(50);
    });

    test('keeps all manual versions during cleanup', async () => {
      // Create 10 manual versions
      const manualOptions: CreateVersionOptions = { type: 'manual', label: 'Important' };
      for (let i = 0; i < 10; i++) {
        await createVersion(
          testDocId,
          `<p>Manual ${i}</p>`,
          10,
          testUser.uid,
          testUser.displayName,
          manualOptions
        );
      }

      // Create 55 auto versions
      const autoOptions: CreateVersionOptions = { type: 'auto' };
      for (let i = 0; i < 55; i++) {
        await createVersion(
          testDocId,
          `<p>Auto ${i}</p>`,
          10,
          testUser.uid,
          testUser.displayName,
          autoOptions
        );
      }

      const allVersions = await getVersions(testDocId, 100);
      const manualVersions = allVersions.filter(v => v.type === 'manual');
      const autoVersions = allVersions.filter(v => v.type === 'auto');

      // All manual versions should be kept
      expect(manualVersions.length).toBe(10);

      // Auto versions should be limited to 50
      expect(autoVersions.length).toBeLessThanOrEqual(50);
    });

    test('deletes oldest auto versions first', async () => {
      const options: CreateVersionOptions = { type: 'auto' };

      // Create versions with distinct content
      const firstVersionId = await createVersion(
        testDocId,
        '<p>First (should be deleted)</p>',
        10,
        testUser.uid,
        testUser.displayName,
        options
      );

      // Create 50 more versions
      for (let i = 0; i < 51; i++) {
        await createVersion(
          testDocId,
          `<p>Version ${i}</p>`,
          10,
          testUser.uid,
          testUser.displayName,
          options
        );
      }

      const versions = await getVersions(testDocId);
      const firstVersionExists = versions.some(v => v.id === firstVersionId);

      // First version should have been cleaned up
      expect(firstVersionExists).toBe(false);
    });
  });

  describe('Restoring Versions', () => {
    let versionId: string;

    beforeEach(async () => {
      const options: CreateVersionOptions = {
        type: 'manual',
        label: 'Restore Point',
      };

      versionId = await createVersion(
        testDocId,
        '<p>Original version content</p>',
        50,
        testUser.uid,
        testUser.displayName,
        options
      );

      // Update document to different content
      await mockDatabase.doc(`documents/${testDocId}`).update({
        content: '<p>Changed content</p>',
        wordCount: 20,
      });
    });

    test('restores to previous version', async () => {
      await restoreVersion(testDocId, versionId, testUser.uid, testUser.displayName);

      const docRef = mockDatabase.doc(`documents/${testDocId}`);
      const snapshot = await docRef.get();
      const docData = snapshot.data();

      expect(docData?.content).toBe('<p>Original version content</p>');
      expect(docData?.wordCount).toBe(50);
    });

    test('creates backup before restore', async () => {
      const versionsBefore = await getVersions(testDocId);
      const countBefore = versionsBefore.length;

      await restoreVersion(testDocId, versionId, testUser.uid, testUser.displayName);

      const versionsAfter = await getVersions(testDocId);
      const countAfter = versionsAfter.length;

      // Should have created a backup version
      expect(countAfter).toBe(countBefore + 1);

      // Find the backup version
      const backupVersion = versionsAfter.find(v =>
        v.label === 'Pre-restore backup'
      );

      expect(backupVersion).toBeDefined();
      expect(backupVersion?.type).toBe('manual');
      expect(backupVersion?.content).toBe('<p>Changed content</p>');
    });

    test('throws error when restoring non-existent version', async () => {
      await expect(
        restoreVersion(testDocId, 'non-existent-id', testUser.uid, testUser.displayName)
      ).rejects.toThrow('Version not found');
    });

    test('throws error when document not found', async () => {
      await expect(
        restoreVersion('non-existent-doc', versionId, testUser.uid, testUser.displayName)
      ).rejects.toThrow('Document not found');
    });
  });

  describe('Version Comparison', () => {
    test('compares two versions', async () => {
      const options: CreateVersionOptions = { type: 'manual' };

      const version1Id = await createVersion(
        testDocId,
        '<p>Short content</p>',
        20,
        testUser.uid,
        testUser.displayName,
        options
      );

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const version2Id = await createVersion(
        testDocId,
        '<p>Much longer content with more words</p>',
        60,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version1 = await getVersion(testDocId, version1Id);
      const version2 = await getVersion(testDocId, version2Id);

      expect(version1).not.toBeNull();
      expect(version2).not.toBeNull();

      const wordCountDiff = version2!.wordCount - version1!.wordCount;
      const charCountDiff = version2!.content.length - version1!.content.length;
      const timeDiff = version2!.createdAt - version1!.createdAt;

      expect(wordCountDiff).toBe(40);
      expect(charCountDiff).toBeGreaterThan(0);
      expect(timeDiff).toBeGreaterThan(0);
    });
  });

  describe('Version Metadata', () => {
    let versionId: string;

    beforeEach(async () => {
      const options: CreateVersionOptions = {
        type: 'manual',
        label: 'Initial Draft',
        description: 'First complete draft',
      };

      versionId = await createVersion(
        testDocId,
        '<p>Content</p>',
        50,
        testUser.uid,
        testUser.displayName,
        options
      );
    });

    test('updates version label', async () => {
      await updateVersionLabel(testDocId, versionId, 'Final Draft');

      const version = await getVersion(testDocId, versionId);
      expect(version?.label).toBe('Final Draft');
    });

    test('updates version description', async () => {
      await updateVersionDescription(
        testDocId,
        versionId,
        'Revised based on feedback'
      );

      const version = await getVersion(testDocId, versionId);
      expect(version?.description).toBe('Revised based on feedback');
    });
  });

  describe('Version Statistics', () => {
    test('gets version statistics', async () => {
      // Create mix of manual and auto versions
      await createVersion(
        testDocId,
        '<p>V1</p>',
        10,
        testUser.uid,
        testUser.displayName,
        { type: 'manual', label: 'Draft 1' }
      );

      await createVersion(
        testDocId,
        '<p>V2</p>',
        20,
        testUser.uid,
        testUser.displayName,
        { type: 'auto' }
      );

      await createVersion(
        testDocId,
        '<p>V3</p>',
        30,
        testUser.uid,
        testUser.displayName,
        { type: 'manual', label: 'Draft 2' }
      );

      await createVersion(
        testDocId,
        '<p>V4</p>',
        40,
        testUser.uid,
        testUser.displayName,
        { type: 'auto' }
      );

      const stats = await getVersionStats(testDocId);

      expect(stats.totalVersions).toBe(4);
      expect(stats.manualVersions).toBe(2);
      expect(stats.autoVersions).toBe(2);
      expect(stats.latestVersion).toBeDefined();
      expect(stats.latestVersion?.wordCount).toBe(40);
    });

    test('returns zero stats for document with no versions', async () => {
      const stats = await getVersionStats('non-existent-doc');

      expect(stats.totalVersions).toBe(0);
      expect(stats.manualVersions).toBe(0);
      expect(stats.autoVersions).toBe(0);
      expect(stats.latestVersion).toBeUndefined();
    });
  });

  describe('Getting Versions', () => {
    test('gets all versions for document', async () => {
      const options: CreateVersionOptions = { type: 'auto' };

      await createVersion(testDocId, '<p>V1</p>', 10, testUser.uid, testUser.displayName, options);
      await createVersion(testDocId, '<p>V2</p>', 20, testUser.uid, testUser.displayName, options);
      await createVersion(testDocId, '<p>V3</p>', 30, testUser.uid, testUser.displayName, options);

      const versions = await getVersions(testDocId);
      expect(versions).toHaveLength(3);

      // Should be ordered by createdAt desc (newest first)
      expect(versions[0].wordCount).toBe(30);
      expect(versions[1].wordCount).toBe(20);
      expect(versions[2].wordCount).toBe(10);
    });

    test('gets specific version by ID', async () => {
      const options: CreateVersionOptions = {
        type: 'manual',
        label: 'Specific Version',
      };

      const versionId = await createVersion(
        testDocId,
        '<p>Specific content</p>',
        75,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version = await getVersion(testDocId, versionId);

      expect(version).not.toBeNull();
      expect(version?.id).toBe(versionId);
      expect(version?.label).toBe('Specific Version');
      expect(version?.content).toBe('<p>Specific content</p>');
    });

    test('returns null for non-existent version', async () => {
      const version = await getVersion(testDocId, 'non-existent-id');
      expect(version).toBeNull();
    });

    test('limits number of returned versions', async () => {
      const options: CreateVersionOptions = { type: 'auto' };

      // Create 20 versions
      for (let i = 0; i < 20; i++) {
        await createVersion(
          testDocId,
          `<p>V${i}</p>`,
          10,
          testUser.uid,
          testUser.displayName,
          options
        );
      }

      const versions = await getVersions(testDocId, 10);
      expect(versions).toHaveLength(10);
    });
  });

  describe('Deleting Versions', () => {
    test('deletes version', async () => {
      const options: CreateVersionOptions = { type: 'manual' };

      const versionId = await createVersion(
        testDocId,
        '<p>To delete</p>',
        25,
        testUser.uid,
        testUser.displayName,
        options
      );

      let versions = await getVersions(testDocId);
      expect(versions).toHaveLength(1);

      await deleteVersion(testDocId, versionId);

      versions = await getVersions(testDocId);
      expect(versions).toHaveLength(0);
    });

    test('can delete specific versions while keeping others', async () => {
      const options: CreateVersionOptions = { type: 'manual' };

      const version1Id = await createVersion(
        testDocId,
        '<p>V1</p>',
        10,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version2Id = await createVersion(
        testDocId,
        '<p>V2</p>',
        20,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version3Id = await createVersion(
        testDocId,
        '<p>V3</p>',
        30,
        testUser.uid,
        testUser.displayName,
        options
      );

      // Delete middle version
      await deleteVersion(testDocId, version2Id);

      const versions = await getVersions(testDocId);
      expect(versions).toHaveLength(2);

      const versionIds = versions.map(v => v.id);
      expect(versionIds).toContain(version1Id);
      expect(versionIds).not.toContain(version2Id);
      expect(versionIds).toContain(version3Id);
    });
  });

  describe('Error Handling', () => {
    test('handles creating version for non-existent document', async () => {
      const options: CreateVersionOptions = { type: 'auto' };

      await expect(
        createVersion(
          'non-existent-doc',
          '<p>Content</p>',
          10,
          testUser.uid,
          testUser.displayName,
          options
        )
      ).rejects.toThrow('Document not found');
    });

    test('handles empty content in version', async () => {
      const options: CreateVersionOptions = { type: 'manual' };

      const versionId = await createVersion(
        testDocId,
        '',
        0,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version = await getVersion(testDocId, versionId);
      expect(version?.content).toBe('');
      expect(version?.wordCount).toBe(0);
    });

    test('handles very large content', async () => {
      const largeContent = '<p>' + 'word '.repeat(10000) + '</p>';
      const options: CreateVersionOptions = { type: 'manual' };

      const versionId = await createVersion(
        testDocId,
        largeContent,
        10000,
        testUser.uid,
        testUser.displayName,
        options
      );

      const version = await getVersion(testDocId, versionId);
      expect(version?.content).toBe(largeContent);
      expect(version?.wordCount).toBe(10000);
    });
  });
});
