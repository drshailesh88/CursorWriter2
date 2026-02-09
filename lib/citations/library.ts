/**
 * Citation Library Operations
 *
 * Supabase-backed CRUD for managing user's reference library.
 * Supports folders, labels, search, and duplicate detection.
 */

'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Reference,
  LibraryFolder,
  LibraryLabel,
  LibrarySearchOptions,
  ReferenceAuthor,
  generateCiteKey,
} from './types';

type ReferenceRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  title_short: string | null;
  abstract: string | null;
  authors: ReferenceAuthor[] | null;
  editors: ReferenceAuthor[] | null;
  translators: ReferenceAuthor[] | null;
  issued: Reference['issued'] | null;
  accessed: Reference['accessed'] | null;
  submitted: Reference['submitted'] | null;
  identifiers: Reference['identifiers'] | null;
  venue: Reference['venue'] | null;
  publisher: Reference['publisher'] | null;
  conference: Reference['conference'] | null;
  thesis: Reference['thesis'] | null;
  patent: Reference['patent'] | null;
  keywords: string[] | null;
  subjects: string[] | null;
  language: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  supplementary_urls: string[] | null;
  citation_count: number | null;
  influential_citation_count: number | null;
  folders: string[] | null;
  labels: string[] | null;
  notes: string | null;
  favorite: boolean | null;
  read_status: Reference['readStatus'] | null;
  rating: number | null;
  source: string | null;
  cite_key: string | null;
  created_at: string;
  updated_at: string;
};

