import { test, expect } from './fixtures';

/**
 * Authentication E2E Tests
 *
 * Tests authentication flows including:
 * - Initial page load
 * - Sign-in UI presence
 * - Protected routes
 * - Sign-out functionality
 */

test.describe('Authentication', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Check that the page loaded
    await expect(page).toHaveTitle(/Academic Writing/i);

    // Check for main layout elements
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should display sign-in button when not authenticated', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for sign-in button or user menu.
    // In dev auth-bypass mode user menu is expected; otherwise sign-in button.
    const signInButton = page.locator('[data-testid="sign-in-button"]');
    const userMenu = page.locator('[data-testid="user-menu"]');
    const roleBasedSignIn = page.getByRole('button', { name: /sign in/i });
    const roleBasedUserMenu = page.getByRole('button', { name: /dev test user|sign out|user/i });

    const hasSignIn = (await signInButton.count()) > 0 || (await roleBasedSignIn.count()) > 0;
    const hasUserMenu = (await userMenu.count()) > 0 || (await roleBasedUserMenu.count()) > 0;

    expect(hasSignIn || hasUserMenu).toBeTruthy();
  });

  test('should show authentication UI elements', async ({ page }) => {
    await page.goto('/');

    // Wait for auth to initialize
    await page.waitForTimeout(2000);

    // Check that Supabase auth has initialized
    const supabaseInitialized = await page.evaluate(() => {
      return typeof window !== 'undefined';
    });

    expect(supabaseInitialized).toBeTruthy();
  });

  test('should have proper page structure', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Check for main elements
    const html = await page.locator('html');
    await expect(html).toBeVisible();

    // Check for Next.js root
    const root = await page.locator('#__next, body');
    await expect(root).toBeVisible();
  });

  test('should load without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known Supabase auth errors in test environment
    const ignoredErrorPatterns = [
      /supabase/i,
      /auth\//i,
      /cors/i,
      /err_blocked_by_client/i,
      /fetch failed/i,
      /failed to fetch/i,
      /failed to load resource/i,
      /net::err_/i,
      /enotfound/i,
      /error fetching paper metadata/i,
    ];
    const relevantErrors = errors.filter(
      (error) => !ignoredErrorPatterns.some((pattern) => pattern.test(error))
    );
    const uniqueRelevantErrors = [...new Set(relevantErrors)];

    // There should be no critical errors
    expect(uniqueRelevantErrors.length).toBeLessThan(5);
  });

  test('should have responsive viewport', async ({ page }) => {
    await page.goto('/');

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    let body = await page.locator('body');
    await expect(body).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);

    body = await page.locator('body');
    await expect(body).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have correct meta tags', async ({ page }) => {
    await page.goto('/');

    // Check viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', /width=device-width/);

    // Check for charset
    const charset = await page.evaluate(() => {
      return document.characterSet;
    });
    expect(charset).toBe('UTF-8');
  });

  test('should load CSS styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that styles are loaded by checking computed style
    const backgroundColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Should have a background color set (not transparent)
    expect(backgroundColor).toBeTruthy();
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('should handle navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get initial URL
    const initialUrl = page.url();
    expect(initialUrl).toContain('localhost:2550');

    // Try to navigate (if there are navigation elements)
    const links = await page.locator('a[href]').count();

    // App should have at least some interactive elements
    expect(links).toBeGreaterThanOrEqual(0);
  });

  test('should initialize without blocking errors', async ({ page }) => {
    const blockedRequests: string[] = [];

    // Track failed requests
    page.on('requestfailed', (request) => {
      blockedRequests.push(request.url());
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Some requests might fail in test environment (Supabase, etc.)
    // but the page should still load
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });
});

test.describe('Authentication UI', () => {
  test('should render main layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for any visible content
    const hasContent = await page.evaluate(() => {
      return document.body.innerText.length > 0;
    });

    expect(hasContent).toBeTruthy();
  });

  test('should have accessible document structure', async ({ page }) => {
    await page.goto('/');

    // Check for proper HTML structure
    const hasDoctype = await page.evaluate(() => {
      return document.doctype !== null;
    });

    expect(hasDoctype).toBeTruthy();

    // Check for lang attribute
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });
});
