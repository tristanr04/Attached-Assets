import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../routes/pole-analysis.ts", import.meta.url), "utf8");

test("pole analysis confirmation is authenticated, foreman-owned, and report/photo scoped", () => {
  assert.match(route, /requireAuth/);
  assert.match(route, /membership\.userId !== report\.foremanId/);
  assert.match(route, /eq\(photosTable\.reportId, reportId\)/);
  assert.match(route, /eq\(poleAnalysisRunsTable\.companyId, report\.companyId\)/);
  assert.match(route, /eq\(poleAnalysisRunsTable\.reportId, reportId\)/);
  assert.match(route, /eq\(poleAnalysisRunsTable\.photoId, photoId\)/);
});

test("review reads enforce report access and return structured evidence without raw provider output", () => {
  assert.match(route, /canAccessReport\(membership\.role, membership\.userId, report\.foremanId\)/);
  assert.match(route, /poleAnalysisCandidatesTable/);
  assert.match(route, /targetEvidence: run\.targetEvidence/);
  assert.match(route, /reviewRequirement: field\.reviewRequirement/);
  assert.match(route, /signalEvidence: candidate\.signalEvidence/);
  assert.doesNotMatch(route, /rawResult: run\.rawResult/);
  assert.match(route, /orderBy\(desc\(poleAnalysisRunsTable\.version\)\)\.limit\(1\)/);
  assert.match(route, /analysis: run \? \{/);
  assert.match(route, /\.\.\.await reviewResponseFor\(run\)/);
  assert.match(route, /canConfirm: Boolean\(membership\.userId && membership\.userId === report\.foremanId\)/);
  assert.match(route, /eq\(poleAnalysisJobsTable\.companyId, report\.companyId\)/);
  assert.match(route, /eq\(poleAnalysisJobsTable\.reportId, reportId\)/);
  assert.match(route, /eq\(poleAnalysisJobsTable\.photoId, photoId\)/);
  assert.doesNotMatch(route, /leaseOwner: job\.leaseOwner|leaseExpiresAt: job\.leaseExpiresAt/);
});

test("manual fallback is assigned-foreman-only, serialized, and cannot bypass proposals", () => {
  assert.match(route, /pole-analysis\/manual-fallback/);
  assert.match(route, /parseIdempotencyKey\(req\.get\("Idempotency-Key"\)\)/);
  assert.match(route, /membership\.userId !== report\.foremanId/);
  assert.match(route, /Review the existing AI proposal instead of continuing manually/);
  assert.match(route, /select id from pole_analysis_jobs where id = \$\{jobIdentity\.id\} for update/);
  assert.match(route, /manualFallbackIdempotencyKey: idempotencyKey/);
  assert.match(route, /cancelledByUserId: membership\.userId/);
  assert.match(route, /cancellationReason: "manual_fallback"/);
  assert.match(route, /replayed: true/);
});

test("pole analysis confirmation serializes writers and preserves completed-report locks", () => {
  assert.ok((route.match(/for update/g) ?? []).length >= 4);
  assert.match(route, /report\.status !== "draft"/);
  assert.match(route, /db\.transaction/);
  assert.match(route, /poleAnalysisDecisionsTable/);
  assert.match(route, /confirmationIdempotencyKey: input\.idempotencyKey/);
  assert.match(route, /eq\(poleAnalysisRunsTable\.status, "ai_proposed"\)/);
  assert.match(route, /eq\(poleAnalysisRunsTable\.version, input\.expectedVersion\)/);
});

test("confirmation retries replay only the original receipt", () => {
  assert.match(route, /run\.confirmationIdempotencyKey !== input\.idempotencyKey/);
  assert.match(route, /responseFor\(run, existingDecisions, true\)/);
  assert.match(route, /already confirmed by another request/);
});

test("confirmation projects accepted and edited facts without applying billing", () => {
  assert.doesNotMatch(route, /reportMaterialsTable|reportEquipmentTable|timeEntriesTable/);
  assert.doesNotMatch(route, /update\(dailyReportsTable\)/);
  assert.match(route, /originalValue: field\.value/);
  assert.match(route, /actorUserId: membership\.userId/);
  assert.match(route, /confirmedFacts = insertedDecisions\.filter\(decision => decision\.action !== "reject"\)/);
  assert.match(route, /tx\.insert\(reportPoleFactsTable\)/);
  assert.match(route, /analysisVersion: run\.version/);
  assert.match(route, /value: decision\.finalValue!/);
});

test("confirmed fact reads remain report/company scoped and omit billing data", () => {
  assert.match(route, /\/reports\/:reportId\/pole-facts/);
  assert.match(route, /eq\(reportPoleFactsTable\.companyId, report\.companyId\)/);
  assert.match(route, /eq\(reportPoleFactsTable\.reportId, reportId\)/);
  assert.match(route, /canAccessReport\(membership\.role, membership\.userId, report\.foremanId\)/);
  assert.doesNotMatch(route, /rate: reportPoleFactsTable|charge: reportPoleFactsTable/);
});
