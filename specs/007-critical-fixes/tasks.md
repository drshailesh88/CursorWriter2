# Tasks: Critical Fixes

**Feature ID:** 007
**Status:** Complete

## Legend
- [ ] Not Started
- [~] In Progress
- [x] Done
- [⏭️] Deferred

## Phase 1: Critical Runtime Bugs
- [x] T001 Fix research stream race condition - added isExecuting guard + complete/error check to EngineSession.executeSession()
- [x] T002 PDF processing silent failure - ALREADY FIXED in audit remediation (processInBackground has try/catch with updatePaperStatus error)

## Phase 2: Security Hardening
- [x] T003 Add auth to /api/presentations/export-pptx - resolveApiUser() added
- [x] T004 Add auth to /api/presentations/ai-assist - resolveApiUser() added
- [x] T005 Add auth to /api/chat - resolveApiUser() added, handler signature updated to NextRequest
- [x] T006 Add auth to /api/ai-writing - resolveApiUser() added, handler signature updated to NextRequest

## Phase 3: Incomplete Features
- [x] T007 Implement knowledge map by paper IDs - new generateMapFromPapers() function, route updated to support both topic and paperIds

## Phase 4: Dead Code Cleanup
- [x] T008 Remove legacy /api/research/stream placeholder + lib/research/stream-utils.ts (both deleted)
- [x] T009 Cohere reranking - NOT dead code; properly implemented with graceful fallback when no COHERE_API_KEY. No change needed.

## Phase 5: Real-time Collaboration
- [x] T010 Added error handling to subscribeToComments() and subscribeToTrackedChanges() - try/catch + CHANNEL_ERROR status callback
- [⏭️] T011 Skipped tests remain skipped - written for Firebase onSnapshot pattern, would need full rewrite for Supabase postgres_changes

## Phase 6: Verification
- [x] T012 Type-check: PASS (npx tsc --noEmit)
- [x] T013 Test suite: PASS (1822 passed, 12 skipped, 0 failures)
- [x] T014 Build: PASS (npm run build)
- [x] T015 Updated handover.json and TRACKING.md
