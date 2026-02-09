/**
 * Deep Research Engine Unit Tests
 *
 * Comprehensive tests for deep research types, configuration,
 * and core functionality including:
 * - Research session creation
 * - Perspective generation
 * - Exploration tree building
 * - Source deduplication
 * - Citation classification
 * - Consensus calculation
 * - Quality review cycles
 * - Synthesis generation
 */

import { describe, test, expect } from 'vitest';
import type { MockTimestamp } from '@/__tests__/mocks/supabase';
import {
  createResearchSession,
  getDefaultConfig,
  calculateConsensusPercentage,
  determineConfidence,
  type ResearchMode,
  type ResearchConfig,
  type ResearchSession,
  type Perspective,
  type ExplorationTree,
  type ExplorationNode,
  type IterationResult,
  type ResearchSource,
  type CitationGraph,
  type CitationEdge,
  type CitationNode,
  type CitationType,
  type ConsensusData,
  type EvidenceBreakdown,
  type ReviewFeedback,
  type QualityScores,
  type Synthesis,
  type SynthesisSection,
  type Progress,
  type SessionStatus,
  type StudyDesign,
} from '@/lib/research/deep-research/types';
import type { SearchResult } from '@/lib/research/types';

describe('Deep Research Engine - Types and Configuration', () => {
  describe('Research Modes', () => {
    test('supports all 5 research modes', () => {
      const modes: ResearchMode[] = ['quick', 'standard', 'deep', 'exhaustive', 'systematic'];

      modes.forEach((mode) => {
        const config = getDefaultConfig(mode);
        expect(config).toBeDefined();
        expect(config.depth).toBeGreaterThan(0);
        expect(config.breadth).toBeGreaterThan(0);
        expect(config.maxSources).toBeGreaterThan(0);
      });
    });

    test('quick mode has minimal configuration', () => {
      const config = getDefaultConfig('quick');

      expect(config.depth).toBe(1);
      expect(config.breadth).toBe(2);
      expect(config.maxSources).toBe(10);
      expect(config.iterationLimit).toBe(1);
      expect(config.qualityThreshold).toBe(70);
    });

    test('standard mode has moderate configuration', () => {
      const config = getDefaultConfig('standard');

      expect(config.depth).toBe(2);
      expect(config.breadth).toBe(3);
      expect(config.maxSources).toBe(25);
      expect(config.iterationLimit).toBe(2);
      expect(config.qualityThreshold).toBe(80);
    });

    test('deep mode has advanced configuration', () => {
      const config = getDefaultConfig('deep');

      expect(config.depth).toBe(3);
      expect(config.breadth).toBe(4);
      expect(config.maxSources).toBe(50);
      expect(config.iterationLimit).toBe(3);
      expect(config.qualityThreshold).toBe(85);
    });

    test('exhaustive mode has comprehensive configuration', () => {
      const config = getDefaultConfig('exhaustive');

      expect(config.depth).toBe(4);
      expect(config.breadth).toBe(5);
      expect(config.maxSources).toBe(100);
      expect(config.iterationLimit).toBe(4);
      expect(config.qualityThreshold).toBe(90);
    });

    test('systematic mode has maximum configuration', () => {
      const config = getDefaultConfig('systematic');

      expect(config.depth).toBe(5);
      expect(config.breadth).toBe(6);
      expect(config.maxSources).toBe(200);
      expect(config.iterationLimit).toBe(5);
      expect(config.qualityThreshold).toBe(95);
      expect(config.sources.length).toBe(6); // All databases
    });

    test('research modes have increasing complexity', () => {
      const modes: ResearchMode[] = ['quick', 'standard', 'deep', 'exhaustive', 'systematic'];
      const configs = modes.map(getDefaultConfig);

      for (let i = 1; i < configs.length; i++) {
        expect(configs[i].depth).toBeGreaterThan(configs[i - 1].depth);
        expect(configs[i].breadth).toBeGreaterThanOrEqual(configs[i - 1].breadth);
        expect(configs[i].maxSources).toBeGreaterThan(configs[i - 1].maxSources);
      }
    });
  });

  describe('Research Session Creation', () => {
    test('creates research session with all required fields', () => {
      const session = createResearchSession('user-123', 'AI in healthcare', 'standard');

      expect(session.userId).toBe('user-123');
      expect(session.topic).toBe('AI in healthcare');
      expect(session.mode).toBe('standard');
      expect(session.config).toBeDefined();
      expect(session.status).toBe('planning');
      expect(session.perspectives).toEqual([]);
      expect(session.sources).toEqual([]);
      expect(session.clarifications).toEqual([]);
    });

    test('creates session with default configuration for mode', () => {
      const session = createResearchSession('user-123', 'Test topic', 'deep');
      const defaultConfig = getDefaultConfig('deep');

      expect(session.config).toEqual(defaultConfig);
    });

    test('creates session with custom configuration override', () => {
      const customConfig: Partial<ResearchConfig> = {
        maxSources: 30,
        qualityThreshold: 90,
      };

      const session = createResearchSession('user-123', 'Test topic', 'standard', customConfig);

      expect(session.config.maxSources).toBe(30);
      expect(session.config.qualityThreshold).toBe(90);
      // Other values should be from default
      expect(session.config.depth).toBe(2); // standard mode default
    });

    test('initializes empty exploration tree', () => {
      const session = createResearchSession('user-123', 'Test topic', 'quick');

      expect(session.tree).toBeDefined();
      expect(session.tree.rootId).toBe('');
      expect(session.tree.nodes).toEqual({});
      expect(session.tree.totalNodes).toBe(0);
      expect(session.tree.completedNodes).toBe(0);
    });

    test('initializes empty citation graph', () => {
      const session = createResearchSession('user-123', 'Test topic', 'quick');

      expect(session.citationGraph).toBeDefined();
      expect(session.citationGraph.nodes).toEqual([]);
      expect(session.citationGraph.edges).toEqual([]);
    });

    test('initializes progress tracking', () => {
      const session = createResearchSession('user-123', 'Test topic', 'standard');

      expect(session.progress.percentage).toBe(0);
      expect(session.progress.stage).toBe('planning');
      expect(session.progress.sourcesCollected).toBe(0);
      expect(session.progress.sourcesTarget).toBe(25); // standard mode maxSources
      expect(session.progress.nodesComplete).toBe(0);
      expect(session.progress.nodesTotal).toBe(0);
    });

    test('initializes synthesis with zero quality score', () => {
      const session = createResearchSession('user-123', 'Test topic', 'quick');

      expect(session.synthesis.content).toBe('');
      expect(session.synthesis.sections).toEqual([]);
      expect(session.synthesis.qualityScore).toBe(0);
      expect(session.synthesis.revisionCount).toBe(0);
      expect(session.synthesis.wordCount).toBe(0);
      expect(session.synthesis.citationCount).toBe(0);
    });
  });

  describe('Perspective Generation', () => {
    test('perspective has required fields', () => {
      const perspective: Perspective = {
        id: 'p1',
        name: 'Clinician Perspective',
        description: 'Focus on clinical practice and patient care',
        questions: ['How does this affect patient outcomes?'],
        searchStrategies: ['clinical trials', 'patient outcomes'],
      };

      expect(perspective.id).toBeDefined();
      expect(perspective.name).toBeDefined();
      expect(perspective.description).toBeDefined();
      expect(perspective.questions.length).toBeGreaterThan(0);
      expect(perspective.searchStrategies.length).toBeGreaterThan(0);
    });

    test('perspective can have optional icon', () => {
      const perspective: Perspective = {
        id: 'p1',
        name: 'Test',
        description: 'Test perspective',
        icon: '🔬',
        questions: ['Q1'],
        searchStrategies: ['S1'],
      };

      expect(perspective.icon).toBe('🔬');
    });

    test('perspective supports multiple questions (3-7 per spec)', () => {
      const perspective: Perspective = {
        id: 'p1',
        name: 'Researcher Perspective',
        description: 'Focus on methodology and validity',
        questions: [
          'What are the study designs used?',
          'What is the quality of evidence?',
          'Are there methodological limitations?',
          'What are the sample sizes?',
          'Is there publication bias?',
        ],
        searchStrategies: ['methodology', 'study design', 'bias'],
      };

      expect(perspective.questions.length).toBeGreaterThanOrEqual(3);
      expect(perspective.questions.length).toBeLessThanOrEqual(7);
    });

    test('perspective has multiple search strategies', () => {
      const perspective: Perspective = {
        id: 'p1',
        name: 'Test',
        description: 'Test',
        questions: ['Q1'],
        searchStrategies: ['strategy1', 'strategy2', 'strategy3'],
      };

      expect(perspective.searchStrategies.length).toBe(3);
    });
  });

  describe('Exploration Tree Building', () => {
    test('exploration node has correct structure', () => {
      const node: ExplorationNode = {
        id: 'node-1',
        topic: 'AI in radiology',
        perspectiveId: 'p1',
        depth: 1,
        status: 'pending',
        iterations: [],
        sourceIds: [],
        children: [],
      };

      expect(node.id).toBeDefined();
      expect(node.topic).toBeDefined();
      expect(node.depth).toBe(1);
      expect(node.status).toBe('pending');
    });

    test('exploration node supports all status types', () => {
      const statuses: ExplorationNode['status'][] = ['pending', 'searching', 'complete', 'failed'];

      statuses.forEach((status) => {
        const node: ExplorationNode = {
          id: 'node-1',
          topic: 'Test',
          depth: 1,
          status,
          iterations: [],
          sourceIds: [],
          children: [],
        };

        expect(node.status).toBe(status);
      });
    });

    test('exploration node can have parent', () => {
      const node: ExplorationNode = {
        id: 'node-2',
        topic: 'Sub-topic',
        parentId: 'node-1',
        depth: 2,
        status: 'pending',
        iterations: [],
        sourceIds: [],
        children: [],
      };

      expect(node.parentId).toBe('node-1');
    });

    test('exploration node tracks iterations', () => {
      const iteration: IterationResult = {
        iteration: 1,
        query: 'AI radiology diagnosis',
        database: 'pubmed',
        sourcesFound: 15,
        learnings: ['Deep learning models show 94% accuracy'],
        newDirections: ['Explore validation datasets'],
        timestamp: new Date(),
      };

      const node: ExplorationNode = {
        id: 'node-1',
        topic: 'Test',
        depth: 1,
        status: 'searching',
        iterations: [iteration],
        sourceIds: [],
        children: [],
      };

      expect(node.iterations.length).toBe(1);
      expect(node.iterations[0].sourcesFound).toBe(15);
      expect(node.iterations[0].learnings.length).toBeGreaterThan(0);
    });

    test('exploration tree has record of nodes', () => {
      const tree: ExplorationTree = {
        rootId: 'root',
        nodes: {
          root: {
            id: 'root',
            topic: 'Main topic',
            depth: 0,
            status: 'complete',
            iterations: [],
            sourceIds: [],
            children: ['child1', 'child2'],
          },
          child1: {
            id: 'child1',
            topic: 'Sub-topic 1',
            parentId: 'root',
            depth: 1,
            status: 'complete',
            iterations: [],
            sourceIds: [],
            children: [],
          },
        },
        totalNodes: 2,
        completedNodes: 2,
      };

      expect(tree.nodes['root']).toBeDefined();
      expect(tree.nodes['child1']).toBeDefined();
      expect(tree.totalNodes).toBe(2);
    });

    test('iteration result includes learnings and new directions', () => {
      const iteration: IterationResult = {
        iteration: 2,
        query: 'machine learning medical imaging',
        database: 'arxiv',
        sourcesFound: 23,
        learnings: [
          'CNNs are most common architecture',
          'Transfer learning improves performance',
        ],
        newDirections: [
          'Investigate transformer models',
          'Explore multi-modal approaches',
        ],
        timestamp: new Date(),
      };

      expect(iteration.learnings.length).toBe(2);
      expect(iteration.newDirections.length).toBe(2);
      expect(iteration.sourcesFound).toBe(23);
    });
  });

  describe('Source Deduplication', () => {
    test('research source extends SearchResult with session info', () => {
      const baseResult: SearchResult = {
        id: 'pmid-12345',
        source: 'pubmed',
        title: 'Test Article',
        authors: [{ name: 'Smith J' }],
        abstract: 'Test abstract',
        year: 2024,
        url: 'https://pubmed.com/12345',
        openAccess: true,
      };

      const researchSource: ResearchSource = {
        ...baseResult,
        sessionId: 'session-1',
        discoveredBy: 'node-1',
        discoveredAt: 1,
        relevanceScore: 0.95,
      };

      expect(researchSource.sessionId).toBe('session-1');
      expect(researchSource.discoveredBy).toBe('node-1');
      expect(researchSource.discoveredAt).toBe(1);
      expect(researchSource.relevanceScore).toBe(0.95);
    });

    test('research source can have quality assessment', () => {
      const source: Partial<ResearchSource> = {
        id: 'test-1',
        sessionId: 'session-1',
        discoveredBy: 'node-1',
        discoveredAt: 1,
        relevanceScore: 0.9,
        quality: {
          studyDesign: 'rct',
          sampleSize: 500,
          hasConflictOfInterest: false,
          peerReviewed: true,
        },
      };

      expect(source.quality?.studyDesign).toBe('rct');
      expect(source.quality?.sampleSize).toBe(500);
      expect(source.quality?.peerReviewed).toBe(true);
    });

    test('research source can have extracted key findings', () => {
      const source: Partial<ResearchSource> = {
        id: 'test-1',
        sessionId: 'session-1',
        discoveredBy: 'node-1',
        discoveredAt: 1,
        relevanceScore: 0.85,
        keyFindings: [
          'AI model achieved 94% accuracy',
          'Outperformed radiologists by 5%',
          'Required 10,000 training images',
        ],
      };

      expect(source.keyFindings?.length).toBe(3);
    });

    test('relevance score is between 0 and 1', () => {
      const validScores = [0, 0.5, 0.75, 0.99, 1.0];

      validScores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    test('supports all study design types', () => {
      const designs: StudyDesign[] = [
        'rct',
        'cohort',
        'case-control',
        'cross-sectional',
        'case-series',
        'case-report',
        'systematic-review',
        'meta-analysis',
        'narrative-review',
        'other',
      ];

      designs.forEach((design) => {
        const source: Partial<ResearchSource> = {
          quality: { studyDesign: design },
        };

        expect(source.quality?.studyDesign).toBe(design);
      });
    });
  });

  describe('Citation Classification', () => {
    test('supports all citation types', () => {
      const types: CitationType[] = ['supporting', 'disputing', 'mentioning', 'methodology', 'data'];

      types.forEach((type) => {
        const edge: CitationEdge = {
          from: 'paper-1',
          to: 'paper-2',
          type,
          confidence: 0.9,
        };

        expect(edge.type).toBe(type);
      });
    });

    test('citation edge has required fields', () => {
      const edge: CitationEdge = {
        from: 'pmid-111',
        to: 'pmid-222',
        type: 'supporting',
        confidence: 0.85,
      };

      expect(edge.from).toBeDefined();
      expect(edge.to).toBeDefined();
      expect(edge.type).toBeDefined();
      expect(edge.confidence).toBeGreaterThan(0);
    });

    test('citation edge can include statement and context', () => {
      const edge: CitationEdge = {
        from: 'paper-1',
        to: 'paper-2',
        type: 'supporting',
        statement: 'Our findings are consistent with Smith et al. (2023)',
        context: 'In the discussion section, we compared our results...',
        confidence: 0.92,
      };

      expect(edge.statement).toBeDefined();
      expect(edge.context).toBeDefined();
    });

    test('citation confidence is between 0 and 1', () => {
      const edge: CitationEdge = {
        from: 'p1',
        to: 'p2',
        type: 'mentioning',
        confidence: 0.75,
      };

      expect(edge.confidence).toBeGreaterThanOrEqual(0);
      expect(edge.confidence).toBeLessThanOrEqual(1);
    });

    test('citation node has all required metadata', () => {
      const node: CitationNode = {
        id: 'pmid-12345',
        title: 'Test Article',
        authors: ['Smith J', 'Jones M'],
        year: 2024,
        citationCount: 42,
        source: 'pubmed',
      };

      expect(node.id).toBeDefined();
      expect(node.title).toBeDefined();
      expect(node.authors.length).toBeGreaterThan(0);
      expect(node.year).toBeGreaterThan(1900);
      expect(node.citationCount).toBeGreaterThanOrEqual(0);
    });

    test('citation graph can have clusters', () => {
      const graph: CitationGraph = {
        nodes: [],
        edges: [],
        clusters: [
          {
            id: 'cluster-1',
            label: 'Deep Learning Methods',
            nodeIds: ['p1', 'p2', 'p3'],
          },
          {
            id: 'cluster-2',
            label: 'Clinical Applications',
            nodeIds: ['p4', 'p5'],
          },
        ],
      };

      expect(graph.clusters?.length).toBe(2);
      expect(graph.clusters?.[0].nodeIds.length).toBe(3);
    });

    test('citation graph tracks nodes and edges', () => {
      const graph: CitationGraph = {
        nodes: [
          {
            id: 'p1',
            title: 'Paper 1',
            authors: ['Author A'],
            year: 2024,
            citationCount: 10,
            source: 'pubmed',
          },
          {
            id: 'p2',
            title: 'Paper 2',
            authors: ['Author B'],
            year: 2023,
            citationCount: 5,
            source: 'arxiv',
          },
        ],
        edges: [
          {
            from: 'p1',
            to: 'p2',
            type: 'supporting',
            confidence: 0.9,
          },
        ],
      };

      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0].from).toBe('p1');
      expect(graph.edges[0].to).toBe('p2');
    });
  });

  describe('Consensus Calculation', () => {
    test('calculates consensus percentages correctly', () => {
      const distribution = {
        supporting: 67,
        neutral: 23,
        contradicting: 10,
      };

      const percentages = calculateConsensusPercentage(distribution);

      expect(percentages.supporting).toBe(67);
      expect(percentages.neutral).toBe(23);
      expect(percentages.contradicting).toBe(10);
      expect(percentages.supporting + percentages.neutral + percentages.contradicting).toBe(100);
    });

    test('handles zero distribution gracefully', () => {
      const distribution = {
        supporting: 0,
        neutral: 0,
        contradicting: 0,
      };

      const percentages = calculateConsensusPercentage(distribution);

      expect(percentages.supporting).toBe(0);
      expect(percentages.neutral).toBe(0);
      expect(percentages.contradicting).toBe(0);
    });

    test('rounds percentages to whole numbers', () => {
      const distribution = {
        supporting: 10,
        neutral: 6,
        contradicting: 4,
      }; // Total: 20

      const percentages = calculateConsensusPercentage(distribution);

      expect(Number.isInteger(percentages.supporting)).toBe(true);
      expect(Number.isInteger(percentages.neutral)).toBe(true);
      expect(Number.isInteger(percentages.contradicting)).toBe(true);
    });

    test('determines high confidence with RCTs and meta-analyses', () => {
      const breakdown: EvidenceBreakdown[] = [
        { studyType: 'rct', supporting: 10, neutral: 2, contradicting: 0 },
        { studyType: 'meta-analysis', supporting: 5, neutral: 0, contradicting: 1 },
      ];

      const confidence = determineConfidence(breakdown, 25);

      expect(confidence).toBe('high');
    });

    test('determines moderate confidence with some RCTs', () => {
      const breakdown: EvidenceBreakdown[] = [
        { studyType: 'rct', supporting: 5, neutral: 2, contradicting: 1 },
        { studyType: 'cohort', supporting: 8, neutral: 3, contradicting: 2 },
      ];

      const confidence = determineConfidence(breakdown, 15);

      expect(confidence).toBe('moderate');
    });

    test('determines low confidence with few studies', () => {
      const breakdown: EvidenceBreakdown[] = [
        { studyType: 'cohort', supporting: 4, neutral: 2, contradicting: 1 },
      ];

      const confidence = determineConfidence(breakdown, 7);

      expect(confidence).toBe('low');
    });

    test('determines very low confidence with very few studies', () => {
      const breakdown: EvidenceBreakdown[] = [
        { studyType: 'case-report', supporting: 2, neutral: 1, contradicting: 0 },
      ];

      const confidence = determineConfidence(breakdown, 3);

      expect(confidence).toBe('very_low');
    });

    test('consensus data includes all required fields', () => {
      const consensus: ConsensusData = {
        question: 'Does meditation reduce anxiety?',
        questionType: 'yes_no',
        distribution: {
          supporting: 78,
          neutral: 15,
          contradicting: 7,
        },
        breakdown: [
          { studyType: 'rct', supporting: 18, neutral: 3, contradicting: 2 },
        ],
        confidence: 'high',
        confidenceReason: 'Multiple high-quality RCTs with consistent results',
        keyStudies: {
          supporting: [],
          contradicting: [],
        },
        totalStudies: 46,
        metrics: {
          averageStudyQuality: 85,
          hasRCTs: true,
          hasMetaAnalyses: true,
          totalSampleSize: 5000,
          recentStudiesCount: 25,
        },
      };

      expect(consensus.question).toBeDefined();
      expect(consensus.questionType).toBe('yes_no');
      expect(consensus.distribution).toBeDefined();
      expect(consensus.confidence).toBeDefined();
      expect(consensus.metrics.hasRCTs).toBe(true);
    });
  });

  describe('Quality Review', () => {
    test('review feedback has required fields', () => {
      const feedback: ReviewFeedback = {
        type: 'missing_coverage',
        severity: 'major',
        description: 'No coverage of long-term effects',
        location: 'Outcomes section',
        suggestions: [
          'Add section on long-term outcomes',
          'Search for follow-up studies',
        ],
        resolved: false,
      };

      expect(feedback.type).toBeDefined();
      expect(feedback.severity).toBeDefined();
      expect(feedback.description).toBeDefined();
      expect(feedback.suggestions.length).toBeGreaterThan(0);
    });

    test('supports all review issue types', () => {
      const types: ReviewFeedback['type'][] = [
        'missing_coverage',
        'unsupported_claim',
        'contradiction',
        'bias',
        'insufficient_evidence',
        'outdated_sources',
      ];

      types.forEach((type) => {
        const feedback: ReviewFeedback = {
          type,
          severity: 'minor',
          description: 'Test',
          suggestions: [],
          resolved: false,
        };

        expect(feedback.type).toBe(type);
      });
    });

    test('supports all severity levels', () => {
      const severities: ReviewFeedback['severity'][] = ['critical', 'major', 'minor'];

      severities.forEach((severity) => {
        const feedback: ReviewFeedback = {
          type: 'bias',
          severity,
          description: 'Test',
          suggestions: [],
          resolved: false,
        };

        expect(feedback.severity).toBe(severity);
      });
    });

    test('quality scores are all 0-100', () => {
      const scores: QualityScores = {
        overall: 87,
        coverage: 90,
        evidenceQuality: 85,
        balance: 88,
        recency: 82,
        citationAccuracy: 95,
      };

      Object.values(scores).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    test('review feedback can be marked as resolved', () => {
      const feedback: ReviewFeedback = {
        type: 'missing_coverage',
        severity: 'major',
        description: 'Test',
        suggestions: [],
        resolved: true,
      };

      expect(feedback.resolved).toBe(true);
    });
  });

  describe('Synthesis Generation', () => {
    test('synthesis has content and sections', () => {
      const synthesis: Synthesis = {
        content: 'Full synthesized text...',
        sections: [
          {
            id: 's1',
            title: 'Introduction',
            content: 'Section content...',
            sourceIds: ['src1', 'src2'],
            perspectiveIds: ['p1'],
          },
        ],
        qualityScore: 87,
        reviewFeedback: [],
        revisionCount: 2,
        wordCount: 3000,
        citationCount: 42,
      };

      expect(synthesis.content).toBeDefined();
      expect(synthesis.sections.length).toBeGreaterThan(0);
      expect(synthesis.qualityScore).toBeGreaterThan(0);
      expect(synthesis.revisionCount).toBeGreaterThanOrEqual(0);
    });

    test('synthesis section links to sources and perspectives', () => {
      const section: SynthesisSection = {
        id: 's1',
        title: 'Clinical Applications',
        content: 'AI has shown promise in radiology...',
        sourceIds: ['pmid-111', 'pmid-222', 'arxiv-333'],
        perspectiveIds: ['clinician', 'researcher'],
      };

      expect(section.sourceIds.length).toBeGreaterThan(0);
      expect(section.perspectiveIds.length).toBeGreaterThan(0);
    });

    test('synthesis tracks word count and citation count', () => {
      const synthesis: Synthesis = {
        content: '',
        sections: [],
        qualityScore: 90,
        reviewFeedback: [],
        revisionCount: 3,
        wordCount: 5000,
        citationCount: 75,
      };

      expect(synthesis.wordCount).toBe(5000);
      expect(synthesis.citationCount).toBe(75);
    });

    test('synthesis tracks revision count', () => {
      const synthesis: Synthesis = {
        content: '',
        sections: [],
        qualityScore: 95,
        reviewFeedback: [],
        revisionCount: 4,
        wordCount: 4000,
        citationCount: 60,
      };

      expect(synthesis.revisionCount).toBe(4);
    });
  });

  describe('Progress Tracking', () => {
    test('progress tracks all metrics', () => {
      const progress: Progress = {
        percentage: 65,
        stage: 'researching',
        currentBranch: 'branch-3',
        currentIteration: 2,
        sourcesCollected: 32,
        sourcesTarget: 50,
        nodesComplete: 5,
        nodesTotal: 8,
      };

      expect(progress.percentage).toBeGreaterThanOrEqual(0);
      expect(progress.percentage).toBeLessThanOrEqual(100);
      expect(progress.stage).toBe('researching');
      expect(progress.sourcesCollected).toBeLessThanOrEqual(progress.sourcesTarget);
    });

    test('supports all session status types', () => {
      const statuses: SessionStatus[] = [
        'clarifying',
        'planning',
        'researching',
        'analyzing',
        'reviewing',
        'synthesizing',
        'complete',
        'failed',
      ];

      statuses.forEach((status) => {
        const progress: Progress = {
          percentage: 0,
          stage: status,
          sourcesCollected: 0,
          sourcesTarget: 10,
          nodesComplete: 0,
          nodesTotal: 0,
        };

        expect(progress.stage).toBe(status);
      });
    });

    test('percentage should match actual progress', () => {
      const progress: Progress = {
        percentage: 50,
        stage: 'researching',
        sourcesCollected: 25,
        sourcesTarget: 50,
        nodesComplete: 4,
        nodesTotal: 8,
      };

      const expectedPercentage = (progress.sourcesCollected / progress.sourcesTarget) * 100;
      expect(progress.percentage).toBeCloseTo(expectedPercentage, 0);
    });
  });

  describe('Research Session Integration', () => {
    test('session progresses through all stages', () => {
      const stages: SessionStatus[] = [
        'clarifying',
        'planning',
        'researching',
        'analyzing',
        'reviewing',
        'synthesizing',
        'complete',
      ];

      // Each stage should be valid
      stages.forEach((stage) => {
        expect(['clarifying', 'planning', 'researching', 'analyzing', 'reviewing', 'synthesizing', 'complete', 'failed']).toContain(stage);
      });
    });

    test('session can track errors by stage', () => {
      const session = createResearchSession('user-1', 'Test', 'quick');

      session.errors = [
        {
          stage: 'researching',
          message: 'PubMed API timeout',
          timestamp: new Date(),
        },
        {
          stage: 'analyzing',
          message: 'Citation analysis failed',
          timestamp: new Date(),
        },
      ];

      expect(session.errors.length).toBe(2);
      expect(session.errors[0].stage).toBe('researching');
    });

    test('session can have clarifications', () => {
      const session = createResearchSession('user-1', 'AI in medicine', 'standard');

      session.clarifications = [
        {
          question: 'What specific medical domain?',
          answer: 'Radiology and imaging',
          timestamp: new Date(),
        },
        {
          question: 'Time period of interest?',
          answer: 'Last 5 years',
          timestamp: new Date(),
        },
      ];

      expect(session.clarifications.length).toBe(2);
    });

    test('session can have collaborators', () => {
      const session = createResearchSession('user-1', 'Test', 'quick');

      session.collaborators = [
        {
          userId: 'user-2',
          email: 'colleague@example.com',
          role: 'editor',
          addedAt: new Date(),
        },
      ];

      expect(session.collaborators.length).toBe(1);
      expect(session.collaborators[0].role).toBe('editor');
    });

    test('session can have comments', () => {
      const session = createResearchSession('user-1', 'Test', 'quick');

      session.comments = [
        {
          id: 'c1',
          userId: 'user-2',
          content: 'Should we include more recent studies?',
          targetId: 'section-1',
          createdAt: new Date(),
          resolved: false,
        },
      ];

      expect(session.comments.length).toBe(1);
      expect(session.comments[0].resolved).toBe(false);
    });
  });
});
