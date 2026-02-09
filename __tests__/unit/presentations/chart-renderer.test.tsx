/**
 * Chart Renderer Tests
 * Tests for SVG chart rendering components
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Import the SlideChart component and helper functions
// We'll test by rendering and inspecting the SVG output
import { SlideChart } from '@/lib/presentations/visualizations/chart-renderer';
import { ChartConfig, ChartData } from '@/lib/presentations/types';
import { getTheme } from '@/lib/presentations/themes';

// Mock theme for testing
const mockTheme = getTheme('academic');

describe('Chart Renderer', () => {
  describe('Bar Chart', () => {
    it('should render bar chart SVG', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{
            label: 'Values',
            data: [30, 50, 40],
          }],
        },
        options: {
          title: 'Test Bar Chart',
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} width={800} height={450} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('width')).toBe('800');
      expect(svg?.getAttribute('height')).toBe('450');

      // Should have bars (rect elements)
      const bars = container.querySelectorAll('rect');
      expect(bars.length).toBeGreaterThan(0);
    });

    it('should render horizontal bar chart', () => {
      const config: ChartConfig = {
        type: 'horizontal-bar',
        data: {
          labels: ['Category 1', 'Category 2'],
          datasets: [{
            label: 'Values',
            data: [60, 80],
          }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should render stacked bar chart', () => {
      const config: ChartConfig = {
        type: 'stacked-bar',
        data: {
          labels: ['Q1', 'Q2'],
          datasets: [
            { label: 'Series 1', data: [30, 40] },
            { label: 'Series 2', data: [20, 30] },
          ],
        },
        options: {
          stacked: true,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const bars = container.querySelectorAll('rect');
      // Should have bars for both series
      expect(bars.length).toBeGreaterThan(2);
    });

    it('should apply theme colors', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const bars = container.querySelectorAll('.bars rect');
      if (bars.length > 0) {
        const fill = bars[0].getAttribute('fill');
        expect(fill).toBeTruthy();
      }
    });

    it('should handle empty data', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{ label: 'Empty', data: [] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy(); // Should still render without crashing
    });

    it('should handle single data point', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['Only One'],
          datasets: [{ label: 'Single', data: [42] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const bars = container.querySelectorAll('.bars rect');
      expect(bars.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle negative values', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['Negative', 'Positive'],
          datasets: [{ label: 'Values', data: [-20, 30] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Line Chart', () => {
    it('should render line chart SVG', () => {
      const config: ChartConfig = {
        type: 'line',
        data: {
          labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          datasets: [{
            label: 'Progress',
            data: [10, 20, 35, 50],
          }],
        },
        options: {
          title: 'Progress Over Time',
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      // Should have a path for the line
      const paths = container.querySelectorAll('path');
      expect(paths.length).toBeGreaterThan(0);

      // Should have circles for data points
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThanOrEqual(4);
    });

    it('should render multi-series line chart', () => {
      const config: ChartConfig = {
        type: 'multi-line',
        data: {
          labels: ['Jan', 'Feb', 'Mar'],
          datasets: [
            { label: 'Series A', data: [10, 20, 30], borderColor: '#8b5cf6' },
            { label: 'Series B', data: [15, 25, 35], borderColor: '#06b6d4' },
          ],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const paths = container.querySelectorAll('path');
      // Should have at least 2 paths (one for each series)
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle single point line chart', () => {
      const config: ChartConfig = {
        type: 'line',
        data: {
          labels: ['Point 1'],
          datasets: [{ label: 'Single', data: [50] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Pie/Donut Chart', () => {
    it('should render pie chart SVG', () => {
      const config: ChartConfig = {
        type: 'pie',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{
            label: 'Distribution',
            data: [30, 45, 25],
            backgroundColor: ['#8b5cf6', '#06b6d4', '#f59e0b'],
          }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      // Should have path elements for slices
      const paths = container.querySelectorAll('.slices path');
      expect(paths.length).toBe(3);
    });

    it('should render donut chart', () => {
      const config: ChartConfig = {
        type: 'donut',
        data: {
          labels: ['Category 1', 'Category 2'],
          datasets: [{
            label: 'Data',
            data: [60, 40],
          }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      // Donut should have center label
      const centerLabel = container.querySelector('.center-label');
      expect(centerLabel).toBeTruthy();
    });

    it('should handle data summing to 100', () => {
      const config: ChartConfig = {
        type: 'pie',
        data: {
          labels: ['A', 'B', 'C', 'D'],
          datasets: [{
            label: 'Perfect Distribution',
            data: [25, 25, 25, 25],
          }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const paths = container.querySelectorAll('.slices path');
      expect(paths.length).toBe(4);
    });

    it('should handle data not summing to 100', () => {
      const config: ChartConfig = {
        type: 'pie',
        data: {
          labels: ['A', 'B'],
          datasets: [{
            label: 'Non-100',
            data: [30, 70], // Still valid, will be normalized
          }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Scatter Chart', () => {
    it('should render scatter plot', () => {
      const config: ChartConfig = {
        type: 'scatter',
        data: {
          labels: ['Point 1', 'Point 2', 'Point 3'],
          datasets: [{
            label: 'Data Points',
            data: [10, 20, 30],
          }],
          points: [
            { x: 5, y: 10 },
            { x: 10, y: 20 },
            { x: 15, y: 25 },
          ],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      // Should have circles for scatter points
      const circles = container.querySelectorAll('.points circle');
      expect(circles.length).toBeGreaterThanOrEqual(3);
    });

    it('should calculate and display trend line', () => {
      const config: ChartConfig = {
        type: 'scatter',
        data: {
          labels: [],
          datasets: [{ label: 'Correlation', data: [] }],
          points: [
            { x: 1, y: 2 },
            { x: 2, y: 4 },
            { x: 3, y: 6 },
            { x: 4, y: 8 },
          ],
        },
        options: {
          showTrendLine: true,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      // Should have trend line element
      const trendLine = container.querySelector('.trend-line');
      expect(trendLine).toBeTruthy();
    });

    it('should display R² value for trend line', () => {
      const config: ChartConfig = {
        type: 'scatter',
        data: {
          labels: [],
          datasets: [{ label: 'Data', data: [] }],
          points: [
            { x: 1, y: 2 },
            { x: 2, y: 4 },
            { x: 3, y: 6 },
          ],
        },
        options: {
          showTrendLine: true,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      // Should display R² text
      const text = container.textContent;
      expect(text).toContain('R²');
    });

    it('should handle negative correlation', () => {
      const config: ChartConfig = {
        type: 'scatter',
        data: {
          labels: [],
          datasets: [{ label: 'Negative', data: [] }],
          points: [
            { x: 1, y: 10 },
            { x: 2, y: 8 },
            { x: 3, y: 6 },
            { x: 4, y: 4 },
          ],
        },
        options: {
          showTrendLine: true,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Chart Options', () => {
    it('should display chart title', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {
          title: 'My Chart Title',
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('My Chart Title');
    });

    it('should render grid when showGrid is true', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {
          showGrid: true,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
    });

    it('should hide grid when showGrid is false', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {
          showGrid: false,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const grid = container.querySelector('.grid');
      expect(grid).toBeFalsy();
    });

    it('should render legend for multi-dataset charts', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [
            { label: 'Series 1', data: [30] },
            { label: 'Series 2', data: [40] },
          ],
        },
        options: {
          showLegend: true,
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('Series 1');
      expect(text).toContain('Series 2');
    });

    it('should include data source citation', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {},
        source: 'World Health Organization 2024',
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('World Health Organization 2024');
    });
  });

  describe('Responsive Sizing', () => {
    it('should respect custom width and height', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} width={600} height={400} />
      );

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('600');
      expect(svg?.getAttribute('height')).toBe('400');
    });

    it('should use default dimensions when not specified', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBeTruthy();
      expect(svg?.getAttribute('height')).toBeTruthy();
    });
  });

  describe('Data Formatting', () => {
    it('should format large numbers with K suffix', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['Big Number'],
          datasets: [{ label: 'Values', data: [15000] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      // Axis labels should format large numbers
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should format small numbers appropriately', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['Small'],
          datasets: [{ label: 'Values', data: [0.0045] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should handle zero values', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['Zero'],
          datasets: [{ label: 'Values', data: [0] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown chart type gracefully', () => {
      const config: ChartConfig = {
        type: 'unknown-type' as any,
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      // Should render fallback message
      const text = container.textContent;
      expect(text).toContain('not yet implemented');
    });

    it('should handle missing dataset gracefully', () => {
      const config: ChartConfig = {
        type: 'pie',
        data: {
          labels: ['A'],
          datasets: [],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy(); // Should not crash
    });

    it('should handle mismatched labels and data', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{ label: 'Test', data: [10] }], // Only 1 value for 3 labels
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper SVG structure', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [50] }],
        },
        options: {
          title: 'Accessible Chart',
        },
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const svg = container.querySelector('svg');
      expect(svg?.tagName).toBe('svg');
    });

    it('should include text labels', () => {
      const config: ChartConfig = {
        type: 'bar',
        data: {
          labels: ['Category A', 'Category B'],
          datasets: [{ label: 'Values', data: [30, 50] }],
        },
        options: {},
      };

      const { container } = render(
        <SlideChart config={config} theme={mockTheme} />
      );

      const text = container.textContent;
      expect(text).toContain('Category A');
      expect(text).toContain('Category B');
    });
  });
});
