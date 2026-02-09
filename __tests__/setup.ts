/**
 * Vitest Global Setup
 *
 * This file runs before all tests and sets up:
 * - Testing Library DOM matchers
 * - Supabase mocks
 * - API mocks (MSW)
 * - Global test utilities
 */

import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll, vi, expect } from 'vitest';
import { server } from './mocks/server';
import { mockAuth, mockDatabase, mockSupabaseBrowserClient, MockTimestamp } from './mocks/supabase';
import { createMockUser } from './mocks/test-data';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

function toSupabaseUser(user: typeof mockAuth.currentUser) {
  if (!user) return null;
  return {
    id: user.uid,
    email: user.email,
    user_metadata: {
      full_name: user.displayName,
      avatar_url: user.photoURL,
    },
    created_at: new Date().toISOString(),
  };
}

function toSession(user: typeof mockAuth.currentUser) {
  const supabaseUser = toSupabaseUser(user);
  if (!supabaseUser) return null;
  return {
    user: supabaseUser,
  };
}

async function upsertLegacyUser(user: typeof mockAuth.currentUser): Promise<void> {
  if (!user) return;
  const path = `users/${user.uid}`;
  const existing = mockDatabase.getData(path);
  const now = Date.now();

  await mockDatabase.doc(path).set({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    createdAt: existing?.createdAt || now,
    lastLoginAt: now,
    preferences: existing?.preferences || {
      defaultModel: 'anthropic',
      autoSaveInterval: 30,
      theme: 'auto',
    },
  });
}

const mockSupabaseClient = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: toSession(mockAuth.currentUser) }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: toSupabaseUser(mockAuth.currentUser) }, error: null })),
    onAuthStateChange: vi.fn((callback: (event: string, session: { user: ReturnType<typeof toSupabaseUser> } | null) => void) => {
      const unsubscribe = mockAuth.onAuthStateChanged((user) => {
        callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', toSession(user));
      });
      callback('INITIAL_SESSION', toSession(mockAuth.currentUser));
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithOAuth: vi.fn(async () => {
      const pendingError = mockAuth.consumeError();
      if (pendingError) {
        return { data: { user: null, session: null }, error: pendingError };
      }

      const { user } = await mockAuth.signInWithPopup();
      await upsertLegacyUser(user);

      return {
        data: { user: toSupabaseUser(user), session: toSession(user) },
        error: null,
      };
    }),
    signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => {
      const pendingError = mockAuth.consumeError();
      if (pendingError) {
        return { data: { user: null, session: null }, error: pendingError };
      }

      const user = mockAuth.currentUser || createMockUser({ email });
      mockAuth.setUser(user);
      await upsertLegacyUser(user);

      return {
        data: { user: toSupabaseUser(user), session: toSession(user) },
        error: null,
      };
    }),
    signUp: vi.fn(async ({ email, options }: { email: string; password: string; options?: { data?: { full_name?: string } } }) => {
      const pendingError = mockAuth.consumeError();
      if (pendingError) {
        return { data: { user: null, session: null }, error: pendingError };
      }

      const user = createMockUser({
        email,
        displayName: options?.data?.full_name || 'New User',
      });
      mockAuth.setUser(user);
      await upsertLegacyUser(user);

      return {
        data: { user: toSupabaseUser(user), session: toSession(user) },
        error: null,
      };
    }),
    resetPasswordForEmail: vi.fn(async () => {
      const pendingError = mockAuth.consumeError();
      if (pendingError) {
        return { data: null, error: pendingError };
      }
      return { data: null, error: null };
    }),
    updateUser: vi.fn(async ({ data }: { data?: { full_name?: string; avatar_url?: string } }) => {
      const pendingError = mockAuth.consumeError();
      if (pendingError) {
        return { data: { user: null }, error: pendingError };
      }

      if (!mockAuth.currentUser) {
        return { data: { user: null }, error: new Error('No user is currently signed in') };
      }

      const updatedUser = {
        ...mockAuth.currentUser,
        displayName: data?.full_name ?? mockAuth.currentUser.displayName,
        photoURL: data?.avatar_url ?? mockAuth.currentUser.photoURL,
      };

      mockAuth.setUser(updatedUser);
      await upsertLegacyUser(updatedUser);

      return { data: { user: toSupabaseUser(updatedUser) }, error: null };
    }),
    signOut: vi.fn(async () => {
      const pendingError = mockAuth.consumeError();
      if (pendingError) {
        return { error: pendingError };
      }
      await mockAuth.signOut();
      return { error: null };
    }),
  },
  from: vi.fn((table: string) => mockSupabaseBrowserClient.from(table)),
  channel: vi.fn((name: string) => mockSupabaseBrowserClient.channel(name)),
  removeChannel: vi.fn((channel: unknown) => mockSupabaseBrowserClient.removeChannel(channel)),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ data: null, error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
    })),
  },
  rpc: vi.fn(async () => ({ data: null, error: null })),
  database: mockDatabase,
  timestamp: MockTimestamp,
};

