---
name: PKB build state
description: What was built for the Pole Knowledge Base tasks (#18–#28) and the Photo-to-Job Pole Filler, key schema quirks, and what's still pending.
---

## Status
Tasks #18–#28 are substantially implemented. Photo-to-Job Pole Filler is fully implemented and tested.

## Photo-to-Job Pole Filler (new feature, Aug 2026)
- DB table: `pole_analyses` — stores original photo (base64, immutable), GPS, OCR, AI proposals, confirmation, audit log
- API routes in `artifacts/api-server/src/routes/pole-capture.ts` (registered in routes/index.ts):
  - POST /api/pole-capture/analyze — accepts photo + GPS, fires OpenAI Vision (gpt-4o) in background, returns {id, status:"analyzing"}
  - GET  /api/pole-capture/recent — recent analyses for company (7 days)
  - GET  /api/pole-capture/:id — get single analysis (polls until status != "analyzing")
  - POST /api/pole-capture/:id/confirm — foreman confirms fields, creates/updates draft report
  - POST /api/pole-capture/:id/retry — resets error analyses to "analyzing" and re-runs
- Pure business logic extracted to `artifacts/api-server/src/lib/pole-capture-logic.ts` — all testable without DB
- 43 unit tests in `artifacts/api-server/src/__tests__/pole-capture.test.ts` — all pass (vitest)
- Frontend: `/pole-capture` (capture entry page) and `/pole-capture/:id` (review page)
- Dashboard: "Take Pole Photo" primary CTA card (primary color, AI badge, camera icon)
- Routes added to App.tsx at /pole-capture and /pole-capture/:id

## Confirmation gate
- Nothing written to report until foreman presses "Confirm Pole Analysis"
- Cross-company guard: project.companyId must === analysis.companyId
- Cannot confirm if status != "pending" (blocks double-confirm, analyzing, error)
- Cannot confirm if completed report already exists today for that project
- Duplicate gate: same pole tag + company + today → 409 with duplicateAnalysisId in response
- Already-confirmed is idempotent: returns {reportId, alreadyConfirmed: true}

## Scoring algorithm (scoreProjects in logic module)
- Pole tag hit in recent reports: +0.55 (method="pole_tag")
- Draft report for project today: +0.35 (method="schedule")
- Project status=="active": +0.10
- Capped at 0.99, threshold 0.05 to appear in candidates
- Returns sorted descending; caller slices to 5

## PKB schema quirks
- `daily_reports` has `work_package_id` integer column (added)
- `pkb_version_status` enum in pkb-pole-types.ts; all other PKB tables import it
- `pkb_import_jobs`: fileName (required), insertedCount, updatedCount, skippedCount, errorCount, results (JSONB), status enum: "pending|processing|completed|failed" (NOT "complete")

## API routes
- PKB CRUD at `/pkb/...` → mounted at `/api` → full path `/api/pkb/...`
- Billing suggestion/validation routes in pkb.ts may have double `/api` prefix issue — check before use

## OpenAI integration
- Provisioned via setupReplitAIIntegrations; AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY set
- Template packages in lib/integrations-openai-ai-server/ and lib/integrations-openai-ai-react/
- Vision model in pole-capture: gpt-4o (standard), NOT gpt-5.6-luna

## Test infrastructure
- Vitest installed in artifacts/api-server (devDependency)
- `pnpm test` runs vitest in api-server
- Tests are pure (no DB mock needed) — business logic extracted to lib/pole-capture-logic.ts

## Known incomplete items
- Mobile billing button on report detail: inside hidden md:flex → not visible on mobile
- Training examples section labeled "Configuration Validation" in PKB sidebar — naming mismatch
- Visual references thumbnails show placeholder (by design, full image on lightbox click)
- No UI entry point to call /api/pkb/analyze from photo step (vision analyze for PKB training)
- CSV import silently skips conflicts with no warning
