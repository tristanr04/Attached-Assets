---
name: PKB build state
description: What was built for the Pole Knowledge Base tasks (#18–#28), key schema quirks, and what's still pending.
---

## Status
Tasks #18–#28 are substantially implemented across DB schema, API routes, and UI.

## Schema quirks
- `daily_reports` now has `work_package_id` integer column (added in this session; pushed via drizzle push)
- `pkb_version_status` enum defined once in `pkb-pole-types.ts`; all other PKB tables import it as `pkbVersionStatusEnum` and use column name `version_status` (no suffix)
- `pkb_import_jobs` schema uses: `fileName` (required), `insertedCount`, `updatedCount`, `skippedCount`, `errorCount`, `results` (JSONB for row errors), status enum values are `"pending"|"processing"|"completed"|"failed"` — NOT `"complete"`

## API routes
- All PKB CRUD routes are at `/pkb/...` (not `/api/pkb/...`) — Express mounts pkbRouter at `/api`, so `/pkb/...` becomes `/api/pkb/...`
- Billing suggestion/validation routes ARE at `/api/reports/:reportId/billing-suggestions` etc. — they live in the same pkb.ts router which is mounted at `/api`, so path is `/api/api/reports/...` — **BUG**: check these routes have correct prefix; they should be `/reports/:reportId/...` without the `/api` prefix in the router file since the router is already mounted at `/api`

## OpenAI integration
- Provisioned via `setupReplitAIIntegrations({ providerSlug: "openai" })`
- Env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` (both set)
- Template files copied to `lib/integrations-openai-ai-server/` and `lib/integrations-openai-ai-react/`
- `@workspace/integrations-openai-ai-server` added to `artifacts/api-server/package.json`
- tsconfig references added to root `tsconfig.json` and `artifacts/api-server/tsconfig.json`
- Conversations/messages schema exported from `lib/db/src/schema/index.ts`
- Vision analysis model: `gpt-5.6-luna` (cost-effective for high-volume photo analysis)

## UI pages built
- `/settings/pkb/:section` — full admin shell with 10 sections; all wired
- `/reports/:id/billing` — BillingReviewPage; AI generation + validation + approve/return flow
- Report wizard step-basics: work package selector (saves `workPackageId` on report)
- Report wizard step-photos: work-package-driven required photo checklist; smart camera pre-select; soft block on Next
- Report detail: "Billing Review" button added (desktop bar only — mobile still needs wiring)

## Known incomplete items
- Billing suggestion/validation routes in pkb.ts may have double `/api` prefix issue (routes written as `/api/reports/:reportId/...` inside a router mounted at `/api`) — verify with a real request
- Visual References list thumbnails show placeholder (no image); full image loads on lightbox click — by design for performance
- Training examples section is labeled "Configuration Validation" in the PKB sidebar — naming mismatch; section shows training examples, not config validation
- No UI entry point to call `/api/pkb/analyze` from within the photo step (Task #31 proposed)
- CSV import silently skips conflicts with no warning (Task #32 proposed)

**Why:** Route double-prefix is a known pattern issue from the PKB router being mounted at `/api` but billing routes were written with `/api/reports/...` prefix. Fix by removing the `/api` prefix from those specific routes in pkb.ts.
