# Specification: Critical Fixes & Incomplete Features

**Feature ID:** 007
**Date:** 2026-02-09
**Status:** In Progress

## Overview

Address all broken, incomplete, or improperly wired features identified during the comprehensive codebase audit. Every fix must be verified by type-check, tests, and build.

## Scope Items

### F007.1 Research Stream Race Condition (CRITICAL)
**File:** `app/api/research/[sessionId]/stream/route.ts`
**Problem:** `executeSession()` is called every time a client connects to the SSE stream. Multiple connections (page refresh, two tabs) trigger duplicate parallel research execution, corrupting results.
**Fix:** Guard execution with an `isExecuting` flag or session status check. Only execute if the session hasn't already started.

### F007.2 PDF Processing Silent Failure (CRITICAL)
**File:** `app/api/papers/upload/route.ts`
**Problem:** Background processing is fire-and-forget (`async` without `await`). If extraction fails, the paper stays stuck in "processing" forever with no error feedback to the user.
**Fix:** Catch errors in the background processor and update the paper status to 'error' with an error message. Ensure the client can see the failure.

### F007.3 Auth Gaps on Export/Chat Routes (CRITICAL)
**Files:**
- `app/api/presentations/export-pptx/route.ts` - No auth
- `app/api/presentations/ai-assist/route.ts` - No auth
- `app/api/chat/route.ts` - No auth
- `app/api/ai-writing/route.ts` - No auth
**Problem:** These endpoints are publicly accessible. Anyone can burn through API keys or export other users' presentations.
**Fix:** Add `resolveApiUser()` auth checks to all four routes.

### F007.4 Knowledge Map by Paper IDs (INCOMPLETE)
**File:** `app/api/discovery/map/route.ts`
**Problem:** The paperIds-based map generation path returns an error with a TODO comment. Only topic-based maps work.
**Fix:** Implement the paperIds path by fetching paper metadata and feeding it to the knowledge map generator.

### F007.5 Legacy Research Stream Endpoint (DEAD CODE)
**File:** `app/api/research/stream/route.ts`
**Problem:** Placeholder endpoint with TODO comments, heartbeat only, no actual connection to research engine.
**Fix:** Remove this dead endpoint entirely. The real streaming happens via `/api/research/[sessionId]/stream`.

### F007.6 Cohere Reranking Dead Code (DEAD CODE)
**File:** `app/api/papers/chat/route.ts`
**Problem:** Code checks for `COHERE_API_KEY` but the reranker never executes. Dead code path misleads users.
**Fix:** Remove the dead Cohere references, or implement actual reranking if the library is available.

### F007.7 Real-time Collaboration Verification
**Problem:** 18 tests are skipped for comments and track-changes real-time subscriptions. The feature may not work end-to-end.
**Fix:** Investigate whether real-time subscriptions work in production, fix if broken, and enable at least some of the skipped tests.

## Acceptance Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run test:run` passes (no new failures)
- [ ] `npm run build` succeeds
- [ ] All 7 scope items verified
- [ ] handover.json updated with outcomes
