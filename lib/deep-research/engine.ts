// Deep Research Engine
// Orchestrates the research workflow and manages sessions

import { EventEmitter } from 'events';
import { agentRegistry, type AgentContext, type AgentResult } from './agents/base-agent';
import { OrchestratorAgent } from './agents/orchestrator-agent';
import { saveSession, updateSessionStatus, appendSources, saveSynthesis } from './session-store';
import type {
  ResearchSession,
  ResearchMode,
  ResearchConfig,
  ResearchStatus,
  AgentType,
  AgentState,
  ResearchSource,
  SynthesisResult,
  Clarification,
  Perspective,
  RESEARCH_MODE_CONFIGS,
} from './types';

// Re-export mode configs
export { RESEARCH_MODE_CONFIGS } from './types';

/**
 * Events emitted by the research engine
 */
export type EngineEvent =
  | { type: 'status'; status: ResearchStatus; progress: number }
  | { type: 'agent_start'; agentType: AgentType; task: string }
  | { type: 'agent_progress'; agentType: AgentType; progress: number; message: string }
  | { type: 'agent_complete'; agentType: AgentType; data: unknown }
  | { type: 'agent_error'; agentType: AgentType; error: string; retrying: boolean }
  | { type: 'source_found'; source: ResearchSource }
  | { type: 'clarification_needed'; questions: ClarifyingQuestion[] }
  | { type: 'clarification_answered'; clarifications: Clarification[] }
  | { type: 'perspective_added'; perspective: Perspective }
  | { type: 'synthesis_ready'; synthesis: SynthesisResult }
  | { type: 'complete'; session: Partial<ResearchSession> }
  | { type: 'error'; error: string; recoverable: boolean };

export interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestedOptions?: string[];
  required: boolean;
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string;
}

/**
 * Session state managed by the engine
 */
interface EngineSession {
  id: string;
  userId: string;
  topic: string;
  mode: ResearchMode;
  config: ResearchConfig;
  status: ResearchStatus;
  progress: number;

  // Workflow state
  orchestrator: OrchestratorAgent;
  context: AgentContext;

  // Collected data
  clarifications: Clarification[];
  perspectives: Perspective[];
  sources: ResearchSource[];
  synthesis: SynthesisResult | null;

  // Control
  isPaused: boolean;
  isCancelled: boolean;
  isExecuting: boolean;
  awaitingClarification: boolean;
  pendingQuestions: ClarifyingQuestion[];
}

/**
 * Research Engine
 *
 * Coordinates the multi-agent research system, manages session state,
 * and emits events for real-time progress tracking.
 */
export class ResearchEngine extends EventEmitter {
  private sessions: Map<string, EngineSession> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new research session
   */
  async createSession(
    userId: string,
    topic: string,
    mode: ResearchMode,
    configOverrides?: Partial<ResearchConfig>,
    sessionIdOverride?: string
  ): Promise<string> {
    const sessionId = sessionIdOverride || this.generateSessionId();

    // Get default config for mode
    const { RESEARCH_MODE_CONFIGS } = await import('./types');
    const baseConfig = RESEARCH_MODE_CONFIGS[mode];
    const config: ResearchConfig = { ...baseConfig, ...configOverrides };
    const model = configOverrides?.model;

    // Create orchestrator
    const orchestrator = new OrchestratorAgent(sessionId);

    // Initialize context
    const context: AgentContext = {
      session: {
        id: sessionId,
        userId,
        topic,
        mode,
        config,
        model,
        clarifications: [],
        perspectives: [],
        tree: { root: null as any, totalNodes: 0, maxDepthReached: 0 },
        sources: [],
        citationGraph: { nodes: [], edges: [], clusters: [] },
        synthesis: null as any,
        status: 'clarifying',
        progress: 0,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
        collaborators: [],
        comments: [],
      },
      sharedMemory: new Map([['topic', topic]]),
      previousAgentOutputs: new Map(),
    };

    const session: EngineSession = {
      id: sessionId,
      userId,
      topic,
      mode,
      config,
      status: 'clarifying',
      progress: 0,
      orchestrator,
      context,
      clarifications: [],
      perspectives: [],
      sources: [],
      synthesis: null,
      isPaused: false,
      isCancelled: false,
      isExecuting: false,
      awaitingClarification: false,
      pendingQuestions: [],
    };

    this.sessions.set(sessionId, session);

    // Persist initial session to database
    saveSession({
      id: sessionId,
      userId,
      topic,
      mode,
      config,
      status: 'clarifying',
      progress: 0,
      clarifications: [],
      perspectives: [],
      sources: [],
    }).catch(err => console.error('Failed to persist initial session:', err));

    return sessionId;
  }