function mapReference(row: ReferenceRow): Reference {
  return {
    id: row.id,
    type: row.type as Reference['type'],
    title: row.title,
    titleShort: row.title_short || undefined,
    abstract: row.abstract || undefined,
    authors: row.authors || [],
    editors: row.editors || [],
    translators: row.translators || [],
    issued: row.issued || { year: new Date().getFullYear() },
    accessed: row.accessed || undefined,
    submitted: row.submitted || undefined,
    identifiers: row.identifiers || {},
    venue: row.venue || undefined,
    publisher: row.publisher || undefined,
    conference: row.conference || undefined,
    thesis: row.thesis || undefined,
    patent: row.patent || undefined,
    keywords: row.keywords || undefined,
    subjects: row.subjects || undefined,
    language: row.language || undefined,
    pdfUrl: row.pdf_url || undefined,
    pdfStoragePath: row.pdf_storage_path || undefined,
    supplementaryUrls: row.supplementary_urls || undefined,
    citationCount: row.citation_count || undefined,
    influentialCitationCount: row.influential_citation_count || undefined,
    folders: row.folders || undefined,
    labels: row.labels || undefined,
    notes: row.notes || undefined,
    favorite: row.favorite || undefined,
    readStatus: row.read_status || undefined,
    rating: row.rating ? (row.rating as Reference['rating']) : undefined,
    source: row.source || undefined,
    citeKey: row.cite_key || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function referenceToRow(reference: Reference, userId: string) {
  return {
    user_id: userId,
    type: reference.type,
    title: reference.title,
    title_short: reference.titleShort ?? null,
    abstract: reference.abstract ?? null,
    authors: reference.authors ?? [],
    editors: reference.editors ?? [],
    translators: reference.translators ?? [],
    issued: reference.issued ?? null,
    accessed: reference.accessed ?? null,
    submitted: reference.submitted ?? null,
    identifiers: reference.identifiers ?? null,
    venue: reference.venue ?? null,
    publisher: reference.publisher ?? null,
    conference: reference.conference ?? null,
    thesis: reference.thesis ?? null,
    patent: reference.patent ?? null,
    keywords: reference.keywords ?? null,
    subjects: reference.subjects ?? null,
    language: reference.language ?? null,
    pdf_url: reference.pdfUrl ?? null,
    pdf_storage_path: reference.pdfStoragePath ?? null,
    supplementary_urls: reference.supplementaryUrls ?? null,
    citation_count: reference.citationCount ?? null,
    influential_citation_count: reference.influentialCitationCount ?? null,
    folders: reference.folders ?? null,
    labels: reference.labels ?? null,
    notes: reference.notes ?? null,
    favorite: reference.favorite ?? false,
    read_status: reference.readStatus ?? null,
    rating: reference.rating ?? null,
    source: reference.source ?? null,
    cite_key: reference.citeKey ?? null,
  };
}

function referenceUpdatePayload(updates: Partial<Reference>) {
  const payload: Record<string, unknown> = {};

  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.titleShort !== undefined) payload.title_short = updates.titleShort;
  if (updates.abstract !== undefined) payload.abstract = updates.abstract;
  if (updates.authors !== undefined) payload.authors = updates.authors;
  if (updates.editors !== undefined) payload.editors = updates.editors;
  if (updates.translators !== undefined) payload.translators = updates.translators;
  if (updates.issued !== undefined) payload.issued = updates.issued;
  if (updates.accessed !== undefined) payload.accessed = updates.accessed;
  if (updates.submitted !== undefined) payload.submitted = updates.submitted;
  if (updates.identifiers !== undefined) payload.identifiers = updates.identifiers;
  if (updates.venue !== undefined) payload.venue = updates.venue;
  if (updates.publisher !== undefined) payload.publisher = updates.publisher;
  if (updates.conference !== undefined) payload.conference = updates.conference;
  if (updates.thesis !== undefined) payload.thesis = updates.thesis;
  if (updates.patent !== undefined) payload.patent = updates.patent;
  if (updates.keywords !== undefined) payload.keywords = updates.keywords;
  if (updates.subjects !== undefined) payload.subjects = updates.subjects;
  if (updates.language !== undefined) payload.language = updates.language;
  if (updates.pdfUrl !== undefined) payload.pdf_url = updates.pdfUrl;
  if (updates.pdfStoragePath !== undefined) payload.pdf_storage_path = updates.pdfStoragePath;
  if (updates.supplementaryUrls !== undefined) payload.supplementary_urls = updates.supplementaryUrls;
  if (updates.citationCount !== undefined) payload.citation_count = updates.citationCount;
  if (updates.influentialCitationCount !== undefined) {
    payload.influential_citation_count = updates.influentialCitationCount;
  }
  if (updates.folders !== undefined) payload.folders = updates.folders;
  if (updates.labels !== undefined) payload.labels = updates.labels;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.favorite !== undefined) payload.favorite = updates.favorite;
  if (updates.readStatus !== undefined) payload.read_status = updates.readStatus;
  if (updates.rating !== undefined) payload.rating = updates.rating;
  if (updates.source !== undefined) payload.source = updates.source;
  if (updates.citeKey !== undefined) payload.cite_key = updates.citeKey;

  return payload;
}

// ============================================
// REFERENCES
// ============================================

export async function addReference(
  userId: string,
  reference: Omit<Reference, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const supabase = getSupabaseBrowserClient();
    const citeKey = reference.citeKey || generateCiteKey(reference as Reference);
    const row = referenceToRow(
      { ...(reference as Reference), citeKey, createdAt: new Date(), updatedAt: new Date() },
      userId
    );

    const { data, error } = await supabase
      .from('reference_library')
      .insert(row)
      .select('id')
      .single();

    if (error || !data) {
      console.error('Error adding reference:', error);
      throw error;
    }

    return data.id as string;
  } catch (error) {
    console.error('Error adding reference:', error);
    throw error;
  }
}

export async function addReferences(
  userId: string,
  references: Omit<Reference, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<string[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const rows = references.map((ref) => {
      const citeKey = ref.citeKey || generateCiteKey(ref as Reference);
      return referenceToRow(
        { ...(ref as Reference), citeKey, createdAt: new Date(), updatedAt: new Date() },
        userId
      );
    });

    const { data, error } = await supabase
      .from('reference_library')
      .insert(rows)
      .select('id');

    if (error || !data) {
      console.error('Error adding references:', error);
      throw error;
    }

    return (data as Array<{ id: string }>).map((row) => row.id);
  } catch (error) {
    console.error('Error adding references:', error);
    throw error;
  }
}

