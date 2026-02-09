# Feature Specification: Full Audit Remediation

**Feature Branch**: `006-audit-remediation`
**Created**: 2026-02-09
**Status**: In Progress (Final type-check cleanup pending)

## Objective

Resolve all critical and high-impact issues discovered during deep audit so the platform is secure, functional, and test-verifiable.

## Problem Statement

The codebase currently has:
- UI controls present but not wired end-to-end.
- Discovery tabs with placeholder adapters causing low-value output.
- API authorization/ownership gaps across papers, presentations, and research sessions.
- Test and type-check drift reducing release confidence.
- Build fragility due remote font dependency.

## Scope

### F006.1 UX Wiring Corrections
- Ensure editor collaboration/version controls receive required `documentId`.
- Wire Deep Research modal actions (`Cancel research`, `View Results`).
- Complete actionable Discovery callbacks and remove dead button behavior.

### F006.2 API Security and Ownership
- Enforce authenticated user identity for sensitive routes.
- Validate resource ownership before read/update/delete operations.
- Reject cross-user access regardless of client-provided `userId`.

### F006.3 Discovery Data Adapter Completion
- Hydrate recommendation and connection views with real paper metadata.
- Replace placeholder title/author/year transforms with resolved values.
- Ensure connector actions can add intermediate papers and open paper context.

### F006.4 Test and Type Reliability
- Fix top failing tests and mock drift (Supabase/env/export DOM).
- Restore meaningful `npm run type-check` and `npm run test:run` signal.

### F006.5 Build Stability
- Remove hard dependency on runtime network for base font loading.

## Acceptance Criteria

- [x] All previously identified dead buttons have active handlers.
- [x] Unauthorized access to papers/presentations/research sessions is blocked server-side.
- [x] Discovery recommendations/connector render with resolved paper metadata.
- [x] `npm run type-check` passes or has a documented, reduced blocker list.
- [x] `npm run test:run` failure count is materially reduced with root causes documented.
- [x] `npm run build` succeeds in restricted-network environments.

## Non-Goals

- Re-architecting unrelated product areas.
- Cosmetic-only UI redesign.
- Introducing new third-party dependencies unless strictly required.
