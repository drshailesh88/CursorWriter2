# Implementation Plan: Critical Fixes

**Feature ID:** 007
**Date:** 2026-02-09

## Strategy

Ralph-style iterative loop per fix:
1. Read the broken code
2. Implement minimal correct fix
3. Verify with type-check
4. Run targeted tests
5. Update tracking
6. Move to next fix

## Workstreams

### W1: Critical Runtime Bugs (F007.1, F007.2)
- Guard research stream execution with session status check
- Add error handling to PDF background processing with status update

### W2: Security Hardening (F007.3)
- Add `resolveApiUser()` to export-pptx, ai-assist, chat, ai-writing routes
- Follow existing pattern from papers/research routes

### W3: Incomplete Features (F007.4)
- Implement knowledge map generation from paper IDs
- Fetch paper metadata, extract topics, feed to existing map generator

### W4: Dead Code Cleanup (F007.5, F007.6)
- Remove legacy `/api/research/stream` placeholder
- Clean up dead Cohere reranking references

### W5: Real-time Verification (F007.7)
- Investigate real-time subscription wiring
- Fix any issues found
- Enable skipped tests where possible

## Verification Gates

- Gate A: `npx tsc --noEmit` after each workstream
- Gate B: `npm run test:run` after W1-W5
- Gate C: `npm run build` after all workstreams
- Gate D: Browser automation smoke test
