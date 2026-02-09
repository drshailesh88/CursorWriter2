# Tasks: Full Audit Remediation

**Feature ID:** 006
**Status:** Complete

## Legend
- [ ] Not Started
- [~] In Progress
- [x] Done

## Phase R0: Tracking Setup
- [x] T001 Create `specs/006-audit-remediation/{spec,plan,tasks}.md`
- [x] T002 Update `specs/TRACKING.md` with Feature 006 status

## Phase R1: UX Blockers
- [x] T003 Pass `documentId` to `AcademicEditor` in desktop layout
- [x] T004 Pass `documentId` to `AcademicEditor` in mobile layout
- [x] T005 Wire Deep Research `Cancel research` button
- [x] T006 Wire Deep Research `View Results` action
- [x] T007 Complete Discovery recommendation metadata mapping
- [x] T008 Complete Discovery connector metadata mapping and callbacks

## Phase R2: API Security
- [x] T009 Add shared API auth helper
- [x] T010 Enforce auth and ownership in `app/api/papers/route.ts`
- [x] T011 Enforce auth and ownership in `app/api/papers/[paperId]/route.ts`
- [x] T012 Enforce auth and ownership in `app/api/papers/upload/route.ts`
- [x] T013 Enforce auth and ownership in `app/api/papers/chat/route.ts`
- [x] T014 Enforce auth and ownership in `app/api/papers/extract/route.ts`
- [x] T015 Enforce auth and ownership in `app/api/presentations/route.ts`
- [x] T016 Enforce auth and ownership in `app/api/presentations/generate/route.ts`
- [x] T017 Enforce ownership in `app/api/research/[sessionId]/*` routes
- [x] T018 Validate user ownership in `app/api/research/route.ts` session creation path

## Phase R3: Reliability
- [x] T019 Fix top type-check failures introduced by drift/mocks
- [x] T020 Fix top failing vitest suites (Supabase/client/export)
- [x] T021 Remove network-dependent Google font in `app/layout.tsx`
- [x] T022 Preserve Tailwind sans variable compatibility

## Phase R4: Verification and Handover
- [x] T023 Run `npx tsc --noEmit`
- [x] T024 Run targeted vitest suites, then full `npm run test:run`
- [x] T025 Run `npm run build`
- [x] T026 Update `specs/TRACKING.md` and `handover.json` with outcomes
