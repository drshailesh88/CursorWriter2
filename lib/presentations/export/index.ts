/**
 * Presentation Generator - Export Module
 * Phase 7: Central export for all presentation export functionality
 *
 * @module presentations/export
 *
 * @description
 * Export presentations to various formats including PPTX and PDF.
 *
 * @example PPTX Export
 * ```typescript
 * import { exportAndDownloadPptx } from '@/lib/presentations/export';
 *
 * // Export with default options
 * await exportAndDownloadPptx(presentation);
 *
 * // Export with custom options
 * await exportAndDownloadPptx(presentation, {
 *   includeNotes: true,
 *   includeSlideNumbers: true,
 *   author: 'Dr. Jane Smith',
 *   company: 'University Medical Center',
 * });
 * ```
 *
 * @example PDF Export
 * ```typescript
 * import { exportAndDownloadPdf } from '@/lib/presentations/export';
 *
 * // Export with default options
 * await exportAndDownloadPdf(presentation);
 *
 * // Export with custom options
 * await exportAndDownloadPdf(presentation, {
 *   includeNotes: true,
 *   includeSlideNumbers: true,
 *   notesOnSeparatePages: true,
 *   pageSize: 'letter',
 *   orientation: 'landscape',
 * });
 * ```
 *
 * @example Getting Blob for Custom Handling
 * ```typescript
 * import { exportToPptx, exportToPdf } from '@/lib/presentations/export';
 *
 * // Get PPTX blob
 * const pptxBlob = await exportToPptx(presentation, options);
 *
 * // Get PDF blob
 * const pdfBlob = await exportToPdf(presentation, options);
 *
 * // Upload to server or process further
 * await uploadToServer(pptxBlob);
 * ```
 *
 * @note PPTX Export Requirements
 * For full PPTX functionality, install pptxgenjs:
 * ```bash
 * npm install pptxgenjs --legacy-peer-deps
 * ```
 *
 * If pptxgenjs is not installed, a fallback message will be provided.
 * PDF export works out of the box with jspdf.
 */

// PPTX Export - Lazy loaded to avoid bundling Node.js dependencies in client
// Use dynamic import: const { exportToPptx } = await import('@/lib/presentations/export/pptx-export');
export type { PptxExportOptions } from './pptx-export';

// PDF Export
export {
  exportToPdf,
  exportAndDownloadPdf,
  type PdfExportOptions,
} from './pdf-export';

// Re-export types for convenience
export type { ExportFormat, ExportOptions, ExportResult } from '../types';