  /**
   * Start or resume research execution
   */
  async executeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.isCancelled) {
      throw new Error('Session has been cancelled');
    }

    if (session.awaitingClarification) {
      throw new Error('Session is awaiting clarification answers');
    }

    // Prevent duplicate execution from multiple SSE connections
    if (session.isExecuting) {
      return;
    }

    // Don't re-execute completed or errored sessions
    if (session.status === 'complete' || session.status === 'error') {
      return;
    }

    session.isExecuting = true;
    session.isPaused = false;

    try {
      await this.runWorkflow(session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('event', {
        type: 'error',
        error: errorMessage,
        recoverable: false,
      } as EngineEvent);
      session.status = 'error';
    } finally {
      session.isExecuting = false;
    }
  }

  /**
   * Run the research workflow
   */
  private async runWorkflow(session: EngineSession): Promise<void> {
    while (!session.isPaused && !session.isCancelled && session.status !== 'complete' && session.status !== 'error') {
      // Get next step from orchestrator
      const orchestratorResult = await session.orchestrator.execute(session.context);

      if (!orchestratorResult.success) {
        this.emitEvent(session.id, {
          type: 'error',
          error: orchestratorResult.error || 'Orchestrator failed',
          recoverable: false,
        });
        session.status = 'error';
        break;
      }

      const { nextAgent, sessionStatus } = orchestratorResult.data!;
      session.status = sessionStatus;
      session.progress = this.calculateProgress(session);

      this.emitEvent(session.id, {
        type: 'status',
        status: session.status,
        progress: session.progress,
      });

      // Persist status to database
      updateSessionStatus(session.id, session.status, session.progress).catch(err =>
        console.error('Failed to persist status:', err)
      );

      if (!nextAgent) {
        // Workflow complete
        session.status = 'complete';
        this.emitEvent(session.id, {
          type: 'complete',
          session: this.getSessionData(session),
        });

        // Save complete session to database
        saveSession(this.getSessionData(session)).catch(err =>
          console.error('Failed to persist completed session:', err)
        );
        break;
      }

      // Execute the next agent
      await this.executeAgent(session, nextAgent);

      // Check if we need to pause for clarification
      if (session.awaitingClarification) {
        break;
      }
    }
  }

  /**
   * Execute a specific agent
   */
  private async executeAgent(session: EngineSession, agentType: AgentType): Promise<void> {
    const AgentClass = agentRegistry.get(agentType);
    if (!AgentClass) {
      this.emitEvent(session.id, {
        type: 'agent_error',
        agentType,
        error: `Agent ${agentType} not found in registry`,
        retrying: false,
      });
      return;
    }

    const agent = new AgentClass(session.id);

    this.emitEvent(session.id, {
      type: 'agent_start',
      agentType,
      task: `Executing ${agentType}`,
    });

    try {
      const result = await agent.execute(session.context);

      if (result.success) {
        // Store output for next agents
        session.context.previousAgentOutputs.set(agentType, result.data);

        // Handle agent-specific outputs
        await this.handleAgentOutput(session, agentType, result);

        this.emitEvent(session.id, {
          type: 'agent_complete',
          agentType,
          data: result.data,
        });

        // Advance orchestrator
        session.orchestrator.advanceToNextStage();
      } else {
        const canRetry = session.orchestrator.handleStageFailure(agentType, result.error || 'Unknown error');

        this.emitEvent(session.id, {
          type: 'agent_error',
          agentType,
          error: result.error || 'Unknown error',
          retrying: canRetry,
        });

        if (!canRetry) {
          session.status = 'error';
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const canRetry = session.orchestrator.handleStageFailure(agentType, errorMessage);

      this.emitEvent(session.id, {
        type: 'agent_error',
        agentType,
        error: errorMessage,
        retrying: canRetry,
      });

      if (!canRetry) {
        session.status = 'error';
      }
    }
  }

  /**
   * Handle output from specific agents
   */
  private async handleAgentOutput(
    session: EngineSession,
    agentType: AgentType,
    result: AgentResult
  ): Promise<void> {
    switch (agentType) {
      case 'clarifier':
        // Check if clarification is needed
        if (result.data && typeof result.data === 'object' && 'needsClarification' in result.data) {
          const clarifierData = result.data as {
            needsClarification: boolean;
            questions?: ClarifyingQuestion[];
            clarifications?: Clarification[];
          };

          if (clarifierData.needsClarification && clarifierData.questions?.length) {
            session.awaitingClarification = true;
            session.pendingQuestions = clarifierData.questions;
            this.emitEvent(session.id, {
              type: 'clarification_needed',
              questions: clarifierData.questions,
            });
          } else if (clarifierData.clarifications) {
            session.clarifications = clarifierData.clarifications;
            session.context.sharedMemory.set('clarifications', clarifierData.clarifications);
          }
        }
        break;

      case 'perspective_analyst':
        if (result.data && Array.isArray((result.data as any).perspectives)) {
          const perspectives = (result.data as any).perspectives as Perspective[];
          session.perspectives = perspectives;
          session.context.sharedMemory.set('perspectives', perspectives);

          for (const perspective of perspectives) {
            this.emitEvent(session.id, {
              type: 'perspective_added',
              perspective,
            });
          }
        }
        break;

      case 'researcher':
        if (result.data && Array.isArray((result.data as any).sources)) {
          const sources = (result.data as any).sources as ResearchSource[];
          session.sources.push(...sources);
          session.context.sharedMemory.set('sources', session.sources);

          for (const source of sources) {
            this.emitEvent(session.id, {
              type: 'source_found',
              source,
            });
          }

          // Persist sources to database
          appendSources(session.id, sources).catch(err =>
            console.error('Failed to persist sources:', err)
          );
        }
        break;

      case 'synthesizer':
      case 'writer':
        if (result.data && typeof result.data === 'object' && 'synthesis' in result.data) {
          session.synthesis = (result.data as any).synthesis as SynthesisResult;
          this.emitEvent(session.id, {
            type: 'synthesis_ready',
            synthesis: session.synthesis,
          });

          // Persist synthesis to database
          saveSynthesis(session.id, session.synthesis).catch(err =>
            console.error('Failed to persist synthesis:', err)
          );
        }
        break;
    }
  }

  /**
   * Submit clarification answers
   */
  async submitClarifications(sessionId: string, answers: ClarificationAnswer[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.awaitingClarification) {
      throw new Error('Session is not awaiting clarification');
    }

    // Convert answers to clarifications
    const clarifications: Clarification[] = answers.map((answer, index) => ({
      id: `clarification-${Date.now()}-${index}`,
      question: session.pendingQuestions.find(q => q.id === answer.questionId)?.question || '',
      answer: answer.answer,
      answeredAt: new Date() as any,
    }));

    session.clarifications = clarifications;
    session.context.sharedMemory.set('clarifications', clarifications);
    session.context.sharedMemory.set('refinedTopic', `${session.topic} (${answers.map(a => a.answer).join(', ')})`);

    session.awaitingClarification = false;
    session.pendingQuestions = [];

    this.emitEvent(sessionId, {
      type: 'clarification_answered',
      clarifications,
    });

    // Resume workflow
    await this.executeSession(sessionId);
  }

  /**
   * Skip clarification (use defaults)
   */
  async skipClarification(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.awaitingClarification = false;
    session.pendingQuestions = [];
    session.context.sharedMemory.set('refinedTopic', session.topic);

    // Resume workflow
    await this.executeSession(sessionId);
  }

  /**
   * Cancel a research session
   */
  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isCancelled = true;
      session.status = 'error';
    }
  }

  /**
   * Pause a research session
   */
  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isPaused = true;
    }
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): Partial<ResearchSession> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return this.getSessionData(session);
  }

  /**
   * Get session data for external use
   */
  private getSessionData(session: EngineSession): Partial<ResearchSession> {
    return {
      id: session.id,
      userId: session.userId,
      topic: session.topic,
      mode: session.mode,
      config: session.config,
      status: session.status,
      progress: session.progress,
      clarifications: session.clarifications,
      perspectives: session.perspectives,
      sources: session.sources,
      synthesis: session.synthesis as any,
    };
  }

  /**
   * Calculate progress percentage
   */
  private calculateProgress(session: EngineSession): number {
    const plan = session.orchestrator.getPlan();
    if (!plan) return 0;

    const totalStages = plan.stages.length;
    const completedStages = plan.completedStages.length;
    return Math.round((completedStages / totalStages) * 100);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `research-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Emit event with session ID
   */
  private emitEvent(sessionId: string, event: EngineEvent): void {
    this.emit('event', { sessionId, ...event });
  }

  /**
   * Subscribe to session events
   */
  onSessionEvent(sessionId: string, callback: (event: EngineEvent) => void): () => void {
    const handler = (event: EngineEvent & { sessionId: string }) => {
      if (event.sessionId === sessionId) {
        callback(event);
      }
    };

    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

// Singleton instance
export const researchEngine = new ResearchEngine();
