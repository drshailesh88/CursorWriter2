// Deep Research - Agent Tests
// Tests for all 9 agents in the multi-agent system

import { describe, it, expect, beforeEach } from 'vitest';
import { MockTimestamp } from '@/__tests__/mocks/supabase';

// Import all agents
import { BaseAgent, agentRegistry } from '../../lib/deep-research/agents/base-agent';
import { OrchestratorAgent } from '../../lib/deep-research/agents/orchestrator-agent';
import { ClarifierAgent } from '../../lib/deep-research/agents/clarifier-agent';
import { PerspectiveAnalystAgent } from '../../lib/deep-research/agents/perspective-analyst-agent';
import { SearchStrategistAgent } from '../../lib/deep-research/agents/search-strategist-agent';
import { ResearcherAgent } from '../../lib/deep-research/agents/researcher-agent';
import { CitationAnalystAgent } from '../../lib/deep-research/agents/citation-analyst-agent';
import { SynthesizerAgent } from '../../lib/deep-research/agents/synthesizer-agent';
import { QualityReviewerAgent } from '../../lib/deep-research/agents/quality-reviewer-agent';
import { WriterAgent } from '../../lib/deep-research/agents/writer-agent';

// Import types
import type {
  ResearchSession,
  ResearchSource,
  SynthesisSection,
  Perspective,
  Author,
} from '../../lib/deep-research/types';
import type { AgentContext } from '../../lib/deep-research/agents/base-agent';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockSession = (topic: string = 'Effects of caffeine on cognitive performance'): ResearchSession => ({
  id: 'test-session-123',
  userId: 'test-user',
  topic,
  mode: 'standard',
  config: {
    depth: 2,
    breadth: 4,
    maxSources: 25,
    sources: ['pubmed', 'semantic_scholar'],
    dateRange: { start: new Date('2020-01-01'), end: new Date() },
    articleTypes: ['research_article', 'review'],
    languages: ['en'],
  },
  clarifications: [],
  perspectives: [],
  tree: {
    root: {
      id: 'root',
      query: topic,
      parentId: null,
      depth: 0,
      searchResults: [],
      selectedSources: [],
      findings: [],
      gaps: [],
      followUpQueries: [],
      children: [],
      status: 'pending',
    },
    totalNodes: 1,
    maxDepthReached: 0,
  },
  sources: [],
  citationGraph: { nodes: [], edges: [], clusters: [] },
  synthesis: {
    content: '',
    wordCount: 0,
    sections: [],
    qualityScore: 0,
    reviewFeedback: [],
    revisionCount: 0,
    generatedAt: MockTimestamp.mockNow().toDate(),
  },
  status: 'clarifying',
  progress: 0,
  collaborators: [],
  comments: [],
  createdAt: MockTimestamp.mockNow().toDate(),
  updatedAt: MockTimestamp.mockNow().toDate(),
});

const createMockSource = (id: string, title: string, year: number): ResearchSource => ({
  id,
  paperId: `paper-${id}`,
  title,
  authors: [
    { name: 'John Smith', firstName: 'John', lastName: 'Smith' },
    { name: 'Jane Doe', firstName: 'Jane', lastName: 'Doe' },
  ],
  year,
  journal: 'Journal of Research',
  abstract: 'This study demonstrates the effects of treatment on outcomes. Results confirm the hypothesis with statistical significance.',
  database: 'pubmed',
  openAccess: true,
  extractedContent: {
    keyFindings: ['Finding 1', 'Finding 2'],
    methodology: 'Randomized controlled trial',
    limitations: ['Small sample size'],
    conclusions: 'Treatment is effective',
    dataPoints: [
      { type: 'statistic', label: 'Effect size', value: '0.75', unit: 'd', context: 'Cohen\'s d' },
    ],
  },
  citationType: 'supporting',
  citationContext: '',
  citationCount: 50,
  influenceScore: 0.8,
  processedAt: MockTimestamp.mockNow().toDate(),
});

const createMockContext = (session: ResearchSession): AgentContext => ({
  session,
  sharedMemory: new Map(),
  previousAgentOutputs: new Map(),
});