export async function getReference(
  userId: string,
  referenceId: string
): Promise<Reference | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('reference_library')
      .select('*')
      .eq('id', referenceId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return mapReference(data as ReferenceRow);
  } catch (error) {
    console.error('Error getting reference:', error);
    return null;
  }
}

export async function updateReference(
  userId: string,
  referenceId: string,
  updates: Partial<Reference>
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const payload = referenceUpdatePayload(updates);
    const { error } = await supabase
      .from('reference_library')
      .update(payload)
      .eq('id', referenceId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating reference:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating reference:', error);
    throw error;
  }
}

export async function deleteReference(
  userId: string,
  referenceId: string
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('reference_library')
      .delete()
      .eq('id', referenceId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting reference:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting reference:', error);
    throw error;
  }
}

export async function deleteReferences(
  userId: string,
  referenceIds: string[]
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('reference_library')
      .delete()
      .in('id', referenceIds)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting references:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting references:', error);
    throw error;
  }
}

export async function getAllReferences(
  userId: string,
  sortBy: 'title' | 'author' | 'year' | 'added' | 'updated' = 'added',
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<Reference[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const sortFieldMap: Record<string, string> = {
      title: 'title',
      year: 'issued',
      added: 'created_at',
      updated: 'updated_at',
    };

    let query = supabase
      .from('reference_library')
      .select('*')
      .eq('user_id', userId);

    if (sortFieldMap[sortBy]) {
      query = query.order(sortFieldMap[sortBy], { ascending: sortOrder === 'asc' });
    }

    const { data, error } = await query;

    if (error || !data) {
      console.error('Error getting references:', error);
      return [];
    }

    const refs = (data as ReferenceRow[]).map(mapReference);

    if (sortBy === 'author') {
      const order = sortOrder === 'asc' ? 1 : -1;
      return refs.sort((a, b) => {
        const aName = a.authors?.[0]?.family || '';
        const bName = b.authors?.[0]?.family || '';
        return order * aName.localeCompare(bName);
      });
    }

    if (sortBy === 'year') {
      const order = sortOrder === 'asc' ? 1 : -1;
      return refs.sort((a, b) => order * ((a.issued?.year || 0) - (b.issued?.year || 0)));
    }

    return refs;
  } catch (error) {
    console.error('Error getting references:', error);
    return [];
  }
}

export async function searchReferences(
  userId: string,
  options: LibrarySearchOptions
): Promise<Reference[]> {
  try {
    const allRefs = await getAllReferences(userId, options.sortBy, options.sortOrder);
    let results = allRefs;

    if (options.query) {
      const queryLower = options.query.toLowerCase();
      const searchFields = options.fields || ['title', 'authors', 'abstract', 'keywords'];

      results = results.filter((ref) => {
        for (const field of searchFields) {
          if (field === 'title' && ref.title?.toLowerCase().includes(queryLower)) return true;
          if (field === 'authors') {
            const authorMatch = ref.authors?.some((a) =>
              `${a.given} ${a.family}`.toLowerCase().includes(queryLower)
            );
            if (authorMatch) return true;
          }
          if (field === 'abstract' && ref.abstract?.toLowerCase().includes(queryLower)) return true;
          if (field === 'keywords') {
            const keywordMatch = ref.keywords?.some((k) => k.toLowerCase().includes(queryLower));
            if (keywordMatch) return true;
          }
          if (field === 'notes' && ref.notes?.toLowerCase().includes(queryLower)) return true;
        }
        return false;
      });
    }

    if (options.types && options.types.length > 0) {
      results = results.filter((ref) => options.types!.includes(ref.type));
    }

    if (options.folders && options.folders.length > 0) {
      results = results.filter((ref) => ref.folders?.some((f) => options.folders!.includes(f)));
    }

    if (options.labels && options.labels.length > 0) {
      results = results.filter((ref) => ref.labels?.some((l) => options.labels!.includes(l)));
    }

    if (options.yearRange) {
      if (options.yearRange.start) {
        results = results.filter((ref) => ref.issued.year >= options.yearRange!.start!);
      }
      if (options.yearRange.end) {
        results = results.filter((ref) => ref.issued.year <= options.yearRange!.end!);
      }
    }

    if (options.readStatus) {
      results = results.filter((ref) => ref.readStatus === options.readStatus);
    }

    if (options.favorite !== undefined) {
      results = results.filter((ref) => ref.favorite === options.favorite);
    }

    const offset = options.offset || 0;
    const limitCount = options.limit || results.length;
    return results.slice(offset, offset + limitCount);
  } catch (error) {
    console.error('Error searching references:', error);
    return [];
  }
}

