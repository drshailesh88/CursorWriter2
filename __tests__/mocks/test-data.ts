/**
 * Test Data Generators
 *
 * Uses Faker to generate realistic test data for all entity types.
 * Includes edge case generators for thorough testing.
 */

import { faker } from '@faker-js/faker';
import type { Presentation, Slide, SlideContent } from '@/lib/presentations/types';

// Set seed for reproducible tests
faker.seed(12345);

// ============================================================
// Type Definitions (mirrors lib/supabase/schema.ts)
// ============================================================

export interface MockUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

export interface MockDocument {
  id: string;
  userId: string;
  title: string;
  content: string;
  wordCount: number;
  discipline: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockReference {
  id: string;
  type: string;
  title: string;
  author: Array<{ family: string; given: string }>;
  issued?: { 'date-parts': number[][] };
  'container-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  abstract?: string;
  publisher?: string;
  'publisher-place'?: string;
  ISBN?: string;
  'event-title'?: string;
  'event-place'?: string;
}

export type MockPresentation = Presentation;
export type MockSlide = Slide;

// ============================================================
// User Generators
// ============================================================

export function createMockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    uid: faker.string.uuid(),
    email: faker.internet.email(),
    displayName: faker.person.fullName(),
    photoURL: faker.image.avatar(),
    ...overrides,
  };
}

// ============================================================
// Document Generators
// ============================================================

export function createMockDocument(overrides?: Partial<MockDocument>): MockDocument {
  const content = faker.lorem.paragraphs(5);
  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    title: faker.lorem.sentence(),
    content: `<p>${content}</p>`,
    wordCount: content.split(/\s+/).length,
    discipline: faker.helpers.arrayElement([
      'life-sciences',
      'clinical-medicine',
      'computer-science',
      'physics',
      'chemistry',
    ]),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  };
}

export function createMockDocumentWithStatistics(): MockDocument {
  const stats = `
    In our study of ${faker.number.int({ min: 50, max: 500 })} participants,
    we found that ${faker.number.int({ min: 20, max: 80 })}% showed significant improvement.
    The treatment group (n = ${faker.number.int({ min: 25, max: 250 })}) demonstrated
    a mean reduction of ${faker.number.float({ min: 1, max: 10, fractionDigits: 2 })} points
    (95% CI: ${faker.number.float({ min: 0.5, max: 5, fractionDigits: 2 })}-${faker.number.float({ min: 6, max: 15, fractionDigits: 2 })}).
    The difference was statistically significant (p < 0.001, OR = ${faker.number.float({ min: 1.1, max: 5, fractionDigits: 2 })}).
  `;
  return createMockDocument({ content: `<p>${stats}</p>` });
}

export function createMockDocumentWithCitations(): MockDocument {
  const content = `
    Recent studies have shown promising results in this field (Smith et al., 2024).
    According to Jones and Williams (2023), the methodology requires careful consideration.
    Multiple authors have confirmed these findings [1-3].
    As noted by the World Health Organization (2024), early intervention is crucial.
  `;
  return createMockDocument({ content: `<p>${content}</p>` });
}

// ============================================================
// Reference Generators
// ============================================================

export function createMockReference(overrides?: Partial<MockReference>): MockReference {
  const authorCount = faker.number.int({ min: 1, max: 5 });
  return {
    id: faker.string.uuid(),
    type: 'article-journal',
    title: faker.lorem.sentence(),
    author: Array.from({ length: authorCount }, () => ({
      family: faker.person.lastName(),
      given: faker.person.firstName(),
    })),
    issued: { 'date-parts': [[faker.number.int({ min: 2000, max: 2024 })]] },
    'container-title': faker.company.name() + ' Journal',
    volume: String(faker.number.int({ min: 1, max: 100 })),
    issue: String(faker.number.int({ min: 1, max: 12 })),
    page: `${faker.number.int({ min: 1, max: 100 })}-${faker.number.int({ min: 101, max: 200 })}`,
    DOI: `10.${faker.number.int({ min: 1000, max: 9999 })}/${faker.string.alphanumeric(8)}`,
    abstract: faker.lorem.paragraph(),
    ...overrides,
  };
}

