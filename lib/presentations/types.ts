/**
 * Presentation Generator - Core Type Definitions
 * Phase 7A: Foundation Types
 */


// ============================================================================
// SLIDE TYPES
// ============================================================================

export type SlideType =
  | 'title'
  | 'content'
  | 'data-visualization'
  | 'comparison'
  | 'process'
  | 'image'
  | 'quote'
  | 'timeline'
  | 'section-divider'
  | 'references'
  | 'qa'
  | 'two-column';

export type LayoutType =
  | 'full'
  | 'left-heavy'
  | 'right-heavy'
  | 'split'
  | 'centered'
  | 'grid';

// ============================================================================
// CHART TYPES
// ============================================================================

export type ChartType =
  | 'bar'
  | 'horizontal-bar'
  | 'stacked-bar'
  | 'line'
  | 'multi-line'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'bubble'
  | 'box-plot'
  | 'area';

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
  // Optional explicit points for scatter/bubble-style charts.
  points?: Array<{ x: number; y: number; label?: string; size?: number }>;
}

export interface ChartOptions {
  title?: string;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  showGrid?: boolean;
  stacked?: boolean;
  aspectRatio?: number;
  showTrendLine?: boolean; // For scatter/bubble charts
}

export interface ChartConfig {
  type: ChartType;
  data: ChartData;
  options: ChartOptions;
  source?: string; // Citation for data source
}

// ============================================================================
// FLOWCHART TYPES
// ============================================================================

export type FlowNodeType = 'process' | 'decision' | 'terminal' | 'data' | 'connector';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  metadata?: {
    count?: number;
    note?: string;
    color?: string;
  };
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'default' | 'smoothstep' | 'step';
}

export interface FlowchartConfig {
  nodes: FlowNode[];
  edges: FlowEdge[];
  layout: 'TB' | 'LR' | 'BT' | 'RL'; // Top-Bottom, Left-Right, etc.
}

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface TableCell {
  content: string;
  colSpan?: number;
  rowSpan?: number;
  isHeader?: boolean;
  align?: 'left' | 'center' | 'right';
  highlight?: boolean;
}

export interface TableRow {
  cells: TableCell[];
  isHeader?: boolean;
}

export interface TableConfig {
  rows: TableRow[];
  caption?: string;
  striped?: boolean;
  bordered?: boolean;
}

// ============================================================================
// SLIDE CONTENT
// ============================================================================

export interface BulletPoint {
  text: string;
  level: 0 | 1 | 2;
  icon?: string;
}

export interface QuoteConfig {
  text: string;
  author?: string;
  source?: string;
  year?: number;
}

export interface ImageConfig {
  src: string;
  alt: string;
  caption?: string;
  fit?: 'contain' | 'cover' | 'fill';
}

export interface TimelineItem {
  date: string;
  title: string;
  description?: string;
  highlight?: boolean;
}

export interface TimelineConfig {
  items: TimelineItem[];
  orientation: 'horizontal' | 'vertical';
}

export interface CitationReference {
  id: string;
  authors: string;
  year: number;
  title: string;
  journal?: string;
  formatted: string; // Pre-formatted citation string
}

export interface SlideContent {
  // Common fields
  title?: string;
  subtitle?: string;

  // Content slide
  bullets?: BulletPoint[];

  // Data visualization
  chart?: ChartConfig;

  // Comparison/table
  table?: TableConfig;

  // Process/flowchart
  flowchart?: FlowchartConfig;

  // Image
  image?: ImageConfig;

  // Quote
  quote?: QuoteConfig;

  // Timeline
  timeline?: TimelineConfig;

  // Two-column layout
  leftContent?: BulletPoint[];
  rightContent?: BulletPoint[];

  // References slide
  citations?: CitationReference[];

  // Title slide specific
  author?: string;
  institution?: string;
  date?: string;

  // Section divider
  sectionNumber?: number;
}

// ============================================================================
// ANIMATION TYPES
// ============================================================================

export type AnimationType =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom'
  | 'none';

export interface Animation {
  type: AnimationType;
  duration: number; // milliseconds
  delay?: number;
  element?: string; // CSS selector for specific element
}

// ============================================================================
// SLIDE
// ============================================================================

export interface Slide {
  id: string;
  type: SlideType;
  layout: LayoutType;
  content: SlideContent;
  speakerNotes: string;
  animations?: Animation[];
  order: number;
  backgroundColor?: string;
  backgroundImage?: string;
}

// ============================================================================
// THEME TYPES
// ============================================================================

export type ThemeId =
  | 'academic'
  | 'dark'
  | 'minimal'
  | 'medical'
  | 'tech'
  | 'humanities'
  | 'nature';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  chart: string[]; // Color palette for charts (5-7 colors)
  success: string;
  warning: string;
  error: string;
}

export interface ThemeFonts {
  heading: string;
  body: string;
  mono: string;
}

export interface ThemeSpacing {
  slidePadding: number;
  elementGap: number;
  bulletIndent: number;
}

export interface ThemeStyles {
  headingWeight: number;
  borderRadius: number;
  shadowIntensity: number;
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  styles: ThemeStyles;
}

// ============================================================================
// PRESENTATION SETTINGS
// ============================================================================

export interface PresentationSettings {
  aspectRatio: '16:9' | '4:3';
  showSlideNumbers: boolean;
  showProgressBar: boolean;
  autoAdvance: boolean;
  autoAdvanceInterval: number; // seconds
  transition: AnimationType;
  transitionDuration: number;
}