// ============================================================================
// Agent Registry Tests
// ============================================================================

describe('Agent Registry', () => {
  it('registers all 9 agents', () => {
    // Agents are registered via decorators when imported
    expect(agentRegistry.size).toBeGreaterThanOrEqual(9);
  });

  it('can retrieve orchestrator from registry', () => {
    const OrchestratorClass = agentRegistry.get('orchestrator');
    expect(OrchestratorClass).toBeDefined();
  });

  it('can retrieve clarifier from registry', () => {
    const ClarifierClass = agentRegistry.get('clarifier');
    expect(ClarifierClass).toBeDefined();
  });

  it('can retrieve all agent types', () => {
    const agentTypes = [
      'orchestrator',
      'clarifier',
      'perspective_analyst',
      'search_strategist',
      'researcher',
      'citation_analyst',
      'synthesizer',
      'quality_reviewer',
      'writer',
    ];

    for (const type of agentTypes) {
      const AgentClass = agentRegistry.get(type as any);
      expect(AgentClass).toBeDefined();
    }
  });
});

// ============================================================================
// Orchestrator Agent Tests
// ============================================================================

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;
  let session: ResearchSession;

  beforeEach(() => {
    orchestrator = new OrchestratorAgent('test-session');
    session = createMockSession();
  });

  it('initializes with correct type', () => {
    expect(orchestrator.getType()).toBe('orchestrator');
  });

  it('starts in idle state', () => {
    const state = orchestrator.getState();
    expect(state.status).toBe('idle');
    expect(state.progress).toBe(0);
  });

  it('defines correct workflow stages', () => {
    const workflow = orchestrator.getWorkflow();
    expect(workflow).toHaveLength(8);
    expect(workflow[0].agentType).toBe('clarifier');
    expect(workflow[workflow.length - 1].agentType).toBe('writer');
  });

  it('executes and returns result', async () => {
    const context = createMockContext(session);
    const result = await orchestrator.execute(context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Clarifier Agent Tests
// ============================================================================

describe('ClarifierAgent', () => {
  let clarifier: ClarifierAgent;
  let session: ResearchSession;

  beforeEach(() => {
    clarifier = new ClarifierAgent('test-session');
    session = createMockSession();
  });

  it('initializes with correct type', () => {
    expect(clarifier.getType()).toBe('clarifier');
  });

  it('executes and generates questions', async () => {
    const context = createMockContext(session);
    const result = await clarifier.execute(context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.questions).toBeDefined();
    expect(result.data?.questions.length).toBeGreaterThan(0);
  });

  it('analyzes topic for ambiguities', async () => {
    const context = createMockContext(session);
    const result = await clarifier.execute(context);

    expect(result.data?.analysis).toBeDefined();
    expect(result.data?.analysis.originalTopic).toBe(session.topic);
  });

  it('estimates topic breadth', async () => {
    const context = createMockContext(session);
    const result = await clarifier.execute(context);

    const validBreadths = ['narrow', 'moderate', 'broad', 'very_broad'];
    expect(validBreadths).toContain(result.data?.analysis.estimatedBreadth);
  });

  it('processes clarification answers', () => {
    clarifier.processClarifications([
      { questionId: 'clarify-1', answer: 'Test answer' },
    ]);

    const clarifications = clarifier.getClarifications();
    expect(clarifications.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Perspective Analyst Agent Tests
// ============================================================================

describe('PerspectiveAnalystAgent', () => {
  let analyst: PerspectiveAnalystAgent;
  let session: ResearchSession;

  beforeEach(() => {
    analyst = new PerspectiveAnalystAgent('test-session');
    session = createMockSession();
  });

  it('initializes with correct type', () => {
    expect(analyst.getType()).toBe('perspective_analyst');
  });

  it('executes and generates perspectives', async () => {
    const context = createMockContext(session);
    const result = await analyst.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.perspectives).toBeDefined();
    expect(result.data?.perspectives.length).toBeGreaterThanOrEqual(3);
  });

  it('generates questions for each perspective', async () => {
    const context = createMockContext(session);
    const result = await analyst.execute(context);

    for (const perspective of result.data?.perspectives || []) {
      expect(perspective.questions).toBeDefined();
      expect(perspective.questions.length).toBeGreaterThan(0);
    }
  });

  it('includes domain expert perspective', async () => {
    const context = createMockContext(session);
    const result = await analyst.execute(context);

    const domainExpert = result.data?.perspectives.find(p =>
      p.name.toLowerCase().includes('expert') || p.role.toLowerCase().includes('specialist')
    );
    expect(domainExpert).toBeDefined();
  });
});

// ============================================================================
// Search Strategist Agent Tests
// ============================================================================

describe('SearchStrategistAgent', () => {
  let strategist: SearchStrategistAgent;
  let session: ResearchSession;

  beforeEach(() => {
    strategist = new SearchStrategistAgent('test-session');
    session = createMockSession();
  });

  it('initializes with correct type', () => {
    expect(strategist.getType()).toBe('search_strategist');
  });

  it('executes and generates search strategy', async () => {
    const context = createMockContext(session);
    const result = await strategist.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.strategy).toBeDefined();
  });

  it('extracts concepts from topic', async () => {
    const context = createMockContext(session);
    const result = await strategist.execute(context);

    expect(result.data?.concepts).toBeDefined();
    expect(result.data?.concepts.length).toBeGreaterThan(0);
  });

  it('generates queries for each database', async () => {
    const context = createMockContext(session);
    const result = await strategist.execute(context);

    expect(result.data?.strategy.queries).toBeDefined();
    expect(result.data?.strategy.queries.length).toBeGreaterThan(0);
  });

  it('optimizes search order', async () => {
    const context = createMockContext(session);
    const result = await strategist.execute(context);

    expect(result.data?.strategy.searchOrder).toBeDefined();
  });
});

// ============================================================================
// Researcher Agent Tests
// ============================================================================

describe('ResearcherAgent', () => {
  let researcher: ResearcherAgent;
  let session: ResearchSession;

  beforeEach(() => {
    researcher = new ResearcherAgent('test-session', true); // Use mock mode
    session = createMockSession();
  });

  it('initializes with correct type', () => {
    expect(researcher.getType()).toBe('researcher');
  });

  it('executes and returns search results', async () => {
    const context = createMockContext(session);

    // Add search strategy to context
    context.previousAgentOutputs.set('search_strategist', {
      strategy: {
        queries: [
          { database: 'pubmed', query: 'caffeine cognitive performance' },
        ],
      },
    });

    const result = await researcher.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.searchResults).toBeDefined();
  });

  it('evaluates papers with scoring', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('search_strategist', {
      strategy: {
        queries: [{ database: 'pubmed', query: 'test' }],
      },
    });

    const result = await researcher.execute(context);

    expect(result.data?.evaluations).toBeDefined();
  });
});

// ============================================================================
// Citation Analyst Agent Tests
// ============================================================================

describe('CitationAnalystAgent', () => {
  let analyst: CitationAnalystAgent;
  let session: ResearchSession;

  beforeEach(() => {
    analyst = new CitationAnalystAgent('test-session');
    session = createMockSession();
    session.sources = [
      createMockSource('1', 'Study on caffeine effects', 2023),
      createMockSource('2', 'Meta-analysis of stimulants', 2022),
      createMockSource('3', 'Cognitive enhancement methods', 2021),
    ];
  });

  it('initializes with correct type', () => {
    expect(analyst.getType()).toBe('citation_analyst');
  });

  it('executes and classifies citations', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await analyst.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.classifications).toBeDefined();
    expect(result.data?.classifications.length).toBe(3);
  });

  it('builds citation graph', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await analyst.execute(context);

    expect(result.data?.graph).toBeDefined();
    expect(result.data?.graph.nodes.length).toBe(3);
  });

  it('identifies key papers', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await analyst.execute(context);

    expect(result.data?.keyPapers).toBeDefined();
  });

  it('analyzes consensus for questions', async () => {
    session.topic = 'Does caffeine improve cognitive performance?';
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await analyst.execute(context);

    expect(result.data?.consensus).toBeDefined();
  });
});

