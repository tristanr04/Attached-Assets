import assert from "node:assert/strict";
import test from "node:test";

import type { PoleAnalysisProposal } from "../lib/poleAnalysisContract";
import {
  PoleAnalysisProviderError,
  runPoleAnalysisWorkerOnce,
  type LeasedPoleAnalysisJob,
  type PoleAnalysisWorkerContext,
  type PoleAnalysisWorkerStore,
} from "../lib/poleAnalysisWorker";

const now = new Date("2026-08-07T20:00:00.000Z");
const job: LeasedPoleAnalysisJob = {
  id: 9,
  companyId: 2,
  reportId: 20,
  photoId: 200,
  requestKey: "pole-photo-request-001",
  generation: 1,
  attemptCount: 1,
  maxAttempts: 3,
  leaseToken: "lease-token-001",
};
const context: PoleAnalysisWorkerContext = {
  companyId: 2,
  reportId: 20,
  photoId: 200,
  reportStatus: "draft",
  photoUrl: "data:image/jpeg;base64,/9j/fictional",
  companyProfiles: [{ companyId: 2, assetKey: "pole-20" }],
  companyTypeCatalog: [{ companyId: 2, code: "3PH-TAN" }],
};
const proposal: PoleAnalysisProposal = {
  analysisId: "analysis-worker-001",
  version: 1,
  companyId: 2,
  reportId: 20,
  photoId: 200,
  targetMatch: "confirmed",
  status: "ai_proposed",
  targetEvidence: [{ photoId: 200, kind: "ocr", detail: "Tag P-20", companyId: 2 }],
  model: { provider: "fixture", model: "fake", modelVersion: "1", promptVersion: "1" },
  fields: [{
    key: "constructionRole",
    value: "three-phase tangent",
    confidence: 0.91,
    state: "ai_proposed",
    evidence: [{ photoId: 200, kind: "visual", detail: "Three aligned tangent insulators", companyId: 2 }],
    reviewRequirement: "foreman_review",
  }],
};

function store(overrides: Partial<PoleAnalysisWorkerStore> = {}) {
  const calls: Array<{ kind: string; input: unknown }> = [];
  const value: PoleAnalysisWorkerStore = {
    async leaseNext(input) { calls.push({ kind: "lease", input }); return job; },
    async loadContext(input) { calls.push({ kind: "context", input }); return context; },
    async commitProposal(input) { calls.push({ kind: "commit", input }); return "committed"; },
    async recordFailure(input) { calls.push({ kind: "failure", input }); return "recorded"; },
    ...overrides,
  };
  return { value, calls };
}

test("worker stays disabled without claiming or calling a provider", async () => {
  const fixture = store();
  let providerCalls = 0;
  const result = await runPoleAnalysisWorkerOnce({
    enabled: false,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { providerCalls += 1; return proposal; } },
  });
  assert.deepEqual(result, { status: "disabled" });
  assert.equal(fixture.calls.length, 0);
  assert.equal(providerCalls, 0);
});

test("valid company-scoped output commits through the active lease", async () => {
  const fixture = store();
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze(received) { assert.equal(received.companyId, 2); return proposal; } },
    now,
  });
  assert.deepEqual(result, { status: "succeeded", jobId: 9 });
  assert.deepEqual(fixture.calls.map(call => call.kind), ["lease", "context", "commit"]);
});

test("cross-company or wrong-photo context fails before provider execution", async () => {
  let providerCalls = 0;
  const fixture = store({ async loadContext() { return { ...context, companyId: 3 }; } });
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { providerCalls += 1; return proposal; } },
    now,
  });
  assert.deepEqual(result, { status: "failed", jobId: 9, errorCode: "scope_mismatch" });
  assert.equal(providerCalls, 0);
});

test("completed reports are cancelled without analysis", async () => {
  const fixture = store({ async loadContext() { return { ...context, reportStatus: "complete" }; } });
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { throw new Error("must not run"); } },
    now,
  });
  assert.deepEqual(result, { status: "cancelled", jobId: 9, errorCode: "locked_report" });
});

test("invalid provider scope is terminal and never reaches persistence", async () => {
  const fixture = store();
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { return { ...proposal, companyId: 999 }; } },
    now,
  });
  assert.deepEqual(result, { status: "failed", jobId: 9, errorCode: "invalid_provider_output" });
  assert.equal(fixture.calls.some(call => call.kind === "commit"), false);
});

test("retryable provider failures back off without persisting error text", async () => {
  const fixture = store();
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { throw new PoleAnalysisProviderError("provider_unavailable", true); } },
    now,
  });
  assert.deepEqual(result, { status: "retry_scheduled", jobId: 9, errorCode: "provider_unavailable" });
  const failure = fixture.calls.find(call => call.kind === "failure")?.input as { retryAt: Date; errorCode: string };
  assert.equal(failure.errorCode, "provider_unavailable");
  assert.equal(failure.retryAt.toISOString(), "2026-08-07T20:00:30.000Z");
  assert.doesNotMatch(JSON.stringify(failure), /stack|message|secret/i);
});

test("expired attempt budgets fail instead of retrying forever", async () => {
  const exhausted = { ...job, attemptCount: 3 };
  const fixture = store({ async leaseNext() { return exhausted; } });
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { throw new PoleAnalysisProviderError("provider_unavailable", true); } },
    now,
  });
  assert.deepEqual(result, { status: "failed", jobId: 9, errorCode: "provider_unavailable" });
});

test("provider timeouts abort and schedule a bounded retry", async () => {
  const fixture = store();
  let aborted = false;
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: {
      analyze(_context, signal) {
        signal.addEventListener("abort", () => { aborted = true; });
        return new Promise(() => undefined);
      },
    },
    now,
    timeoutMs: 1,
  });
  assert.deepEqual(result, { status: "retry_scheduled", jobId: 9, errorCode: "provider_timeout" });
  assert.equal(aborted, true);
});

test("a stale lease cannot overwrite a newer worker result", async () => {
  const fixture = store({ async commitProposal() { return "stale_lease"; } });
  const result = await runPoleAnalysisWorkerOnce({
    enabled: true,
    workerId: "worker-fixture-001",
    store: fixture.value,
    provider: { async analyze() { return proposal; } },
    now,
  });
  assert.deepEqual(result, { status: "stale_lease", jobId: 9 });
});
