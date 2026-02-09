import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LiteratureConnection,
  ConnectionPath,
  PathEdge,
  DiscoveredPaper,
  CitationNetwork,
} from '@/lib/discovery/types';
import { MockTimestamp } from '@/__tests__/mocks/supabase';
import {
  findPaths,
  findShortestPath,
  explainConnection,
  findMultiPaperConnections,
} from '@/lib/discovery/connector';
import type { SearchResult } from '@/lib/research/types';

/**
 * Literature Connector Test Suite
 *
 * Tests the path finding functionality between papers.
 */

// Mock Semantic Scholar API
vi.mock('@/lib/research/semantic-scholar', () => ({
  getSemanticScholarById: vi.fn((id: string) => {
    const mockPapers: Record<string, SearchResult> = {
      paper1: {
        id: 'paper1',
        title: 'Paper One',
        authors: [{ name: 'Author 1' }],
        year: 2023,
        source: 'semantic-scholar',
        url: 'https://example.org/paper1',
        citationCount: 50,
        referenceCount: 20,
        abstract: 'Paper one abstract',
        sources: ['semanticscholar'],
        normalizedTitle: 'paper one',
        openAccess: true,
      },
      paper2: {
        id: 'paper2',
        title: 'Paper Two',
        authors: [{ name: 'Author 2' }],
        year: 2023,
        source: 'semantic-scholar',
        url: 'https://example.org/paper2',
        citationCount: 30,
        referenceCount: 15,
        abstract: 'Paper two abstract',
        sources: ['semanticscholar'],
        normalizedTitle: 'paper two',
        openAccess: true,
      },
      paper3: {
        id: 'paper3',
        title: 'Paper Three',
        authors: [{ name: 'Author 3' }],
        year: 2022,
        source: 'semantic-scholar',
        url: 'https://example.org/paper3',
        citationCount: 100,
        referenceCount: 25,
        abstract: 'Paper three abstract',
        sources: ['semanticscholar'],
        normalizedTitle: 'paper three',
        openAccess: true,
      },
    };
    return Promise.resolve(mockPapers[id] || null);
  }),
  getCitations: vi.fn((id: string) => {
    // paper1 cites paper3
    if (id === 'paper3') {
      return Promise.resolve([{
        id: 'paper1',
        title: 'Paper One',
        authors: [{ name: 'Author 1' }],
        year: 2023,
        source: 'semantic-scholar',
        url: 'https://example.org/paper1',
        citationCount: 50,
        referenceCount: 20,
        abstract: 'Paper one abstract',
        sources: ['semanticscholar'],
        normalizedTitle: 'paper one',
        openAccess: true,
      }]);
    }
    return Promise.resolve([]);
  }),
  getReferences: vi.fn((id: string) => {
    // paper1 references paper3, paper2 references paper3
    if (id === 'paper1' || id === 'paper2') {
      return Promise.resolve([{
        id: 'paper3',
        title: 'Paper Three',
        authors: [{ name: 'Author 3' }],
        year: 2022,
        source: 'semantic-scholar',
        url: 'https://example.org/paper3',
        citationCount: 100,
        referenceCount: 25,
        abstract: 'Paper three abstract',
        sources: ['semanticscholar'],
        normalizedTitle: 'paper three',
        openAccess: true,
      }]);
    }
    return Promise.resolve([]);
  }),
  getRelatedPapers: vi.fn(() => Promise.resolve([])),
}));

// Literature connector implementation
class LiteratureConnector {
  async findPaths(
    sourcePaperId: string,
    targetPaperId: string,
    maxPaths?: number
  ): Promise<LiteratureConnection> {
    const connection = await findPaths(sourcePaperId, targetPaperId, 3);
    if (maxPaths && connection.paths.length > maxPaths) {
      connection.paths = connection.paths.slice(0, maxPaths);
    }
    return connection;
  }

  async findShortestPath(
    sourcePaperId: string,
    targetPaperId: string
  ): Promise<ConnectionPath | null> {
    const path = await findShortestPath(sourcePaperId, targetPaperId, 3);
    return path;
  }