export function createMockBook(overrides?: Partial<MockReference>): MockReference {
  return createMockReference({
    type: 'book',
    publisher: faker.company.name(),
    'publisher-place': faker.location.city(),
    ISBN: faker.string.numeric(13),
    ...overrides,
  });
}

export function createMockConference(overrides?: Partial<MockReference>): MockReference {
  return createMockReference({
    type: 'paper-conference',
    'event-title': faker.lorem.words(5) + ' Conference',
    'event-place': faker.location.city(),
    ...overrides,
  });
}

// ============================================================
// Presentation Generators
// ============================================================

function createSlideContent(type: Slide['type']): SlideContent {
  const title = faker.lorem.sentence({ min: 3, max: 8 });

  if (type === 'title') {
    return {
      title,
      subtitle: faker.lorem.sentence(),
      author: faker.person.fullName(),
      institution: 'Test University',
      date: '2024',
    };
  }

  if (type === 'data-visualization') {
    return {
      title,
      chart: {
        type: 'bar',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{ label: 'Values', data: [10, 20, 30] }],
        },
        options: { title: 'Test Chart', showLegend: true },
      },
    };
  }

  if (type === 'references') {
    return {
      title: 'References',
      citations: [
        {
          id: faker.string.uuid(),
          authors: 'Smith et al.',
          year: 2024,
          title: 'Test Reference',
          journal: 'Test Journal',
          formatted: 'Smith et al. (2024). Test Reference. Test Journal.',
        },
      ],
    };
  }

  if (type === 'two-column') {
    return {
      title,
      leftContent: [
        { text: faker.lorem.sentence(), level: 0 },
        { text: faker.lorem.sentence(), level: 1 },
      ],
      rightContent: [
        { text: faker.lorem.sentence(), level: 0 },
        { text: faker.lorem.sentence(), level: 1 },
      ],
    };
  }

  return {
    title,
    bullets: [
      { text: faker.lorem.sentence(), level: 0 },
      { text: faker.lorem.sentence(), level: 0 },
      { text: faker.lorem.sentence(), level: 1 },
    ],
  };
}

export function createMockSlide(type: Slide['type'], overrides?: Partial<MockSlide>): MockSlide {
  const layout = type === 'title' || type === 'quote' || type === 'section-divider'
    ? 'centered'
    : type === 'two-column'
      ? 'split'
      : 'full';

  return {
    id: faker.string.uuid(),
    type,
    layout,
    order: 0,
    speakerNotes: faker.lorem.paragraph(),
    content: createSlideContent(type),
    ...overrides,
  };
}

export function createMockPresentation(overrides?: Partial<MockPresentation>): MockPresentation {
  const slides: MockSlide[] = [
    createMockSlide('title', { order: 0 }),
    createMockSlide('content', { order: 1 }),
    createMockSlide('data-visualization', { order: 2 }),
    createMockSlide('two-column', { order: 3 }),
    createMockSlide('references', { order: 4 }),
  ];

  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    title: faker.lorem.sentence(),
    theme: faker.helpers.arrayElement(['academic', 'dark', 'minimal']),
    slides,
    settings: {
      aspectRatio: '16:9',
      showSlideNumbers: true,
      showProgressBar: true,
      autoAdvance: false,
      autoAdvanceInterval: 30,
      transition: 'fade',
      transitionDuration: 300,
    },
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  };
}

// ============================================================
// Citation Test Data (for CSL tests)
// ============================================================

// Import citation types
import type { Reference, ReferenceAuthor, ReferenceDate } from '@/lib/citations/types';

