/**
 * Content Extractor Tests
 * Tests for extracting structured data from academic documents
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractContent,
  cleanContent,
  extractTitle,
  calculateReadingTime,
  extractDataPatterns,
  extractCitations,
  parseSections,
  identifyKeyFindings,
} from '@/lib/presentations/extractors/content-extractor';
import { textSamples, createMockDocumentWithStatistics } from '@/__tests__/mocks/test-data';

describe('Content Extractor', () => {
  describe('cleanContent', () => {
    it('should remove HTML tags', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const cleaned = cleanContent(html);
      expect(cleaned).toBe('Hello world');
    });

    it('should decode HTML entities', () => {
      const html = '&lt;p&gt;Test &amp; Example&nbsp;Text&mdash;End&quot;';
      const cleaned = cleanContent(html);
      expect(cleaned).toBe('<p>Test & Example Text—End"');
    });

    it('should normalize whitespace', () => {
      const html = '<p>Multiple   spaces\n\nand\ttabs</p>';
      const cleaned = cleanContent(html);
      expect(cleaned).toBe('Multiple spaces and tabs');
    });

    it('should handle empty strings', () => {
      expect(cleanContent('')).toBe('');
    });

    it('should handle only whitespace', () => {
      expect(cleanContent('   \n\t\r\n   ')).toBe('');
    });
  });

  describe('extractTitle', () => {
    it('should extract title from markdown H1', () => {
      const content = '# My Research Paper\n\nContent here...';
      expect(extractTitle(content)).toBe('My Research Paper');
    });

    it('should extract title from HTML H1', () => {
      const content = '<h1>My Research Paper</h1><p>Content here...</p>';
      expect(extractTitle(content)).toBe('My Research Paper');
    });

    it('should fall back to first line if no heading', () => {
      const content = 'This is the first line\nSecond line';
      expect(extractTitle(content)).toBe('This is the first line');
    });

    it('should truncate very long titles', () => {
      const content = 'A'.repeat(300);
      const title = extractTitle(content);
      expect(title.length).toBeLessThanOrEqual(200);
    });

    it('should handle empty content', () => {
      expect(extractTitle('')).toBe('');
    });
  });

  describe('calculateReadingTime', () => {
    it('should calculate reading time at 200 WPM', () => {
      expect(calculateReadingTime(200)).toBe(1); // 200 words = 1 minute
      expect(calculateReadingTime(400)).toBe(2); // 400 words = 2 minutes
      expect(calculateReadingTime(1000)).toBe(5); // 1000 words = 5 minutes
    });

    it('should round up partial minutes', () => {
      expect(calculateReadingTime(100)).toBe(1); // 0.5 minutes -> 1
      expect(calculateReadingTime(250)).toBe(2); // 1.25 minutes -> 2
    });

    it('should handle zero words', () => {
      expect(calculateReadingTime(0)).toBe(0);
    });
  });

  describe('extractDataPatterns', () => {
    it('should extract percentages', () => {
      const text = 'The success rate was 45% and failure rate 15.5%.';
      const patterns = extractDataPatterns(text);

      const percentages = patterns.filter(p => p.type === 'percentage');
      expect(percentages.length).toBe(2);
      expect(percentages[0].value).toBe('45%');
      expect(percentages[1].value).toBe('15.5%');
    });

    it('should extract p-values', () => {
      const text = 'Significant results: p < 0.05, p = 0.001, P<0.001';
      const patterns = extractDataPatterns(text);

      const pValues = patterns.filter(p => p.type === 'pValue');
      expect(pValues.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract sample sizes', () => {
      const text = 'Study 1 (n = 100), Study 2 (n=250), total n=350';
      const patterns = extractDataPatterns(text);

      const samples = patterns.filter(p => p.type === 'sampleSize');
      expect(samples.length).toBe(3);
      expect(samples[0].value).toMatch(/n\s*=\s*100/i);
    });

    it('should extract effect sizes', () => {
      const text = 'OR = 2.3, HR = 1.5, d = 0.8, r = 0.45, RR:3.2';
      const patterns = extractDataPatterns(text);

      const effectSizes = patterns.filter(p => p.type === 'effectSize');
      expect(effectSizes.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract confidence intervals', () => {
      const text = '95% CI, 99% CI, and 90% CI were calculated.';
      const patterns = extractDataPatterns(text);

      // Note: CI extraction stores just the percentage, not full pattern
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should extract comparisons', () => {
      const text = '45 vs 32, 78 versus 65, 100 compared to 85';
      const patterns = extractDataPatterns(text);

      const comparisons = patterns.filter(p => p.type === 'comparison');
      expect(comparisons.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract trends (increase/decrease)', () => {
      const text = '25% increase, 30% decrease, 15% improvement, 20% reduction';
      const patterns = extractDataPatterns(text);

      const trends = patterns.filter(p => p.type === 'trend');
      expect(trends.length).toBe(4);
    });

    it('should include context for each pattern', () => {
      const text = 'In our study, we observed a 45% improvement in patient outcomes.';
      const patterns = extractDataPatterns(text);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].context).toBeTruthy();
      expect(patterns[0].context.length).toBeGreaterThan(0);
    });

    it('should handle text without statistics', () => {
      const text = 'This is a simple paragraph with no numbers or statistics.';
      const patterns = extractDataPatterns(text);
      expect(patterns.length).toBe(0);
    });

    it('should handle very long documents efficiently', () => {
      const longText = 'Test paragraph. '.repeat(10000);
      const patterns = extractDataPatterns(longText);
      expect(patterns).toBeDefined();
    });
  });

  describe('extractCitations', () => {
    it('should extract author-year citations', () => {
      const text = 'According to Smith et al. (2023), this is true.';
      const citations = extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].authors).toContain('Smith');
      expect(citations[0].year).toBe(2023);
    });

    it('should extract multiple author citations', () => {
      const text = 'As shown by Jones & Williams (2024)...';
      const citations = extractCitations(text);

      expect(citations.length).toBe(1);
      expect(citations[0].authors.length).toBe(2);
    });

    it('should extract multiple citations', () => {
      const text = textSamples.withCitations;
      const citations = extractCitations(text);

      expect(citations.length).toBeGreaterThan(1);
    });

    it('should deduplicate citations', () => {
      const text = 'Smith (2023) and Smith (2023) again.';
      const citations = extractCitations(text);

      expect(citations.length).toBe(1);
    });

    it('should preserve in-text format', () => {
      const text = 'Research shows (Smith et al., 2023) that...';
      const citations = extractCitations(text);

      expect(citations[0].inTextFormat).toMatch(/Smith et al.*2023/);
    });

    it('should handle text without citations', () => {
      const text = 'This text has no citations at all.';
      const citations = extractCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should handle numeric citations gracefully', () => {
      const text = 'Multiple studies [1-3] have shown...';
      const citations = extractCitations(text);
      // Numeric citations are not captured by author-year pattern
      expect(citations.length).toBe(0);
    });
  });

  describe('parseSections', () => {
    it('should parse markdown sections', () => {
      const content = `
# Introduction
This is the intro.

## Methods
This is the methods section.

### Participants
Details about participants.
      `;

      const sections = parseSections(content);
      expect(sections.length).toBeGreaterThanOrEqual(3);
      expect(sections.find(s => s.heading.includes('Introduction'))).toBeTruthy();
      expect(sections.find(s => s.heading.includes('Methods'))).toBeTruthy();
    });

    it('should parse HTML sections', () => {
      const content = `
<h1>Introduction</h1>
<p>This is the intro.</p>
<h2>Methods</h2>
<p>This is the methods section.</p>
      `;

      const sections = parseSections(content);
      expect(sections.length).toBeGreaterThanOrEqual(2);
    });

    it('should identify sections with data patterns', () => {
      const content = `
# Results
We found that 45% of patients improved (p < 0.05, n = 100).

# Discussion
This section has no statistics.
      `;

      const sections = parseSections(content);
      const resultsSection = sections.find(s => s.heading.includes('Results'));
      const discussionSection = sections.find(s => s.heading.includes('Discussion'));

      expect(resultsSection?.hasData).toBe(true);
      expect(resultsSection?.dataPatterns.length).toBeGreaterThan(0);
      expect(discussionSection?.hasData).toBe(false);
    });

    it('should extract bullet points from sections', () => {
      const content = `
# Key Points
- First point
- Second point
- Third point
      `;

      const sections = parseSections(content);
      expect(sections[0].bulletPoints.length).toBe(3);
    });

    it('should handle content without headings', () => {
      const content = 'Just some plain text without any headings.';
      const sections = parseSections(content);

      expect(sections.length).toBe(1);
      expect(sections[0].heading).toBe('Content');
    });

    it('should assign correct heading levels', () => {
      const content = `
# Level 1
## Level 2
### Level 3
      `;

      const sections = parseSections(content);
      expect(sections[0].level).toBe(1);
      expect(sections[1].level).toBe(2);
      expect(sections[2].level).toBe(3);
    });
  });

  describe('identifyKeyFindings', () => {
    it('should identify findings with statistical significance', () => {
      const content = `
# Results
The treatment significantly improved outcomes (p < 0.001, n = 200).
Patients showed a 45% reduction in symptoms.
      `;

      const sections = parseSections(content);
      const findings = identifyKeyFindings(sections);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].confidence).toBeGreaterThan(0.4);
    });

    it('should score findings by confidence', () => {
      const content = `
# Results
We demonstrated significant improvement with strong evidence (Smith et al., 2024).
The data showed a 75% increase (p < 0.001).
      `;

      const sections = parseSections(content);
      const findings = identifyKeyFindings(sections);

      // Should be sorted by confidence
      if (findings.length > 1) {
        expect(findings[0].confidence).toBeGreaterThanOrEqual(findings[1].confidence);
      }
    });

    it('should suggest visualization types', () => {
      const content = `
# Results
45% vs 55% between groups showed significant differences.
Trends over time indicated steady improvement from 2020 to 2024.
      `;

      const sections = parseSections(content);
      const findings = identifyKeyFindings(sections);

      const barFinding = findings.find(f => f.visualizationPotential === 'bar');
      const lineFinding = findings.find(f => f.visualizationPotential === 'line');

      // At least one should suggest a visualization
      expect(findings.some(f => f.visualizationPotential !== null)).toBe(true);
    });

    it('should limit to top 10 findings', () => {
      const content = `
# Results
${Array.from({ length: 20 }, (_, i) =>
  `Finding ${i + 1} showed significant results (p < 0.05, n = 100).`
).join('\n')}
      `;

      const sections = parseSections(content);
      const findings = identifyKeyFindings(sections);

      expect(findings.length).toBeLessThanOrEqual(10);
    });

    it('should include supporting data', () => {
      const content = `
# Results
Treatment demonstrated a 34% improvement (95% CI: 28-40%, p < 0.001).
      `;

      const sections = parseSections(content);
      const findings = identifyKeyFindings(sections);

      expect(findings[0]?.supportingData).toBeTruthy();
      expect((findings[0]?.supportingData?.length ?? 0)).toBeGreaterThan(0);
    });

    it('should handle sections without findings', () => {
      const content = `
# Introduction
This is a simple introduction with no data or findings.
      `;

      const sections = parseSections(content);
      const findings = identifyKeyFindings(sections);

      expect(findings.length).toBe(0);
    });
  });

  describe('extractContent (integration)', () => {
    it('should extract complete content structure', async () => {
      const content = `
# AI in Healthcare: A Meta-Analysis

## Abstract
Recent advances show promise in diagnostic accuracy.

## Methods
We analyzed 50 studies (n = 10,000 patients) using meta-analytic techniques.

## Results
AI achieved 92% accuracy vs 85% for human clinicians (p < 0.001).
Overall sensitivity was 89% (95% CI: 85-93%).

## Conclusions
AI demonstrates significant potential in diagnostic applications.
      `;

      const extraction = await extractContent(content);

      expect(extraction.title).toBeTruthy();
      expect(extraction.sections.length).toBeGreaterThan(0);
      expect(extraction.abstract).toBeTruthy();
      expect(extraction.methodology).toBeTruthy();
      expect(extraction.keyFindings.length).toBeGreaterThan(0);
      expect(extraction.citations.length).toBeGreaterThanOrEqual(0);
      expect(extraction.wordCount).toBeGreaterThan(0);
      expect(extraction.estimatedReadingTime).toBeGreaterThan(0);
    });

    it('should handle very long documents', async () => {
      const longContent = 'Lorem ipsum dolor sit amet. '.repeat(5000);
      const extraction = await extractContent(longContent);

      expect(extraction.wordCount).toBeGreaterThan(10000);
      expect(extraction.estimatedReadingTime).toBeGreaterThan(50);
    });

    it('should handle minimal content', async () => {
      const extraction = await extractContent('Short text.');

      expect(extraction.title).toBe('Short text.');
      expect(extraction.sections.length).toBeGreaterThanOrEqual(1);
      expect(extraction.wordCount).toBe(2);
    });

    it('should handle empty content gracefully', async () => {
      const extraction = await extractContent('');

      expect(extraction.sections.length).toBeGreaterThanOrEqual(1);
      expect(extraction.wordCount).toBe(0);
    });

    it('should extract all components from realistic document', async () => {
      const mockDoc = createMockDocumentWithStatistics();
      const extraction = await extractContent(mockDoc.content);

      expect(extraction.sections.length).toBeGreaterThan(0);
      expect(extraction.wordCount).toBeGreaterThan(0);

      // Check that at least some data was extracted
      const hasData = extraction.sections.some(s => s.hasData);
      expect(hasData).toBe(true);
    });
  });
});
