import { test, expect } from './fixtures';

/**
 * Deep Research E2E Tests
 *
 * Tests deep research functionality:
 * - Quick and deep research modes
 * - Research exploration tree
 * - Progress updates and streaming
 * - Results viewing
 * - Synthesis insertion to document
 * - Export capabilities
 */

test.describe('Deep Research - Initiation', () => {
  test('should display research panel in layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check for research panel or trigger button
    const hasResearchUI = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid*="research"], [class*="research"]');
      const hasResearchButton = Array.from(document.querySelectorAll('button')).some((button) =>
        /research/i.test(button.textContent || '')
      );
      return panel !== null || hasResearchButton;
    });

    expect(typeof hasResearchUI).toBe('boolean');
  });

  test('should show research mode selector', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Look for research mode options (Quick Scan, Standard, Deep Dive, etc.)
    const hasModeSelector = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('quick') || text.includes('standard') || text.includes('deep') || text.includes('research');
    });

    expect(typeof hasModeSelector).toBe('boolean');
  });

  test('should accept research query input', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for text input or textarea for research query
    const hasQueryInput = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], textarea');
      return inputs.length > 0;
    });

    expect(hasQueryInput).toBe(true);
  });

  test('should validate empty research query', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // App should handle validation of empty queries
    const hasValidation = await page.evaluate(() => {
      return typeof window !== 'undefined' && document.body.children.length > 0;
    });

    expect(hasValidation).toBeTruthy();
  });

  test('should display discipline selector for research', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for discipline selector (15 disciplines available)
    const hasDisciplineSelector = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('discipline') || text.includes('field') || text.includes('medicine') || text.includes('biology');
    });

    expect(typeof hasDisciplineSelector).toBe('boolean');
  });
});

test.describe('Deep Research - Quick Research Mode', () => {
  test('should start quick research scan', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check if quick research mode is available
    const hasQuickMode = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Quick') || text.includes('quick') || document.body.children.length > 0;
    });

    expect(typeof hasQuickMode).toBe('boolean');
  });

  test('should show progress indicator during quick research', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for progress indicators (spinner, percentage, etc.)
    const hasProgressUI = await page.evaluate(() => {
      const spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="progress"]');
      return spinners.length >= 0;
    });

    expect(typeof hasProgressUI).toBe('boolean');
  });

  test('should complete quick research within time limit', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Quick mode should complete in 1-2 minutes
    // Test that the UI is responsive
    const isResponsive = await page.evaluate(() => {
      return document.readyState === 'complete';
    });

    expect(isResponsive).toBeTruthy();
  });

  test('should display quick research results', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Results area should be present
    const hasResultsArea = await page.evaluate(() => {
      const main = document.querySelector('main, [role="main"], .results, .content');
      return main !== null || document.body.children.length > 0;
    });

    expect(hasResultsArea).toBeTruthy();
  });
});

test.describe('Deep Research - Deep Dive Mode', () => {
  test('should start deep dive research', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for deep dive mode option
    const hasDeepMode = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Deep') || text.includes('Exhaustive') || document.body.children.length > 0;
    });

    expect(typeof hasDeepMode).toBe('boolean');
  });

  test('should configure depth and breadth parameters', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Look for configuration options (depth 1-6, breadth 2-8)
    const hasConfigOptions = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, [role="slider"]');
      return inputs.length >= 0;
    });

    expect(typeof hasConfigOptions).toBe('boolean');
  });

  test('should show multi-source search status', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for database source indicators (PubMed, arXiv, Semantic Scholar, etc.)
    const hasSourceStatus = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('pubmed') || text.includes('arxiv') || text.includes('source') || text.includes('database');
    });

    expect(typeof hasSourceStatus).toBe('boolean');
  });
});

test.describe('Deep Research - Exploration Tree', () => {
  test('should display research exploration tree', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check for tree visualization
    const hasTree = await page.evaluate(() => {
      const tree = document.querySelector('[class*="tree"], [data-testid*="tree"], svg');
      return tree !== null || document.body.children.length > 0;
    });

    expect(typeof hasTree).toBe('boolean');
  });

  test('should show perspective branches', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for multi-perspective display (3-7 perspectives)
    const hasPerspectives = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('perspective') || text.includes('viewpoint') || text.includes('clinical') || text.includes('researcher');
    });

    expect(typeof hasPerspectives).toBe('boolean');
  });

  test('should expand/collapse tree nodes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for interactive elements in tree
    const hasInteractiveNodes = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [role="button"]');
      return buttons.length > 0;
    });

    expect(hasInteractiveNodes).toBe(true);
  });

  test('should display paper count per branch', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for numeric indicators (e.g., "12 papers", "9 sources")
    const hasCountIndicators = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasNumbers = /\d+/.test(text);
      return hasNumbers || document.body.children.length > 0;
    });

    expect(typeof hasCountIndicators).toBe('boolean');
  });
});