// ============================================================================
// Synthesizer Agent Tests
// ============================================================================

describe('SynthesizerAgent', () => {
  let synthesizer: SynthesizerAgent;
  let session: ResearchSession;

  beforeEach(() => {
    synthesizer = new SynthesizerAgent('test-session');
    session = createMockSession();
    session.sources = [
      createMockSource('1', 'Treatment efficacy study', 2023),
      createMockSource('2', 'Safety analysis review', 2022),
      createMockSource('3', 'Mechanism of action research', 2021),
    ];
  });

  it('initializes with correct type', () => {
    expect(synthesizer.getType()).toBe('synthesizer');
  });

  it('executes and extracts themes', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await synthesizer.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.themes).toBeDefined();
  });

  it('creates synthesis sections', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await synthesizer.execute(context);

    expect(result.data?.sections).toBeDefined();
    expect(result.data?.sections.length).toBeGreaterThan(0);
  });

  it('identifies key findings', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await synthesizer.execute(context);

    expect(result.data?.keyFindings).toBeDefined();
    expect(result.data?.keyFindings.length).toBeGreaterThan(0);
  });

  it('identifies research gaps', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });

    const result = await synthesizer.execute(context);

    expect(result.data?.gaps).toBeDefined();
  });
});

// ============================================================================
// Quality Reviewer Agent Tests
// ============================================================================