export async function findDuplicates(
  userId: string,
  reference: Partial<Reference>
): Promise<Reference[]> {
  try {
    const allRefs = await getAllReferences(userId);
    const duplicates: Reference[] = [];

    for (const existing of allRefs) {
      if (reference.identifiers?.doi && existing.identifiers?.doi) {
        if (reference.identifiers.doi.toLowerCase() === existing.identifiers.doi.toLowerCase()) {
          duplicates.push(existing);
          continue;
        }
      }

      if (reference.title && existing.title) {
        const normalizedNew = reference.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedExisting = existing.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Avoid false positives for short/noisy titles.
        if (normalizedNew.length >= 20 && normalizedExisting.length >= 20 && normalizedNew === normalizedExisting) {
          duplicates.push(existing);
        }
      }
    }

    return duplicates;
  } catch (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }
}

export async function getReferencesByFolder(
  userId: string,
  folderId: string
): Promise<Reference[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('reference_library')
      .select('*')
      .eq('user_id', userId)
      .contains('folders', [folderId]);

    if (error || !data) return [];
    return (data as ReferenceRow[]).map(mapReference);
  } catch (error) {
    console.error('Error getting references by folder:', error);
    return [];
  }
}

export async function getReferencesByLabel(
  userId: string,
  label: string
): Promise<Reference[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('reference_library')
      .select('*')
      .eq('user_id', userId)
      .contains('labels', [label]);

    if (error || !data) return [];
    return (data as ReferenceRow[]).map(mapReference);
  } catch (error) {
    console.error('Error getting references by label:', error);
    return [];
  }
}

// ============================================
// FOLDERS
// ============================================

export async function createFolder(
  userId: string,
  folder: Omit<LibraryFolder, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('reference_folders')
    .insert({
      user_id: userId,
      name: folder.name,
      description: folder.description || null,
      color: folder.color || null,
      icon: folder.icon || null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Error creating folder:', error);
    throw error;
  }

  return data.id as string;
}

export async function getFolders(userId: string): Promise<LibraryFolder[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('reference_folders')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error || !data) {
      console.error('Error getting folders:', error);
      return [];
    }

    return (data as Array<any>).map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || undefined,
      color: row.color || undefined,
      icon: row.icon || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  } catch (error) {
    console.error('Error getting folders:', error);
    return [];
  }
}

export async function updateFolder(
  userId: string,
  folderId: string,
  updates: Partial<LibraryFolder>
): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.color !== undefined) payload.color = updates.color;
    if (updates.icon !== undefined) payload.icon = updates.icon;

    const { error } = await supabase
      .from('reference_folders')
      .update(payload)
      .eq('id', folderId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating folder:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating folder:', error);
    throw error;
  }
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
  try {
    const refs = await getReferencesByFolder(userId, folderId);
    for (const ref of refs) {
      const updatedFolders = (ref.folders || []).filter((f) => f !== folderId);
      await updateReference(userId, ref.id, { folders: updatedFolders });
    }

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from('reference_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }
}

// ============================================
// LABELS
// ============================================

export async function createLabel(
  userId: string,
  label: Omit<LibraryLabel, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('reference_labels')
      .insert({
        user_id: userId,
        name: label.name,
        color: label.color || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Error creating label:', error);
      throw error;
    }

    return data.id as string;
  } catch (error) {
    console.error('Error creating label:', error);
    throw error;
  }
}

export async function getLabels(userId: string): Promise<LibraryLabel[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('reference_labels')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error || !data) {
      console.error('Error getting labels:', error);
      return [];
    }

    return (data as Array<any>).map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      color: row.color || undefined,
      createdAt: new Date(row.created_at),
    }));
  } catch (error) {
    console.error('Error getting labels:', error);
    return [];
  }
}