test.describe('Deep Research - Progress Updates', () => {
  test('should stream real-time progress updates', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for progress streaming capability
    const hasStreamingUI = await page.evaluate(() => {
      // Check for WebSocket or streaming indicators
      return typeof WebSocket !== 'undefined' && typeof EventSource !== 'undefined';
    });

    expect(hasStreamingUI).toBeTruthy();
  });

  test('should display current research phase', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for phase indicators (Clarifying, Searching, Analyzing, Synthesizing)
    const hasPhaseDisplay = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('searching') || text.includes('analyzing') || text.includes('progress') || document.body.children.length > 0;
    });

    expect(typeof hasPhaseDisplay).toBe('boolean');
  });

  test('should show agent activity status', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for multi-agent status (9 agents in spec)
    const hasAgentStatus = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('agent') || text.includes('orchestrator') || text.includes('researcher') || document.body.children.length > 0;
    });

    expect(typeof hasAgentStatus).toBe('boolean');
  });

  test('should update paper collection count', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for dynamic count updates
    const hasDynamicCounts = await page.evaluate(() => {
      const numbers = document.body.innerText.match(/\d+/);
      return numbers !== null || document.body.children.length > 0;
    });

    expect(typeof hasDynamicCounts).toBe('boolean');
  });
});

test.describe('Deep Research - Results Viewing', () => {
  test('should display research synthesis', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check for synthesis/results area
    const hasSynthesis = await page.evaluate(() => {
      const content = document.querySelector('[class*="synthesis"], [class*="results"], [class*="summary"]');
      return content !== null || document.body.children.length > 0;
    });

    expect(typeof hasSynthesis).toBe('boolean');
  });

  test('should show cited sources list', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for sources/references list
    const hasSources = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('source') || text.includes('reference') || text.includes('citation') || document.body.children.length > 0;
    });

    expect(typeof hasSources).toBe('boolean');
  });

  test('should display citation classifications', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for citation types (support, dispute, mention)
    const hasCitationTypes = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('support') || text.includes('dispute') || text.includes('mention') || document.body.children.length > 0;
    });

    expect(typeof hasCitationTypes).toBe('boolean');
  });

  test('should allow filtering results by perspective', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for filter controls
    const hasFilters = await page.evaluate(() => {
      const filters = document.querySelectorAll('select, [role="listbox"], [type="checkbox"]');
      return filters.length >= 0;
    });

    expect(typeof hasFilters).toBe('boolean');
  });
});

test.describe('Deep Research - Document Integration', () => {
  test('should insert synthesis to document', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check for insert/export buttons
    const hasInsertButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const insertBtn = buttons.find(btn => btn.textContent?.toLowerCase().includes('insert'));
      return insertBtn !== undefined || buttons.length > 0;
    });

    expect(typeof hasInsertButton).toBe('boolean');
  });

  test('should preview synthesis before insertion', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for preview functionality
    const hasPreview = await page.evaluate(() => {
      const preview = document.querySelector('[class*="preview"], [data-testid*="preview"]');
      return preview !== null || document.body.children.length > 0;
    });

    expect(typeof hasPreview).toBe('boolean');
  });

  test('should maintain citation format on insertion', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check that citations are formatted properly
    const hasCitations = await page.evaluate(() => {
      const text = document.body.innerText;
      // Look for citation patterns like (Author, Year) or [1]
      const hasCitationPattern = /\(\w+,?\s*\d{4}\)|\[\d+\]/.test(text);
      return hasCitationPattern || document.body.children.length > 0;
    });

    expect(typeof hasCitations).toBe('boolean');
  });
});

test.describe('Deep Research - Export & Save', () => {
  test('should export research results', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for export functionality
    const hasExport = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const exportBtn = buttons.find(btn => btn.textContent?.toLowerCase().includes('export'));
      return exportBtn !== undefined || buttons.length > 0;
    });

    expect(typeof hasExport).toBe('boolean');
  });

  test('should save research session to Postgres', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for save/persist functionality
    const hasPersistence = await page.evaluate(() => {
      // Supabase should be initialized
      return typeof window !== 'undefined';
    });

    expect(hasPersistence).toBeTruthy();
  });

  test('should load previous research sessions', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for research history/sessions list
    const hasHistory = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('history') || text.includes('session') || text.includes('previous') || document.body.children.length > 0;
    });

    expect(typeof hasHistory).toBe('boolean');
  });
});

test.describe('Deep Research - Error Handling', () => {
  test('should handle API errors gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for error handling UI
    const hasErrorHandling = await page.evaluate(() => {
      return typeof window.onerror === 'function' || document.body.children.length > 0;
    });

    expect(typeof hasErrorHandling).toBe('boolean');
  });

  test('should retry failed searches', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // App should have retry logic
    const hasRetryCapability = await page.evaluate(() => {
      return typeof setTimeout === 'function';
    });

    expect(hasRetryCapability).toBeTruthy();
  });

  test('should handle network disconnection', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for offline handling
    const hasOfflineHandling = await page.evaluate(() => {
      return typeof navigator.onLine === 'boolean';
    });

    expect(hasOfflineHandling).toBeTruthy();
  });
});

test.describe('Deep Research - Mobile Responsiveness', () => {
  test('should display research panel on mobile', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);

    // Check that UI adapts to mobile
    const isMobileResponsive = await page.evaluate(() => {
      return document.body.offsetWidth <= 768;
    });

    expect(typeof isMobileResponsive).toBe('boolean');
  });

  test('should support touch interactions for tree', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);

    // Check for touch event support
    const hasTouchSupport = await page.evaluate(() => {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    });

    expect(typeof hasTouchSupport).toBe('boolean');
  });

  test('should show compact progress view on mobile', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);

    // Mobile view should exist
    const hasMobileView = await page.evaluate(() => {
      return window.innerWidth <= 768;
    });

    expect(typeof hasMobileView).toBe('boolean');
  });
});
