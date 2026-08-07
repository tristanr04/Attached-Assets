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
});

test("pole analysis confirmation serializes writers and preserves completed-report locks", () => {
  assert.equal((route.match(/for update/g) ?? []).length, 2);
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

test("confirmation records review decisions without applying billing or final report facts", () => {
  assert.doesNotMatch(route, /reportMaterialsTable|reportEquipmentTable|timeEntriesTable/);
  assert.doesNotMatch(route, /update\(dailyReportsTable\)/);
  assert.match(route, /originalValue: field\.value/);
  assert.match(route, /actorUserId: membership\.userId/);
});
