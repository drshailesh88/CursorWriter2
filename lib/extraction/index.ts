export {
  // Types
  type ExtractionSchema,
  type ExtractionField,
  type ExtractionResult,
  type ExtractedField,
  type ExtractionTableRow,
  type BatchExtractionResult,
  type PaperInput,
  type CustomExtractionRequest,

  // Built-in schemas
  CLINICAL_TRIAL_SCHEMA,
  SYSTEMATIC_REVIEW_SCHEMA,
  GENERAL_RESEARCH_SCHEMA,
  BUILTIN_SCHEMAS,

  // Functions
  extractFromPaper,
  batchExtract,
  generateSchemaFromInstruction,
  instructionExtract,
} from './structured-extractor';