vi.mock('@supabase/ssr', async () => ({
  createBrowserClient: vi.fn(() => mockSupabaseClient),
}));

vi.mock('@supabase/supabase-js', async () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));


// Mock pptxgenjs for presentation export tests
// Note: Using vi.doMock would cause hoisting issues, so we create the mock inline
vi.mock('pptxgenjs', () => {
  const mockPptxSlide = {
    addText: vi.fn(),
    addImage: vi.fn(),
    addTable: vi.fn(),
    addChart: vi.fn(),
    addNotes: vi.fn(),
    background: undefined,
  };

  const mockPptxInstance = {
    title: '',
    author: '',
    subject: '',
    company: '',
    layout: '',
    defineSlideMaster: vi.fn(),
    addSlide: vi.fn(() => mockPptxSlide),
    write: vi.fn(async () => new Blob(['mock-pptx-content'], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })),
  };

  class MockPptxGenJS {
    get title() { return mockPptxInstance.title; }
    set title(value: string) { mockPptxInstance.title = value; }

    get author() { return mockPptxInstance.author; }
    set author(value: string) { mockPptxInstance.author = value; }

    get subject() { return mockPptxInstance.subject; }
    set subject(value: string) { mockPptxInstance.subject = value; }

    get company() { return mockPptxInstance.company; }
    set company(value: string) { mockPptxInstance.company = value; }

    get layout() { return mockPptxInstance.layout; }
    set layout(value: string) { mockPptxInstance.layout = value; }

    defineSlideMaster = mockPptxInstance.defineSlideMaster;
    addSlide = mockPptxInstance.addSlide;
    write = mockPptxInstance.write;
  }

  return {
    default: MockPptxGenJS,
    MockPptxGenJS,
    mockPptxSlide,
    mockPptxInstance,
  };
});

// Establish API mocking before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests are done
afterAll(() => {
  server.close();
});

// Mock window.matchMedia (for responsive components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver (for lazy loading)
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
  root = null;
  rootMargin = '';
  thresholds = [];
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock ResizeObserver (for responsive panels)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock scrollTo
window.scrollTo = vi.fn();

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
});

// Mock URL.createObjectURL (for file exports)
window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
window.URL.revokeObjectURL = vi.fn();

// Extend Vitest matchers with custom matchers
expect.extend({
  // Custom matcher: toBeValidCitation
  toBeValidCitation(received: string, style: string) {
    const patterns: Record<string, RegExp> = {
      apa: /^\(.+, \d{4}[a-z]?\)$/,
      vancouver: /^\[\d+\]$/,
      chicago: /^\(.+ \d{4}\)$/,
    };
    const pattern = patterns[style];
    if (!pattern) {
      return {
        pass: false,
        message: () => `Unknown citation style: ${style}`,
      };
    }
    const pass = pattern.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid ${style} citation`
          : `Expected ${received} to be a valid ${style} citation`,
    };
  },

  // Custom matcher: toBeWithinRange
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be within range ${floor} - ${ceiling}`
          : `Expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// Type augmentation for custom matchers
declare module 'vitest' {
  interface Assertion {
    toBeValidCitation(style: string): void;
    toBeWithinRange(floor: number, ceiling: number): void;
  }
  interface AsymmetricMatchersContaining {
    toBeValidCitation(style: string): unknown;
    toBeWithinRange(floor: number, ceiling: number): unknown;
  }
}

// Global test utilities
export const waitForSupabase = () => new Promise((resolve) => setTimeout(resolve, 100));

export const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
};

export const mockDocument = {
  id: 'doc-123',
  userId: 'test-user-123',
  title: 'Test Document',
  content: '<p>Test content</p>',
  wordCount: 2,
  discipline: 'life-sciences',
  createdAt: new Date(),
  updatedAt: new Date(),
};