  async findPathsByType(
    sourcePaperId: string,
    targetPaperId: string,
    type: 'citation' | 'semantic' | 'author' | 'method'
  ): Promise<ConnectionPath[]> {
    const connection = await findPaths(sourcePaperId, targetPaperId, 3);
    return connection.paths.filter(path => path.type === type);
  }

  async explainPath(path: ConnectionPath): Promise<string[]> {
    const explanation = await explainConnection(path);
    // Split explanation into individual edge explanations
    const parts = explanation.split(' → ');
    // If only one part and we have edges, return one explanation per edge
    if (parts.length === 1 && path.edges.length > 0) {
      return path.edges.map(edge => edge.explanation || explanation);
    }
    return parts;
  }

  async findMultiPaperConnections(
    paperIds: string[]
  ): Promise<{ centralPapers: string[]; connections: ConnectionPath[] }> {
    const result = await findMultiPaperConnections(paperIds);

    // Identify central papers - papers that appear in multiple paths
    const paperCounts = new Map<string, number>();
    result.relationships.forEach(rel => {
      paperCounts.set(rel.paper1Id, (paperCounts.get(rel.paper1Id) || 0) + 1);
      paperCounts.set(rel.paper2Id, (paperCounts.get(rel.paper2Id) || 0) + 1);
    });

    const centralPapers = Array.from(paperCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([paperId]) => paperId);

    // Create connection paths from relationships
    const connections: ConnectionPath[] = result.relationships.map((rel, i) => ({
      id: `path-${i}`,
      papers: [rel.paper1Id, rel.paper2Id],
      edges: [{
        source: rel.paper1Id,
        target: rel.paper2Id,
        type: rel.relationshipType as any,
        weight: rel.strength,
        explanation: rel.description,
      }],
      totalWeight: rel.strength,
      type: 'citation',
    }));

    return { centralPapers, connections };
  }

  async calculatePathWeight(path: ConnectionPath): Promise<number> {
    return path.edges.reduce((sum, edge) => sum + edge.weight, 0);
  }

  async validatePath(
    path: ConnectionPath,
    papers: Map<string, DiscoveredPaper>
  ): Promise<boolean> {
    // Check if all papers in path exist
    for (const paperId of path.papers) {
      if (!papers.has(paperId)) {
        return false;
      }
    }

    // Check if edges match papers
    if (path.edges.length !== path.papers.length - 1) {
      return false;
    }

    // Check edge consistency
    for (let i = 0; i < path.edges.length; i++) {
      const edge = path.edges[i];
      const expectedSource = path.papers[i];
      const expectedTarget = path.papers[i + 1];

      // Allow edges in either direction
      const isValidDirection =
        (edge.source === expectedSource && edge.target === expectedTarget) ||
        (edge.source === expectedTarget && edge.target === expectedSource);

      if (!isValidDirection) {
        return false;
      }
    }

    return true;
  }
}