describe('QualityReviewerAgent', () => {
  let reviewer: QualityReviewerAgent;
  let session: ResearchSession;
  let mockSections: SynthesisSection[];

  beforeEach(() => {
    reviewer = new QualityReviewerAgent('test-session');
    session = createMockSession();
    session.sources = [
      createMockSource('1', 'Study 1', 2023),
      createMockSource('2', 'Study 2', 2022),
    ];
    mockSections = [
      {
        id: 'section-1',
        title: 'Introduction',
        content: 'This synthesis examines the research topic in detail.',
        evidence: [],
        sourceIds: ['1', '2'],
        order: 0,
      },
      {
        id: 'section-2',
        title: 'Findings',
        content: 'Studies confirm the hypothesis (Smith et al., 2023).',
        evidence: [
          { id: 'e1', claim: 'Effect is significant', sourceIds: ['1'], type: 'finding', strength: 0.8 },
        ],
        sourceIds: ['1'],
        order: 1,
      },
    ];
  });

  it('initializes with correct type', () => {
    expect(reviewer.getType()).toBe('quality_reviewer');
  });

  it('executes and provides quality score', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
    });

    const result = await reviewer.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.overallScore).toBeDefined();
    expect(result.data?.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.data?.overallScore).toBeLessThanOrEqual(100);
  });

  it('provides dimension scores', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
    });

    const result = await reviewer.execute(context);

    expect(result.data?.scores).toBeDefined();
    expect(result.data?.scores.length).toBeGreaterThan(0);

    const dimensions = result.data?.scores.map(s => s.dimension);
    expect(dimensions).toContain('Accuracy');
    expect(dimensions).toContain('Completeness');
  });

  it('identifies quality issues', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
    });

    const result = await reviewer.execute(context);

    expect(result.data?.issues).toBeDefined();
  });

  it('provides recommendations', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
    });

    const result = await reviewer.execute(context);

    expect(result.data?.recommendations).toBeDefined();
    expect(result.data?.recommendations.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Writer Agent Tests
// ============================================================================

describe('WriterAgent', () => {
  let writer: WriterAgent;
  let session: ResearchSession;
  let mockSections: SynthesisSection[];

  beforeEach(() => {
    writer = new WriterAgent('test-session');
    session = createMockSession();
    session.sources = [
      createMockSource('1', 'Caffeine and memory enhancement', 2023),
      createMockSource('2', 'Stimulant effects on attention', 2022),
    ];
    mockSections = [
      {
        id: 'section-1',
        title: 'Introduction',
        content: 'Research on caffeine effects continues to grow.',
        evidence: [],
        sourceIds: ['1', '2'],
        order: 0,
      },
      {
        id: 'section-2',
        title: 'Efficacy',
        content: 'Multiple studies show positive effects.',
        evidence: [
          { id: 'e1', claim: 'Caffeine improves alertness', sourceIds: ['1'], type: 'finding', strength: 0.8 },
        ],
        sourceIds: ['1'],
        order: 1,
      },
      {
        id: 'section-3',
        title: 'Conclusions',
        content: 'Evidence supports moderate caffeine use.',
        evidence: [],
        sourceIds: ['1', '2'],
        order: 2,
      },
    ];
  });

  it('initializes with correct type', () => {
    expect(writer.getType()).toBe('writer');
  });

  it('executes and generates report', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
      keyFindings: ['Finding 1', 'Finding 2'],
      gaps: ['Gap 1'],
    });

    const result = await writer.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.report).toBeDefined();
  });

  it('includes all report sections', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
      keyFindings: ['Finding 1'],
      gaps: ['Gap 1'],
    });

    const result = await writer.execute(context);

    const sectionTitles = result.data?.report.sections.map(s => s.title);
    expect(sectionTitles).toContain('Executive Summary');
    expect(sectionTitles).toContain('Introduction');
    expect(sectionTitles).toContain('Methodology');
    expect(sectionTitles).toContain('Conclusions');
  });

  it('generates references', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
      keyFindings: ['Finding 1'],
      gaps: [],
    });

    const result = await writer.execute(context);

    expect(result.data?.report.references).toBeDefined();
    expect(result.data?.report.references.length).toBe(2);
  });

  it('calculates word count and reading time', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
      keyFindings: ['Finding 1'],
      gaps: [],
    });

    const result = await writer.execute(context);

    expect(result.data?.wordCount).toBeGreaterThan(0);
    expect(result.data?.readingTime).toBeGreaterThan(0);
  });

  it('exports as markdown', async () => {
    const context = createMockContext(session);
    context.previousAgentOutputs.set('researcher', {
      selectedSources: session.sources,
    });
    context.previousAgentOutputs.set('synthesizer', {
      sections: mockSections,
      keyFindings: ['Finding 1'],
      gaps: [],
    });

    await writer.execute(context);
    const markdown = writer.exportAsMarkdown();

    expect(markdown).toContain('# Research Synthesis');
    expect(markdown).toContain('## References');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Agent Integration', () => {
  it('all agents can be instantiated', () => {
    const sessionId = 'test-session';

    const agents = [
      new OrchestratorAgent(sessionId),
      new ClarifierAgent(sessionId),
      new PerspectiveAnalystAgent(sessionId),
      new SearchStrategistAgent(sessionId),
      new ResearcherAgent(sessionId),
      new CitationAnalystAgent(sessionId),
      new SynthesizerAgent(sessionId),
      new QualityReviewerAgent(sessionId),
      new WriterAgent(sessionId),
    ];

    expect(agents).toHaveLength(9);
    agents.forEach(agent => {
      expect(agent).toBeInstanceOf(BaseAgent);
    });
  });

  it('all agents track messages correctly', async () => {
    const session = createMockSession();
    const context = createMockContext(session);
    session.sources = [
      createMockSource('1', 'Test study', 2023),
    ];

    const clarifier = new ClarifierAgent('test-session');
    const result = await clarifier.execute(context);

    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages.some(m => m.role === 'system')).toBe(true);
    expect(result.messages.some(m => m.role === 'user')).toBe(true);
    expect(result.messages.some(m => m.role === 'assistant')).toBe(true);
  });

  it('agents update status during execution', async () => {
    const session = createMockSession();
    const context = createMockContext(session);
    session.sources = [
      createMockSource('1', 'Test study', 2023),
    ];

    const clarifier = new ClarifierAgent('test-session');
    const initialState = clarifier.getState();
    expect(initialState.status).toBe('idle');

    await clarifier.execute(context);

    const finalState = clarifier.getState();
    expect(finalState.status).toBe('complete');
    expect(finalState.progress).toBe(100);
  });
});