export function createTestReference(overrides?: Partial<Reference>): Reference {
  return {
    id: `ref_${faker.string.uuid()}`,
    type: 'article-journal',
    title: 'Machine learning in medical diagnosis: A systematic review',
    authors: [
      { family: 'Smith', given: 'John', sequence: 'first' },
      { family: 'Johnson', given: 'Emily', sequence: 'additional' },
      { family: 'Williams', given: 'Robert', sequence: 'additional' },
    ],
    issued: { year: 2024, month: 3, day: 15 },
    identifiers: {
      doi: '10.1038/s41591-024-12345-6',
      pmid: '38123456',
      url: 'https://www.nature.com/articles/s41591-024-12345-6',
    },
    venue: {
      name: 'Nature Medicine',
      abbreviation: 'Nat Med',
      volume: '30',
      issue: '3',
      pages: '456-478',
    },
    abstract: 'This systematic review examines the application of machine learning in medical diagnosis.',
    keywords: ['machine learning', 'medical diagnosis', 'artificial intelligence'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export const citationTestData = {
  // Single author
  singleAuthor: createTestReference({
    authors: [{ family: 'Smith', given: 'John', sequence: 'first' }],
    issued: { year: 2024 },
  }),

  // Two authors
  twoAuthors: createTestReference({
    authors: [
      { family: 'Smith', given: 'John', sequence: 'first' },
      { family: 'Jones', given: 'Mary', sequence: 'additional' },
    ],
    issued: { year: 2023 },
  }),

  // Three authors
  threeAuthors: createTestReference({
    authors: [
      { family: 'Smith', given: 'John', sequence: 'first' },
      { family: 'Jones', given: 'Mary', sequence: 'additional' },
      { family: 'Williams', given: 'Bob', sequence: 'additional' },
    ],
    issued: { year: 2024 },
  }),

  // Many authors (6)
  manyAuthors: createTestReference({
    authors: Array.from({ length: 6 }, (_, i) => ({
      family: faker.person.lastName(),
      given: faker.person.firstName(),
      sequence: i === 0 ? 'first' as const : 'additional' as const,
    })),
    issued: { year: 2024 },
  }),

  // 100 authors
  hundredAuthors: createTestReference({
    authors: Array.from({ length: 100 }, (_, i) => ({
      family: faker.person.lastName(),
      given: faker.person.firstName(),
      sequence: i === 0 ? 'first' as const : 'additional' as const,
    })),
    issued: { year: 2024 },
  }),

  // No author
  noAuthor: createTestReference({
    authors: [],
    title: 'Annual report on global health statistics',
    issued: { year: 2024 },
  }),

  // No year
  noYear: createTestReference({
    issued: {} as ReferenceDate,
  }),

  // Missing title
  noTitle: createTestReference({
    title: '',
  }),

  // Unicode authors
  unicodeAuthors: createTestReference({
    authors: [
      { family: 'Müller', given: 'François', sequence: 'first' },
      { family: 'Østerberg', given: 'José', sequence: 'additional' },
      { family: '田中', given: '太郎', sequence: 'additional' },
    ],
    issued: { year: 2024 },
  }),

  // Very long title
  longTitle: createTestReference({
    title: 'A comprehensive systematic review and meta-analysis of the effectiveness of various machine learning algorithms in predicting cardiovascular disease outcomes in diverse patient populations across multiple healthcare settings worldwide with particular emphasis on implementation challenges and ethical considerations',
    issued: { year: 2024 },
  }),

  // Book
  book: createTestReference({
    type: 'book',
    title: 'Medical Statistics Made Easy',
    authors: [{ family: 'Harris', given: 'Michael', sequence: 'first' }],
    issued: { year: 2023 },
    publisher: {
      name: 'Oxford University Press',
      location: 'Oxford, UK',
      edition: '4th',
    },
    identifiers: {
      isbn: '978-0-19-123456-7',
    },
    venue: undefined,
  }),

  // Conference paper
  conference: createTestReference({
    type: 'paper-conference',
    title: 'Deep learning for radiology: Current applications and future directions',
    authors: [
      { family: 'Chen', given: 'Wei', sequence: 'first' },
      { family: 'Liu', given: 'Xiaoming', sequence: 'additional' },
    ],
    issued: { year: 2024, month: 6 },
    conference: {
      name: 'International Conference on Medical Imaging',
      location: 'Boston, MA',
    },
    venue: {
      name: 'Proceedings of ICMI 2024',
      pages: '123-135',
    },
  }),
};

// ============================================================
// Edge Case Generators
// ============================================================

export const edgeCases = {
  // Empty content
  emptyDocument: () => createMockDocument({
    content: '',
    wordCount: 0,
    title: '',
  }),

  // Very long document (simulates 50 pages)
  veryLongDocument: () => createMockDocument({
    content: Array.from({ length: 500 }, () => `<p>${faker.lorem.paragraph()}</p>`).join(''),
    wordCount: 50000,
  }),

  // Document with special characters
  specialCharDocument: () => createMockDocument({
    title: 'Test: "Quotes" & <HTML> © ™ ® emoji 🎉 🔬',
    content: `<p>Special characters: é, ü, ñ, ø, α, β, γ, Δ, 中文, العربية, עברית, 日本語</p>`,
  }),

  // Document with only whitespace
  whitespaceDocument: () => createMockDocument({
    content: '<p>   \n\t\r\n   </p>',
    wordCount: 0,
  }),

  // Reference with 100 authors
  referenceWith100Authors: () => createMockReference({
    author: Array.from({ length: 100 }, () => ({
      family: faker.person.lastName(),
      given: faker.person.firstName(),
    })),
  }),

  // Reference with no authors
  referenceNoAuthor: () => createMockReference({
    author: [],
    title: 'Anonymous Work',
  }),

  // Reference with no year
  referenceNoYear: () => createMockReference({
    issued: undefined,
  }),

  // Reference with missing fields
  referenceMinimal: () => ({
    id: faker.string.uuid(),
    type: 'article-journal',
    title: 'Minimal Reference',
    author: [],
  }),

  // Reference with unicode in names
  referenceUnicodeAuthors: () => createMockReference({
    author: [
      { family: 'Müller', given: 'François' },
      { family: 'Østerberg', given: 'José' },
      { family: '田中', given: '太郎' },
    ],
  }),

  // Presentation with no slides
  emptyPresentation: () => createMockPresentation({
    slides: [],
  }),

  // Slide with very long content
  longSlide: () => createMockSlide('content', {
    content: {
      title: 'Long Content Slide',
      bullets: Array.from({ length: 50 }, () => ({
        text: faker.lorem.sentence(),
        level: 0 as const,
      })),
    },
  }),

  // Document with malformed HTML
  malformedHtmlDocument: () => createMockDocument({
    content: '<p>Unclosed paragraph<div>Nested incorrectly</p></div><script>alert("xss")</script>',
  }),

  // Document with only numbers
  numericDocument: () => createMockDocument({
    content: '<p>123 456 789 0.001 1,234,567 10^6 1e-10</p>',
    wordCount: 8,
  }),

  // Very long title
  longTitleDocument: () => createMockDocument({
    title: faker.lorem.paragraphs(3),
  }),
};

// ============================================================
// Statistical Data Generators (for chart tests)
// ============================================================

export function createMockChartData(type: 'bar' | 'line' | 'pie' | 'scatter', points = 10) {
  switch (type) {
    case 'bar':
      return {
        labels: Array.from({ length: points }, (_, i) => `Category ${i + 1}`),
        datasets: [{
          label: 'Values',
          data: Array.from({ length: points }, () => faker.number.int({ min: 10, max: 100 })),
        }],
      };
    case 'line':
      return {
        labels: Array.from({ length: points }, (_, i) => `Week ${i + 1}`),
        datasets: [{
          label: 'Series A',
          data: Array.from({ length: points }, () => faker.number.int({ min: 0, max: 100 })),
        }],
      };
    case 'pie':
      return {
        labels: ['Group A', 'Group B', 'Group C', 'Group D'],
        data: [
          faker.number.int({ min: 10, max: 40 }),
          faker.number.int({ min: 10, max: 40 }),
          faker.number.int({ min: 10, max: 40 }),
          faker.number.int({ min: 10, max: 40 }),
        ],
      };
    case 'scatter':
      return Array.from({ length: points }, () => ({
        x: faker.number.float({ min: 0, max: 100 }),
        y: faker.number.float({ min: 0, max: 100 }),
      }));
  }
}

// ============================================================
// Text Samples for Analysis Tests
// ============================================================

export const textSamples = {
  // High readability (simple text)
  simple: `
    The cat sat on the mat. The dog ran in the park.
    Birds fly in the sky. Fish swim in the sea.
  `,

  // Low readability (complex text)
  complex: `
    The epistemological implications of quantum mechanical indeterminacy
    necessitate a fundamental reconceptualization of our ontological
    frameworks regarding causality and determinism in contemporary
    philosophical discourse.
  `,

  // Passive voice heavy
  passive: `
    The experiment was conducted by the researchers. The data was analyzed
    using statistical software. The results were published in a peer-reviewed
    journal. Significant differences were observed between the groups.
  `,

  // Active voice
  active: `
    Researchers conducted the experiment in controlled conditions.
    We analyzed the data using advanced statistical methods.
    The team published results in Nature Medicine.
    Participants demonstrated significant improvements.
  `,

  // AI-like text (predictable patterns)
  aiTypical: `
    In today's rapidly evolving landscape, it is important to note that
    this comprehensive analysis delves into the multifaceted aspects of
    this phenomenon. Furthermore, it is crucial to understand that various
    factors play a pivotal role in shaping these outcomes.
  `,

  // Human-like text (variable patterns)
  humanTypical: `
    I've been thinking about this problem differently lately.
    What if we're looking at it wrong? The data surprised me - honestly,
    I expected the opposite result. But science is like that sometimes.
  `,

  // With citations
  withCitations: `
    Recent advances in machine learning have revolutionized medical imaging
    (Smith et al., 2024). According to a meta-analysis by Jones and Williams
    (2023), diagnostic accuracy has improved by 23%. Multiple studies [1-5]
    confirm these findings, though some researchers (Brown, 2024) urge caution.
  `,

  // With statistics
  withStats: `
    Our randomized controlled trial (n = 450) demonstrated significant
    improvement in the treatment group. The primary outcome showed a
    34% reduction in symptoms (95% CI: 28-40%, p < 0.001). Effect size
    was large (Cohen's d = 0.82). The NNT was 4.2.
  `,
};

// ============================================================
// BibTeX Samples for Import Tests
// ============================================================

export const bibtexSamples = {
  valid: `
@article{smith2024ai,
  author = {Smith, John and Jones, Mary and Williams, Bob},
  title = {Artificial Intelligence in Healthcare: A Systematic Review},
  journal = {Nature Medicine},
  year = {2024},
  volume = {30},
  number = {1},
  pages = {45--67},
  doi = {10.1038/s41591-024-01234-5}
}

@book{johnson2023methods,
  author = {Johnson, Alice},
  title = {Research Methods in Medical Informatics},
  publisher = {Springer},
  year = {2023},
  address = {New York},
  edition = {3rd}
}
`,

  withLatexEscapes: `
@article{muller2024german,
  author = {M{\\"u}ller, Fran{\\c{c}}ois and {\\O}sterberg, Jos{\\'e}},
  title = {Ein deutscher Artikel {\\"{u}}ber Forschung},
  journal = {Zeitschrift f{\\"u}r Wissenschaft},
  year = {2024}
}
`,

  malformed: `
@article{broken
  author = Smith, John
  title = Missing braces and commas
  year = 2024
}
`,

  empty: '',
};

// ============================================================
// RIS Samples for Import Tests
// ============================================================

export const risSamples = {
  valid: `
TY  - JOUR
AU  - Smith, John
AU  - Jones, Mary
TI  - AI in Healthcare
JO  - Nature Medicine
PY  - 2024
VL  - 30
IS  - 1
SP  - 45
EP  - 67
DO  - 10.1038/s41591-024-01234-5
ER  -
`,

  book: `
TY  - BOOK
AU  - Johnson, Alice
TI  - Research Methods
PB  - Springer
PY  - 2023
CY  - New York
ER  -
`,
};