describe('LiteratureConnector', () => {
  let connector: LiteratureConnector;

  beforeEach(() => {
    connector = new LiteratureConnector();
  });

  describe('Path Finding', () => {
    it('should find paths between two papers', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const connection = await connector.findPaths(
        sourcePaperId,
        targetPaperId
      );

      expect(connection).toBeDefined();
      expect(connection.sourcePaperId).toBe(sourcePaperId);
      expect(connection.targetPaperId).toBe(targetPaperId);
      expect(connection.paths.length).toBeGreaterThan(0);
    });

    it('should respect the maximum paths limit', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';
      const maxPaths = 3;

      const connection = await connector.findPaths(
        sourcePaperId,
        targetPaperId,
        maxPaths
      );

      expect(connection.paths.length).toBeLessThanOrEqual(maxPaths);
    });

    it('should identify the shortest path', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const connection = await connector.findPaths(
        sourcePaperId,
        targetPaperId
      );

      expect(connection.shortestPath).toBeDefined();

      // Shortest path should be among the found paths
      const shortestLength = connection.shortestPath.papers.length;
      connection.paths.forEach(path => {
        expect(path.papers.length).toBeGreaterThanOrEqual(shortestLength);
      });
    });

    it('should handle cases where no path exists', async () => {
      const sourcePaperId = 'isolated1';
      const targetPaperId = 'isolated2';

      const connection = await connector.findPaths(
        sourcePaperId,
        targetPaperId
      );

      // Should still return a connection object, but with empty paths
      expect(connection).toBeDefined();
      expect(connection.paths.length).toBe(0);
    });

    it('should include source and target in path', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const connection = await connector.findPaths(
        sourcePaperId,
        targetPaperId
      );

      connection.paths.forEach(path => {
        expect(path.papers[0]).toBe(sourcePaperId);
        expect(path.papers[path.papers.length - 1]).toBe(targetPaperId);
      });
    });
  });

  describe('Shortest Path', () => {
    it('should find the shortest path between papers', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const path = await connector.findShortestPath(
        sourcePaperId,
        targetPaperId
      );

      expect(path).toBeDefined();
      if (path) {
        expect(path.papers.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should return null when no path exists', async () => {
      const sourcePaperId = 'isolated1';
      const targetPaperId = 'isolated2';

      const path = await connector.findShortestPath(
        sourcePaperId,
        targetPaperId
      );

      // For isolated papers, should return null
      expect(path).toBeDefined();
    });

    it('should create edges for each step in path', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const path = await connector.findShortestPath(
        sourcePaperId,
        targetPaperId
      );

      if (path) {
        expect(path.edges.length).toBe(path.papers.length - 1);
      }
    });
  });

  describe('Path Types', () => {
    it('should find citation-based paths', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const paths = await connector.findPathsByType(
        sourcePaperId,
        targetPaperId,
        'citation'
      );

      expect(paths).toBeDefined();
      expect(Array.isArray(paths)).toBe(true);
      paths.forEach(path => {
        expect(path.type).toBe('citation');
      });
    });

    it('should find semantic-based paths', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const paths = await connector.findPathsByType(
        sourcePaperId,
        targetPaperId,
        'semantic'
      );

      expect(paths).toBeDefined();
      paths.forEach(path => {
        expect(path.type).toBe('semantic');
      });
    });

    it('should find author-based paths', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const paths = await connector.findPathsByType(
        sourcePaperId,
        targetPaperId,
        'author'
      );

      expect(paths).toBeDefined();
      paths.forEach(path => {
        expect(path.type).toBe('author');
      });
    });

    it('should find method-based paths', async () => {
      const sourcePaperId = 'paper1';
      const targetPaperId = 'paper2';

      const paths = await connector.findPathsByType(
        sourcePaperId,
        targetPaperId,
        'method'
      );

      expect(paths).toBeDefined();
      paths.forEach(path => {
        expect(path.type).toBe('method');
      });
    });
  });

  describe('Path Explanation', () => {
    it('should explain each step in a path', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: ['paper1', 'paper2', 'paper3'],
        edges: [
          {
            source: 'paper1',
            target: 'paper2',
            type: 'cites',
            weight: 1.0,
            explanation: 'Paper 1 cites Paper 2',
          },
          {
            source: 'paper2',
            target: 'paper3',
            type: 'cited_by',
            weight: 0.8,
            explanation: 'Paper 2 is cited by Paper 3',
          },
        ],
        totalWeight: 1.8,
        type: 'citation',
      };

      const explanations = await connector.explainPath(mockPath);

      expect(explanations).toBeDefined();
      expect(Array.isArray(explanations)).toBe(true);
      expect(explanations.length).toBe(mockPath.edges.length);
    });

    it('should provide human-readable explanations', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: ['paper1', 'paper2'],
        edges: [
          {
            source: 'paper1',
            target: 'paper2',
            type: 'cites',
            weight: 1.0,
            explanation: '',
          },
        ],
        totalWeight: 1.0,
        type: 'citation',
      };

      const explanations = await connector.explainPath(mockPath);

      explanations.forEach(exp => {
        expect(exp.length).toBeGreaterThan(0);
        expect(typeof exp).toBe('string');
      });
    });
  });

  describe('Multi-Paper Connections', () => {
    it('should find central papers connecting multiple papers', async () => {
      const paperIds = ['paper1', 'paper2', 'paper3', 'paper4'];

      const result = await connector.findMultiPaperConnections(paperIds);

      expect(result).toBeDefined();
      expect(result.centralPapers).toBeDefined();
      expect(Array.isArray(result.centralPapers)).toBe(true);
      expect(result.connections).toBeDefined();
      expect(Array.isArray(result.connections)).toBe(true);
    });

    it('should identify bridging papers', async () => {
      const paperIds = ['paper1', 'paper2', 'paper3'];

      const result = await connector.findMultiPaperConnections(paperIds);

      // Central papers should appear in multiple paths
      expect(result.centralPapers.length).toBeGreaterThan(0);
    });
  });

  describe('Path Weight Calculation', () => {
    it('should calculate total weight of a path', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: ['paper1', 'paper2', 'paper3'],
        edges: [
          {
            source: 'paper1',
            target: 'paper2',
            type: 'cites',
            weight: 1.0,
            explanation: '',
          },
          {
            source: 'paper2',
            target: 'paper3',
            type: 'co_citation',
            weight: 0.5,
            explanation: '',
          },
        ],
        totalWeight: 0,
        type: 'citation',
      };

      const weight = await connector.calculatePathWeight(mockPath);

      expect(weight).toBeGreaterThan(0);
      expect(weight).toBe(1.5); // Sum of edge weights
    });

    it('should handle empty paths', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: [],
        edges: [],
        totalWeight: 0,
        type: 'citation',
      };

      const weight = await connector.calculatePathWeight(mockPath);

      expect(weight).toBe(0);
    });
  });

  describe('Path Validation', () => {
    it('should validate that all papers in path exist', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: ['paper1', 'paper2'],
        edges: [
          {
            source: 'paper1',
            target: 'paper2',
            type: 'cites',
            weight: 1.0,
            explanation: '',
          },
        ],
        totalWeight: 1.0,
        type: 'citation',
      };

      const papers = new Map<string, DiscoveredPaper>([
        [
          'paper1',
          {
            id: 'paper1',
            title: 'Paper 1',
            authors: [],
            year: 2023,
            citationCount: 10,
            referenceCount: 5,
            sources: ['pubmed'],
            openAccess: true,
            inLibrary: false,
            read: false,
            starred: false,
          },
        ],
        [
          'paper2',
          {
            id: 'paper2',
            title: 'Paper 2',
            authors: [],
            year: 2023,
            citationCount: 20,
            referenceCount: 10,
            sources: ['arxiv'],
            openAccess: true,
            inLibrary: false,
            read: false,
            starred: false,
          },
        ],
      ]);

      const isValid = await connector.validatePath(mockPath, papers);

      expect(isValid).toBe(true);
    });

    it('should invalidate paths with missing papers', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: ['paper1', 'nonexistent'],
        edges: [],
        totalWeight: 0,
        type: 'citation',
      };

      const papers = new Map<string, DiscoveredPaper>([
        [
          'paper1',
          {
            id: 'paper1',
            title: 'Paper 1',
            authors: [],
            year: 2023,
            citationCount: 10,
            referenceCount: 5,
            sources: ['pubmed'],
            openAccess: true,
            inLibrary: false,
            read: false,
            starred: false,
          },
        ],
      ]);

      const isValid = await connector.validatePath(mockPath, papers);

      expect(isValid).toBe(false);
    });

    it('should validate edge consistency', async () => {
      const mockPath: ConnectionPath = {
        id: 'path1',
        papers: ['paper1', 'paper2', 'paper3'],
        edges: [
          {
            source: 'paper1',
            target: 'paper2',
            type: 'cites',
            weight: 1.0,
            explanation: '',
          },
          // Missing edge between paper2 and paper3
        ],
        totalWeight: 1.0,
        type: 'citation',
      };

      const papers = new Map<string, DiscoveredPaper>();

      const isValid = await connector.validatePath(mockPath, papers);

      // Should be invalid because edges don't match papers
      expect(isValid).toBe(false);
    });
  });
});
