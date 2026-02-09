/**
 * Flowchart Renderer Tests
 * Tests for SVG flowchart rendering and layout algorithms
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import {
  Flowchart,
  generatePRISMAFlow,
  generateProcessFlow,
  PRISMAData,
} from '@/lib/presentations/visualizations/flowchart-renderer';
import { FlowchartConfig } from '@/lib/presentations/types';
import { getTheme } from '@/lib/presentations/themes';

// Mock theme for testing
const mockTheme = getTheme('academic');

describe('Flowchart Renderer', () => {
  describe('Basic Rendering', () => {
    it('should render flowchart SVG', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'start', type: 'terminal', label: 'Start' },
          { id: 'process', type: 'process', label: 'Process' },
          { id: 'end', type: 'terminal', label: 'End' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'process' },
          { id: 'e2', source: 'process', target: 'end' },
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.tagName).toBe('svg');
    });

    it('should render with custom dimensions', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'node1', type: 'process', label: 'Test' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} width={600} height={400} />
      );

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('600');
      expect(svg?.getAttribute('height')).toBe('400');
    });

    it('should apply theme background', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'node1', type: 'process', label: 'Test' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      const style = svg?.getAttribute('style');
      expect(style).toContain('background');
    });
  });

  describe('Node Rendering', () => {
    it('should render process nodes as rectangles', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'proc', type: 'process', label: 'Process Step' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const processNode = container.querySelector('.node-process');
      expect(processNode).toBeTruthy();

      const rect = processNode?.querySelector('rect');
      expect(rect).toBeTruthy();
    });

    it('should render decision nodes as diamonds', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'decision', type: 'decision', label: 'Decision?' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const decisionNode = container.querySelector('.node-decision');
      expect(decisionNode).toBeTruthy();

      const polygon = decisionNode?.querySelector('polygon');
      expect(polygon).toBeTruthy();
    });

    it('should render terminal nodes with rounded corners', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'start', type: 'terminal', label: 'Start' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const terminalNode = container.querySelector('.node-terminal');
      expect(terminalNode).toBeTruthy();

      const rect = terminalNode?.querySelector('rect');
      expect(rect?.getAttribute('rx')).toBeTruthy(); // Should have rounded corners
    });

    it('should render data nodes as parallelograms', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'data', type: 'data', label: 'Data Input' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const dataNode = container.querySelector('.node-data');
      expect(dataNode).toBeTruthy();

      const polygon = dataNode?.querySelector('polygon');
      expect(polygon).toBeTruthy();
    });

    it('should render connector nodes as circles', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'conn', type: 'connector', label: 'A' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const connectorNode = container.querySelector('.node-connector');
      expect(connectorNode).toBeTruthy();

      const circle = connectorNode?.querySelector('circle');
      expect(circle).toBeTruthy();
    });

    it('should display node labels', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'n1', type: 'process', label: 'First Step' },
          { id: 'n2', type: 'process', label: 'Second Step' },
        ],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('First Step');
      expect(text).toContain('Second Step');
    });

    it('should handle multi-line labels', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'n1', type: 'process', label: 'Line 1\nLine 2' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const tspans = container.querySelectorAll('tspan');
      expect(tspans.length).toBeGreaterThanOrEqual(2);
    });

    it('should display count metadata', () => {
      const config: FlowchartConfig = {
        nodes: [
          {
            id: 'n1',
            type: 'process',
            label: 'Participants',
            metadata: { count: 450 },
          },
        ],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('450');
    });
  });

  describe('Edge Rendering', () => {
    it('should render connecting arrows', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'process', label: 'A' },
          { id: 'b', type: 'process', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const edges = container.querySelectorAll('.edge');
      expect(edges.length).toBe(1);

      const paths = container.querySelectorAll('.edge path');
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it('should render edge labels', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'decision', label: 'Check?' },
          { id: 'b', type: 'process', label: 'Yes Path' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b', label: 'Yes' }],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('Yes');
    });

    it('should render arrow markers', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'process', label: 'A' },
          { id: 'b', type: 'process', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const markers = container.querySelectorAll('marker');
      expect(markers.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple edges from same node', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'decision', label: 'Decision' },
          { id: 'b', type: 'process', label: 'Path 1' },
          { id: 'c', type: 'process', label: 'Path 2' },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b', label: 'Yes' },
          { id: 'e2', source: 'a', target: 'c', label: 'No' },
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const edges = container.querySelectorAll('.edge');
      expect(edges.length).toBe(2);
    });

    it('should render curved edges when specified', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'process', label: 'A' },
          { id: 'b', type: 'process', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const paths = container.querySelectorAll('.edge path');
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Layout Algorithms', () => {
    it('should layout nodes top-to-bottom', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'top', type: 'terminal', label: 'Top' },
          { id: 'middle', type: 'process', label: 'Middle' },
          { id: 'bottom', type: 'terminal', label: 'Bottom' },
        ],
        edges: [
          { id: 'e1', source: 'top', target: 'middle' },
          { id: 'e2', source: 'middle', target: 'bottom' },
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should layout nodes left-to-right', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'left', type: 'terminal', label: 'Left' },
          { id: 'right', type: 'terminal', label: 'Right' },
        ],
        edges: [{ id: 'e1', source: 'left', target: 'right' }],
        layout: 'LR',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should handle disconnected nodes', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'process', label: 'Connected A' },
          { id: 'b', type: 'process', label: 'Connected B' },
          { id: 'orphan', type: 'process', label: 'Orphan' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const nodes = container.querySelectorAll('.nodes > g');
      expect(nodes.length).toBe(3); // All nodes should render
    });

    it('should handle circular references gracefully', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'process', label: 'A' },
          { id: 'b', type: 'process', label: 'B' },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' }, // Circular
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy(); // Should not crash
    });

    it('should calculate appropriate viewBox', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'a', type: 'process', label: 'A' },
          { id: 'b', type: 'process', label: 'B' },
          { id: 'c', type: 'process', label: 'C' },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      const viewBox = svg?.getAttribute('viewBox');
      expect(viewBox).toBeTruthy();
      expect(viewBox?.split(' ').length).toBe(4); // x y width height
    });
  });

  describe('PRISMA Flow Generator', () => {
    it('should generate PRISMA flow correctly', () => {
      const data: PRISMAData = {
        identified: 1000,
        duplicatesRemoved: 200,
        screened: 800,
        excludedScreening: 300,
        fullTextAssessed: 500,
        excludedFullText: 100,
        included: 400,
      };

      const config = generatePRISMAFlow(data);

      expect(config.nodes.length).toBeGreaterThan(5);
      expect(config.edges.length).toBeGreaterThan(5);
      expect(config.layout).toBe('TB');

      // Should have identification node
      const identifiedNode = config.nodes.find(n => n.id === 'identified');
      expect(identifiedNode).toBeTruthy();
      expect(identifiedNode?.metadata?.count).toBe(1000);

      // Should have included node
      const includedNode = config.nodes.find(n => n.id === 'included');
      expect(includedNode).toBeTruthy();
      expect(includedNode?.metadata?.count).toBe(400);
    });

    it('should handle PRISMA without duplicate removal', () => {
      const data: PRISMAData = {
        identified: 500,
        screened: 500,
        excludedScreening: 100,
        fullTextAssessed: 400,
        excludedFullText: 50,
        included: 350,
      };

      const config = generatePRISMAFlow(data);

      const duplicatesNode = config.nodes.find(n => n.id === 'duplicates');
      expect(duplicatesNode).toBeFalsy();
    });

    it('should render generated PRISMA flow', () => {
      const data: PRISMAData = {
        identified: 1000,
        screened: 800,
        excludedScreening: 300,
        fullTextAssessed: 500,
        excludedFullText: 100,
        included: 400,
      };

      const config = generatePRISMAFlow(data);

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      const text = container.textContent;
      expect(text).toContain('1000');
      expect(text).toContain('400');
    });

    it('should label exclusion edges', () => {
      const data: PRISMAData = {
        identified: 100,
        screened: 100,
        excludedScreening: 20,
        fullTextAssessed: 80,
        excludedFullText: 10,
        included: 70,
      };

      const config = generatePRISMAFlow(data);

      const excludedEdge = config.edges.find(e => e.label === 'Excluded');
      expect(excludedEdge).toBeTruthy();
    });
  });

  describe('Process Flow Generator', () => {
    it('should generate linear process flow', () => {
      const steps = [
        'Initial Assessment',
        'Data Collection',
        'Analysis',
        'Report Generation',
      ];

      const config = generateProcessFlow(steps);

      expect(config.nodes.length).toBe(4);
      expect(config.edges.length).toBe(3);
      expect(config.layout).toBe('TB');
    });

    it('should mark first and last steps as terminal', () => {
      const steps = ['Start', 'Middle', 'End'];
      const config = generateProcessFlow(steps);

      const startNode = config.nodes[0];
      const endNode = config.nodes[2];

      expect(startNode.type).toBe('terminal');
      expect(endNode.type).toBe('terminal');
    });

    it('should mark middle steps as process', () => {
      const steps = ['Start', 'Process 1', 'Process 2', 'End'];
      const config = generateProcessFlow(steps);

      const middleNodes = config.nodes.slice(1, -1);
      middleNodes.forEach(node => {
        expect(node.type).toBe('process');
      });
    });

    it('should connect steps sequentially', () => {
      const steps = ['A', 'B', 'C'];
      const config = generateProcessFlow(steps);

      expect(config.edges[0].source).toBe('step-0');
      expect(config.edges[0].target).toBe('step-1');
      expect(config.edges[1].source).toBe('step-1');
      expect(config.edges[1].target).toBe('step-2');
    });

    it('should render generated process flow', () => {
      const steps = ['Initialize', 'Execute', 'Finalize'];
      const config = generateProcessFlow(steps);

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      const text = container.textContent;
      expect(text).toContain('Initialize');
      expect(text).toContain('Execute');
      expect(text).toContain('Finalize');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty flowchart', () => {
      const config: FlowchartConfig = {
        nodes: [],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy(); // Should not crash
    });

    it('should handle single node', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'only', type: 'process', label: 'Only Node' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should handle edge referencing non-existent nodes', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'exists', type: 'process', label: 'Exists' }],
        edges: [{ id: 'bad', source: 'exists', target: 'missing' }],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy(); // Should handle gracefully
    });

    it('should handle very long labels', () => {
      const config: FlowchartConfig = {
        nodes: [
          {
            id: 'long',
            type: 'process',
            label: 'This is an extremely long label that should be handled appropriately without breaking the layout',
          },
        ],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Styling and Theming', () => {
    it('should apply custom colors from metadata', () => {
      const config: FlowchartConfig = {
        nodes: [
          {
            id: 'custom',
            type: 'process',
            label: 'Custom Color',
            metadata: { color: '#ff0000' },
          },
        ],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const processNode = container.querySelector('.node-process rect');
      expect(processNode?.getAttribute('stroke')).toBe('#ff0000');
    });

    it('should use theme fonts', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'n1', type: 'process', label: 'Test' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const text = container.querySelector('text');
      expect(text?.getAttribute('font-family')).toContain('Inter');
    });

    it('should apply border radius from theme', () => {
      const config: FlowchartConfig = {
        nodes: [{ id: 'n1', type: 'process', label: 'Test' }],
        edges: [],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const rect = container.querySelector('.node-process rect');
      expect(rect?.getAttribute('rx')).toBe('8'); // From theme
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle branching flow', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'start', type: 'terminal', label: 'Start' },
          { id: 'decision', type: 'decision', label: 'Check Condition' },
          { id: 'yes', type: 'process', label: 'Yes Branch' },
          { id: 'no', type: 'process', label: 'No Branch' },
          { id: 'merge', type: 'process', label: 'Merge Point' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'decision' },
          { id: 'e2', source: 'decision', target: 'yes', label: 'Yes' },
          { id: 'e3', source: 'decision', target: 'no', label: 'No' },
          { id: 'e4', source: 'yes', target: 'merge' },
          { id: 'e5', source: 'no', target: 'merge' },
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const edges = container.querySelectorAll('.edge');
      expect(edges.length).toBe(5);
    });

    it('should handle parallel processes', () => {
      const config: FlowchartConfig = {
        nodes: [
          { id: 'start', type: 'terminal', label: 'Start' },
          { id: 'p1', type: 'process', label: 'Process 1' },
          { id: 'p2', type: 'process', label: 'Process 2' },
          { id: 'p3', type: 'process', label: 'Process 3' },
          { id: 'end', type: 'terminal', label: 'End' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'p1' },
          { id: 'e2', source: 'start', target: 'p2' },
          { id: 'e3', source: 'start', target: 'p3' },
          { id: 'e4', source: 'p1', target: 'end' },
          { id: 'e5', source: 'p2', target: 'end' },
          { id: 'e6', source: 'p3', target: 'end' },
        ],
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const nodes = container.querySelectorAll('.nodes > g');
      expect(nodes.length).toBe(5);
    });

    it('should handle deep hierarchies', () => {
      const config: FlowchartConfig = {
        nodes: Array.from({ length: 10 }, (_, i) => ({
          id: `level-${i}`,
          type: 'process' as const,
          label: `Level ${i}`,
        })),
        edges: Array.from({ length: 9 }, (_, i) => ({
          id: `e-${i}`,
          source: `level-${i}`,
          target: `level-${i + 1}`,
        })),
        layout: 'TB',
      };

      const { container } = render(
        <Flowchart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      const viewBox = svg?.getAttribute('viewBox');
      expect(viewBox).toBeTruthy();
    });
  });
});