// ============================================================================
// PRESENTATION
// ============================================================================

export interface Presentation {
  id: string;
  userId: string;
  documentId?: string; // Source document if generated from doc
  title: string;
  description?: string;
  theme: ThemeId;
  slides: Slide[];
  settings: PresentationSettings;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// GENERATION TYPES
// ============================================================================

export type PresentationFormat = 'conference' | 'lecture' | 'poster' | 'pitch';

export interface GenerationOptions {
  includeMethodology: boolean;
  emphasizeFindings: boolean;
  includeAllCitations: boolean;
  generateVisualizations: boolean;
  targetSlideCount?: number;
  focusAreas?: string[];
}

export interface GenerationConfig {
  source: 'document' | 'text' | 'topic';
  sourceId?: string;
  sourceText?: string;
  format: PresentationFormat;
  theme: ThemeId;
  options: GenerationOptions;
  model?: string;
}

// ============================================================================
// CONTENT EXTRACTION TYPES
// ============================================================================

export interface DataPattern {
  type: 'percentage' | 'comparison' | 'pValue' | 'sampleSize' | 'effectSize' | 'trend';
  value: string;
  context: string;
  position: { start: number; end: number };
}

export interface ExtractedCitation {
  id: string;
  authors: string[];
  year: number;
  title: string;
  journal?: string;
  doi?: string;
  inTextFormat: string;
}

export interface DocumentSection {
  heading: string;
  level: 1 | 2 | 3;
  content: string;
  bulletPoints: string[];
  hasData: boolean;
  dataPatterns: DataPattern[];
  citations: ExtractedCitation[];
}

export interface KeyFinding {
  text: string;
  confidence: number;
  supportingData?: string;
  citations: string[];
  visualizationPotential: ChartType | null;
}

export interface ContentExtraction {
  title: string;
  authors: string[];
  abstract: string;
  sections: DocumentSection[];
  keyFindings: KeyFinding[];
  methodology: string;
  conclusions: string[];
  citations: ExtractedCitation[];
  wordCount: number;
  estimatedReadingTime: number;
}

// ============================================================================
// STRUCTURE ANALYSIS TYPES
// ============================================================================

export type SlidePriority = 'essential' | 'important' | 'optional';

export interface SlideBlueprint {
  type: SlideType;
  layout: LayoutType;
  contentSource: string; // Reference to document section or finding
  suggestedTitle: string;
  estimatedTime: number; // seconds for presenting
  priority: SlidePriority;
  visualizationType?: ChartType | 'flowchart' | 'table';
}

export interface SlideSection {
  name: string;
  slides: SlideBlueprint[];
  transition?: string;
}

export interface PresentationStructure {
  totalSlides: number;
  sections: SlideSection[];
  suggestedDuration: number; // minutes
  contentDensity: 'light' | 'medium' | 'dense';
}

// ============================================================================
// VISUALIZATION DETECTION TYPES
// ============================================================================

export interface VisualizationOpportunity {
  sourceText: string;
  type: ChartType | 'flowchart' | 'table';
  confidence: number;
  extractedData: DataPoint[];
  suggestedConfig: Partial<ChartConfig> & Partial<FlowchartConfig> & Partial<TableConfig>;
  position: { start: number; end: number };
}

export interface DataPoint {
  label: string;
  value: number;
  unit?: string;
  category?: string;
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type ExportFormat = 'pptx' | 'pdf' | 'html' | 'png';

export interface ExportOptions {
  format: ExportFormat;
  includeNotes: boolean;
  includeAnimations: boolean;
  quality?: 'draft' | 'standard' | 'high';
  pageSize?: 'letter' | 'a4';
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  url?: string;
  error?: string;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface GeneratePresentationRequest {
  config: GenerationConfig;
}

export interface GeneratePresentationResponse {
  presentationId: string;
  slides: Slide[];
  metadata: {
    generationTime: number;
    model: string;
    sourceWordCount: number;
  };
}

export interface RegenerateSlideRequest {
  presentationId: string;
  slideId: string;
  instruction?: string;
}

export interface ExportPresentationRequest {
  presentationId: string;
  options: ExportOptions;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface PresentationEditorState {
  presentation: Presentation | null;
  selectedSlideIndex: number;
  isGenerating: boolean;
  isExporting: boolean;
  isSaving: boolean;
  previewMode: boolean;
  presenterMode: boolean;
  showAIAssist: boolean;
  showSpeakerNotes: boolean;
  zoomLevel: number;
  undoStack: Presentation[];
  redoStack: Presentation[];
}

export interface GenerationProgress {
  stage: 'extracting' | 'analyzing' | 'generating' | 'rendering' | 'complete';
  progress: number; // 0-100
  currentSlide?: number;
  totalSlides?: number;
  message: string;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  aspectRatio: '16:9',
  showSlideNumbers: true,
  showProgressBar: true,
  autoAdvance: false,
  autoAdvanceInterval: 30,
  transition: 'fade',
  transitionDuration: 300,
};

export const FORMAT_SLIDE_TARGETS: Record<PresentationFormat, { min: number; max: number; duration: number }> = {
  conference: { min: 10, max: 15, duration: 15 },
  lecture: { min: 30, max: 45, duration: 45 },
  poster: { min: 1, max: 1, duration: 0 },
  pitch: { min: 5, max: 10, duration: 5 },
};
