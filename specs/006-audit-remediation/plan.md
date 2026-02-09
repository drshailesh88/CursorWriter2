# Implementation Plan: Full Audit Remediation

**Feature ID:** 006
**Date:** 2026-02-09

## Strategy

Follow a Ralph-style iterative loop per batch:
1. Reproduce issue
2. Implement minimal correct fix
3. Verify with focused tests
4. Update tracking artifacts
5. Move to next batch

## Workstreams

### W1: UX and Wiring
- Wire `documentId` into editor in all layout paths.
- Connect Deep Research modal actions to real context behavior.
- Implement missing Discovery callbacks and metadata hydration path.

### W2: Security Hardening
- Add reusable server auth helper for API routes.
- Enforce ownership checks in papers routes.
- Enforce ownership checks in presentations routes.
- Enforce session ownership checks in research session routes.

### W3: Test Stabilization
- Fix broken mock exports and env assumptions in tests.
- Fix test type drift and failing expectations from API/security behavior changes.
- Re-run targeted suites before full suite.

### W4: Build Reliability
- Remove `next/font/google` dependency in root layout.
- Keep typography variable compatibility with existing Tailwind config.

## Verification Gates

- Gate A: `npx tsc --noEmit` after W1+W2.
- Gate B: `vitest` targeted suites after each sub-batch.
- Gate C: `npm run build` after W4.
- Gate D: final `npm run test:run` summary.
