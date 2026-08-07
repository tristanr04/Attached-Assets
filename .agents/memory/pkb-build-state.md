---
name: PKB build state
description: What was built for the Pole Knowledge Base tasks (#18–#28) and the Photo-to-Job Pole Filler + Pole Identity Engine, key schema quirks, and what's still pending.
---

## Status
Tasks #18–#28 are substantially implemented. Photo-to-Job Pole Filler + Pole Identity Engine are fully implemented and tested (102 tests passing).

## Pole Identity Engine (new feature, Aug 2026)
- DB tables: `pole_assets` (company-scoped pole registry), `pole_reference_photos` (verified reference photos with visual descriptions)
- `pole_analyses` now has: `poleAssetId` (FK to pole_assets) and `identityResult` (jsonb with full engine output)
- Pure engine logic in `artifacts/api-server/src/lib/pole-identity-engine.ts` — zero DB dependencies
- 59 tests in `artifacts/api-server/src/__tests__/pole-identity-engine.test.ts` — all pass

### Identity Engine signals (in priority order):
1. OCR exact match (pole number or utilityTag): +0.55
2. GPS proximity: <5m→+0.90, <20m→+0.70, <50m→+0.45, <100m→+0.20, <200m→+0.08
3. Visual fingerprint (Jaccard on keyword descriptions): 0–+0.40
4. Reference photo count boost: 0.01 per photo, capped at 0.05

### Decision thresholds:
- "identified": top ≥ 0.75 AND margin over 2nd ≥ 0.20 → auto-select (safe)
- "uncertain": top ≥ 0.30 → show up to 3 candidates, foreman picks
- "needs_photo": top < 0.30 → prompt for pole_tag_closeup / full_pole_view / second_angle
- "no_assets": no pole assets in company yet

### Compound GPS accuracy handling:
- If gpsAccuracyM > 10m, effective distance = max(0, raw_distance - accuracy × 0.5)
- Prevents false-negative GPS penalties on poor-GPS devices

### Reference photo flow:
- After foreman confirmation, a pole_reference_photo is auto-created
- pole_assets.referencePhotoCount incremented, isVerified set to true
- Next capture against same pole will score higher (ref photo boost + better visual match)

### Pole asset API:
- GET/POST/PUT /api/pole-assets — CRUD for company-scoped pole registry
- GET /api/pole-assets/:id — includes referencePhotos array (metadata only, no base64)
- GET /api/pole-assets/:id/reference-photos — full reference photo list
- All routes company-isolated via membership check

## Photo-to-Job Pole Filler (original feature, unchanged)
- DB table: `pole_analyses` — stores original photo (base64, immutable), GPS, OCR, AI proposals, confirmation, audit log
- API routes in `artifacts/api-server/src/routes/pole-capture.ts`
- Confirmation gate: nothing written to report until foreman presses "Confirm Pole Analysis"
- Identity engine runs automatically in runAnalysis background job
- After confirmation: creates pole_reference_photo + increments pole_assets.referencePhotoCount

## Scoring algorithm for job matching (separate from identity engine)
- Pole tag hit in recent reports: +0.55 (method="pole_tag")
- Draft report for project today: +0.35 (method="schedule")
- Project status=="active": +0.10
- Capped at 0.99, threshold 0.05 to appear in candidates

## PKB schema quirks
- `daily_reports` has `work_package_id` integer column (added)
- `pkb_version_status` enum in pkb-pole-types.ts; all other PKB tables import it
- `pkb_import_jobs`: fileName (required), insertedCount, updatedCount, skippedCount, errorCount, results (JSONB), status enum: "pending|processing|completed|failed" (NOT "complete")

## Test infrastructure
- Vitest installed in artifacts/api-server (devDependency)
- `pnpm test` runs vitest in api-server — 102 tests pass (43 pole-capture + 59 pole-identity-engine)
- All tests are pure (no DB mock needed) — business logic extracted to lib/ files

## Known incomplete items
- Mobile billing button on report detail: inside hidden md:flex → not visible on mobile
- Training examples section labeled "Configuration Validation" in PKB sidebar — naming mismatch
- No standalone UI to call /api/pkb/analyze from photo step (vision analyze for PKB training)
- CSV import silently skips conflicts with no warning
- No pole registry admin UI (only API; foremancan't browse registered poles in app)
