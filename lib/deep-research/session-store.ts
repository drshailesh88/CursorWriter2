// Deep Research - Session Persistence Store
// Saves and loads research sessions from Supabase

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type {
  ResearchSession,
  ResearchMode,
  ResearchConfig,
  ResearchStatus,
  Clarification,
  Perspective,
  ResearchSource,
  SynthesisResult,
  CitationGraph,
  ConsensusData,
  QualityMetrics,
} from './types';

export interface SessionRecord {
  id: string;
  user_id: string;
  topic: string;
  mode: string;
  config: Record<string, unknown>;
  status: string;
  progress: number;
  clarifications: unknown[];
  perspectives: unknown[];
  sources: unknown[];
  citation_graph: Record<string, unknown>;
  synthesis: Record<string, unknown> | null;
  quality_metrics: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Save a research session to Supabase
 */
export async function saveSession(session: Partial<ResearchSession>): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const record: Partial<SessionRecord> = {
    id: session.id,
    user_id: session.userId,
    topic: session.topic,
    mode: session.mode,
    config: session.config as any,
    status: session.status,
    progress: session.progress,
    clarifications: (session.clarifications || []) as any,
    perspectives: (session.perspectives || []) as any,
    sources: (session.sources || []) as any,
    citation_graph: (session.citationGraph || { nodes: [], edges: [], clusters: [] }) as any,
    synthesis: session.synthesis as any || null,
    quality_metrics: null,
    error_message: session.status === 'error' ? 'Research failed' : null,
    updated_at: new Date().toISOString(),
  };

  if (session.status === 'complete') {
    record.completed_at = new Date().toISOString();
  }

  const { error } = await (supabase as any)
    .from('research_sessions')
    .upsert(record, { onConflict: 'id' });

  if (error) {
    console.error('Error saving research session:', error);
  }
}

/**
 * Load a research session from Supabase
 */
export async function loadSession(sessionId: string): Promise<Partial<ResearchSession> | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('research_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  const record = data as SessionRecord;
  return recordToSession(record);
}

/**
 * Load all sessions for a user
 */
export async function loadUserSessions(
  userId: string,
  limit: number = 20
): Promise<Partial<ResearchSession>[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('research_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as SessionRecord[]).map(recordToSession);
}

/**
 * Delete a research session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await (supabase as any)
    .from('research_sessions')
    .delete()
    .eq('id', sessionId);
}

/**
 * Update session status and progress
 */
export async function updateSessionStatus(
  sessionId: string,
  status: ResearchStatus,
  progress: number,
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const update: Record<string, unknown> = {
    status,
    progress,
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) {
    update.error_message = errorMessage;
  }

  if (status === 'complete') {
    update.completed_at = new Date().toISOString();
  }

  await (supabase as any)
    .from('research_sessions')
    .update(update)
    .eq('id', sessionId);
}

/**
 * Save sources incrementally (as they're found)
 */
export async function appendSources(
  sessionId: string,
  newSources: ResearchSource[]
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  // Get current sources
  const { data, error: fetchError } = await (supabase as any)
    .from('research_sessions')
    .select('sources')
    .eq('id', sessionId)
    .single();

  if (fetchError || !data) return;

  const existingSources = (data as any).sources || [];
  const allSources = [...existingSources, ...newSources];

  await (supabase as any)
    .from('research_sessions')
    .update({
      sources: allSources,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

/**
 * Save synthesis result
 */
export async function saveSynthesis(
  sessionId: string,
  synthesis: SynthesisResult
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  await (supabase as any)
    .from('research_sessions')
    .update({
      synthesis: synthesis as any,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

/**
 * Convert database record to ResearchSession
 */
function recordToSession(record: SessionRecord): Partial<ResearchSession> {
  return {
    id: record.id,
    userId: record.user_id,
    topic: record.topic,
    mode: record.mode as ResearchMode,
    config: record.config as any as ResearchConfig,
    status: record.status as ResearchStatus,
    progress: record.progress,
    clarifications: (record.clarifications || []) as Clarification[],
    perspectives: (record.perspectives || []) as Perspective[],
    sources: (record.sources || []) as ResearchSource[],
    citationGraph: (record.citation_graph || { nodes: [], edges: [], clusters: [] }) as unknown as CitationGraph,
    synthesis: record.synthesis as any as SynthesisResult,
    createdAt: new Date(record.created_at) as any,
    updatedAt: new Date(record.updated_at) as any,
    completedAt: record.completed_at ? new Date(record.completed_at) as any : undefined,
  };
}