export async function deleteLabel(userId: string, labelName: string): Promise<void> {
  try {
    const refs = await getReferencesByLabel(userId, labelName);
    for (const ref of refs) {
      const updatedLabels = (ref.labels || []).filter((l) => l !== labelName);
      await updateReference(userId, ref.id, { labels: updatedLabels });
    }

    const labels = await getLabels(userId);
    const labelDoc = labels.find((l) => l.name === labelName);
    if (labelDoc) {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from('reference_labels')
        .delete()
        .eq('id', labelDoc.id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting label:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('Error deleting label:', error);
    throw error;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export async function addReferenceToFolder(
  userId: string,
  referenceId: string,
  folderId: string
): Promise<void> {
  const ref = await getReference(userId, referenceId);
  if (!ref) throw new Error('Reference not found');

  const folders = [...(ref.folders || [])];
  if (!folders.includes(folderId)) {
    folders.push(folderId);
    await updateReference(userId, referenceId, { folders });
  }
}

export async function removeReferenceFromFolder(
  userId: string,
  referenceId: string,
  folderId: string
): Promise<void> {
  const ref = await getReference(userId, referenceId);
  if (!ref) throw new Error('Reference not found');

  const folders = (ref.folders || []).filter((f) => f !== folderId);
  await updateReference(userId, referenceId, { folders });
}

export async function addLabelToReference(
  userId: string,
  referenceId: string,
  label: string
): Promise<void> {
  const ref = await getReference(userId, referenceId);
  if (!ref) throw new Error('Reference not found');

  const labels = [...(ref.labels || [])];
  if (!labels.includes(label)) {
    labels.push(label);
    await updateReference(userId, referenceId, { labels });
  }
}

export async function removeLabelFromReference(
  userId: string,
  referenceId: string,
  label: string
): Promise<void> {
  const ref = await getReference(userId, referenceId);
  if (!ref) throw new Error('Reference not found');

  const labels = (ref.labels || []).filter((l) => l !== label);
  await updateReference(userId, referenceId, { labels });
}

export async function toggleFavorite(
  userId: string,
  referenceId: string
): Promise<boolean> {
  const ref = await getReference(userId, referenceId);
  if (!ref) throw new Error('Reference not found');
  const newValue = !ref.favorite;
  await updateReference(userId, referenceId, { favorite: newValue });
  return newValue;
}

export async function updateReadStatus(
  userId: string,
  referenceId: string,
  status: Reference['readStatus']
): Promise<void> {
  await updateReference(userId, referenceId, { readStatus: status });
}

export async function getLibraryStats(userId: string): Promise<{
  totalReferences: number;
  totalFolders: number;
  totalLabels: number;
  totalFavorites: number;
  readStatusCounts: Record<string, number>;
  byType: Record<string, number>;
  byYear: Record<number, number>;
  favorites: number;
  unread: number;
}> {
  const refs = await getAllReferences(userId);
  const folders = await getFolders(userId);
  const labels = await getLabels(userId);

  const byType: Record<string, number> = {};
  const byYear: Record<number, number> = {};
  const readStatusCounts: Record<string, number> = {
    unread: 0,
    reading: 0,
    read: 0,
  };

  refs.forEach((ref) => {
    byType[ref.type] = (byType[ref.type] || 0) + 1;
    byYear[ref.issued.year] = (byYear[ref.issued.year] || 0) + 1;

    if (ref.readStatus) {
      readStatusCounts[ref.readStatus] = (readStatusCounts[ref.readStatus] || 0) + 1;
    }
  });

  const favorites = refs.filter((ref) => ref.favorite).length;
  const unread = readStatusCounts.unread || 0;

  return {
    totalReferences: refs.length,
    totalFolders: folders.length,
    totalLabels: labels.length,
    totalFavorites: favorites,
    readStatusCounts,
    byType,
    byYear,
    favorites,
    unread,
  };
}
