import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../lib/poleAnalysisWorkerStore.ts", import.meta.url);

test("PostgreSQL worker claiming uses bounded attempts, leases, and SKIP LOCKED", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /attempt_count < max_attempts/);
  assert.match(source, /available_at <= \$\{now\}/);
  assert.match(source, /lease_expires_at < \$\{now\}/);
  assert.match(source, /for update skip locked/);
  assert.match(source, /attempt_count = job\.attempt_count \+ 1/);
  assert.match(source, /lease_owner = \$\{leaseToken\}/);
});

test("worker context retrieval is company, report, photo, and catalog scoped", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /eq\(dailyReportsTable\.companyId, job\.companyId\)/);
  assert.match(source, /eq\(photosTable\.reportId, job\.reportId\)/);
  assert.match(source, /eq\(poleProfilesTable\.companyId, job\.companyId\)/);
  assert.match(source, /eq\(poleTypeCatalogItemsTable\.companyId, job\.companyId\)/);
});

test("proposal persistence locks report and job and compares the active lease", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /select id from pole_analysis_jobs where id = \$\{job\.id\} for update/);
  assert.match(source, /select id from daily_reports where id = \$\{job\.reportId\} for update/);
  assert.match(source, /eq\(dailyReportsTable\.status, "draft"\)/);
  assert.match(source, /eq\(poleAnalysisJobsTable\.leaseOwner, job\.leaseToken\)/);
  assert.match(source, /tx\.insert\(poleAnalysisRunsTable\)/);
  assert.match(source, /tx\.insert\(poleAnalysisFieldsTable\)/);
  assert.match(source, /status: "succeeded"/);
});

test("worker failures persist only bounded codes through the active lease", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /lastErrorCode: errorCode/);
  assert.match(source, /lastErrorAt: failedAt/);
  assert.match(source, /status === "retry_wait" \? null : failedAt/);
  assert.doesNotMatch(source, /error\.message|error\.stack/);
});
