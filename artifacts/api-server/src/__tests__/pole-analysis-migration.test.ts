import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../../lib/db/migrations/0001_pole_analysis.sql", import.meta.url);
const rollbackUrl = new URL("../../../../lib/db/migrations/0001_pole_analysis.down.sql", import.meta.url);
const schemaUrl = new URL("../../../../lib/db/src/schema/pole-analysis.ts", import.meta.url);

test("pole analysis migration is additive and repeat-safe", async () => {
  const source = await readFile(migrationUrl, "utf8");
  assert.equal(source.match(/CREATE TABLE IF NOT EXISTS/g)?.length, 9);
  assert.equal(source.match(/CREATE UNIQUE INDEX IF NOT EXISTS/g)?.length, 19);
  assert.doesNotMatch(source, /ALTER TABLE|TRUNCATE|DELETE FROM|DROP TABLE/i);
  assert.match(source, /BEGIN;/);
  assert.match(source, /COMMIT;/);
});

test("pole persistence enforces company scope, immutable evidence, versions, and retry receipts", async () => {
  const source = await readFile(migrationUrl, "utf8");
  assert.match(source, /pole_profiles\(company_id, asset_key\)/);
  assert.match(source, /pole_type_catalog_items\(company_id, axis, code\)/);
  assert.match(source, /pole_reference_photos\(company_id, image_sha256\)/);
  assert.match(source, /pole_analysis_jobs\(company_id, request_key\)/);
  assert.match(source, /pole_analysis_jobs\(photo_id, generation\)/);
  assert.match(source, /pole_analysis_jobs\(company_id, manual_fallback_idempotency_key\)/);
  assert.match(source, /cancelled_by_user_id integer REFERENCES users\(id\)/);
  assert.match(source, /cancellation_reason.*manual_fallback.*locked_report/);
  assert.match(source, /status IN \('queued', 'processing', 'retry_wait', 'succeeded', 'failed', 'cancelled'\)/);
  assert.match(source, /pole_analysis_runs\(photo_id, version\)/);
  assert.match(source, /pole_analysis_runs\(company_id, idempotency_key\)/);
  assert.match(source, /pole_analysis_runs\(company_id, confirmation_idempotency_key\)/);
  assert.match(source, /confirmed_by_user_id integer REFERENCES users\(id\)/);
  assert.match(source, /pole_analysis_decisions\(analysis_run_id, field_key\)/);
  assert.match(source, /report_pole_facts\(analysis_run_id, field_key\)/);
  assert.match(source, /decision_action IN \('accept', 'edit'\)/);
  assert.match(source, /pole_analysis_runs\(company_id, report_id, photo_id, id\)/);
  assert.match(source, /report_pole_facts_scope_run_fk/);
  assert.match(source, /FOREIGN KEY \(company_id, report_id, photo_id, analysis_run_id\)/);
  assert.match(source, /REFERENCES photos\(id\)(?! ON DELETE CASCADE)/);
  assert.match(source, /FOREIGN KEY \(company_id, pole_profile_id\) REFERENCES pole_profiles\(company_id, id\)/);
  assert.match(source, /FOREIGN KEY \(company_id, analysis_run_id\) REFERENCES pole_analysis_runs\(company_id, id\)/);
});

test("database schema mirrors migration constraints and exports all pole tables", async () => {
  const source = await readFile(schemaUrl, "utf8");
  for (const table of [
    "poleProfilesTable",
    "poleTypeCatalogItemsTable",
    "poleReferencePhotosTable",
    "poleAnalysisJobsTable",
    "poleAnalysisRunsTable",
    "poleAnalysisCandidatesTable",
    "poleAnalysisFieldsTable",
    "poleAnalysisDecisionsTable",
    "reportPoleFactsTable",
  ]) assert.match(source, new RegExp(`export const ${table}`));
  assert.match(source, /companyId, table\.idempotencyKey/);
  assert.match(source, /companyId, table\.requestKey/);
  assert.match(source, /table\.photoId, table\.generation/);
  assert.match(source, /companyId, table\.manualFallbackIdempotencyKey/);
  assert.match(source, /cancelledByUserId/);
  assert.match(source, /companyId, table\.confirmationIdempotencyKey/);
  assert.match(source, /table\.photoId, table\.version/);
  assert.match(source, /table\.analysisRunId, table\.fieldKey/);
  assert.match(source, /report_pole_facts/);
  assert.match(source, /columns: \[table\.companyId, table\.reportId, table\.photoId, table\.analysisRunId\]/);
  assert.equal(source.match(/columns: \[table\.companyId, table\.poleProfileId\]/g)?.length, 2);
  assert.match(source, /columns: \[table\.companyId, table\.analysisRunId\]/);
});

test("rollback removes only new pole-analysis tables in dependency-safe order", async () => {
  const source = await readFile(rollbackUrl, "utf8");
  const drops = [...source.matchAll(/DROP TABLE IF EXISTS ([a-z_]+);/g)].map(match => match[1]);
  assert.deepEqual(drops, [
    "report_pole_facts",
    "pole_analysis_decisions",
    "pole_analysis_fields",
    "pole_analysis_candidates",
    "pole_analysis_runs",
    "pole_analysis_jobs",
    "pole_reference_photos",
    "pole_type_catalog_items",
    "pole_profiles",
  ]);
  assert.doesNotMatch(source, /DROP TABLE IF EXISTS (companies|daily_reports|photos|projects|users);/);
});
