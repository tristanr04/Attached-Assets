import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmPoleAnalysis,
  parsePoleAnalysisConfirmationRequest,
  scorePoleAnalysisFixture,
  validatePoleAnalysisProposal,
  type PoleAnalysisContext,
  type PoleAnalysisProposal,
} from "../lib/poleAnalysisContract";

const context: PoleAnalysisContext = {
  companyId: 7,
  reportId: 42,
  photoId: 91,
  reportStatus: "draft",
};

function proposal(): PoleAnalysisProposal {
  return {
    analysisId: "pole-analysis:fixture-001",
    version: 1,
    companyId: 7,
    reportId: 42,
    photoId: 91,
    targetMatch: "confirmed",
    targetEvidence: [{ photoId: 91, kind: "ocr", detail: "Fictional tag RDL-1042", companyId: 7 }],
    status: "ai_proposed",
    model: {
      provider: "fixture",
      model: "fictional-pole-analyzer",
      modelVersion: "1.0",
      promptVersion: "pole-structured-v1",
    },
    fields: [
      {
        key: "poleNumber",
        value: "RDL-1042",
        confidence: 0.97,
        state: "ai_proposed",
        evidence: [{ photoId: 91, kind: "ocr", detail: "Tag crop reads RDL-1042" }],
        reviewRequirement: "foreman_review",
      },
      {
        key: "poleMaterial",
        value: "wood",
        confidence: 0.68,
        state: "ai_proposed",
        evidence: [{ photoId: 91, kind: "visual", detail: "Visible grain on pole shaft" }],
        reviewRequirement: "additional_photo",
        additionalPhotoRequest: "Capture the pole shaft and brand at a closer perpendicular angle.",
      },
    ],
  };
}

test("structured pole proposals validate only inside the active company, report, and photo", () => {
  assert.deepEqual(validatePoleAnalysisProposal(proposal(), context), { ok: true });
  for (const changed of [
    { companyId: 8 },
    { reportId: 43 },
    { photoId: 92 },
  ]) {
    const invalid = { ...proposal(), ...changed };
    assert.equal(validatePoleAnalysisProposal(invalid, context).ok, false);
  }
});

test("ambiguous jobs and completed reports cannot receive autofill proposals", () => {
  assert.equal(validatePoleAnalysisProposal({ ...proposal(), targetMatch: "ambiguous" }, context).ok, false);
  assert.equal(validatePoleAnalysisProposal(proposal(), { ...context, reportStatus: "complete" }).ok, false);
});

test("low-confidence fields require a manual choice or a specific additional photo", () => {
  const invalid = proposal();
  invalid.fields[1] = {
    ...invalid.fields[1],
    reviewRequirement: "foreman_review",
    additionalPhotoRequest: undefined,
  };
  assert.equal(validatePoleAnalysisProposal(invalid, context).ok, false);
});

test("unsupported billing or approval fields cannot enter a pole proposal", () => {
  const invalid = proposal();
  invalid.fields.push({
    key: "billingRate" as never,
    value: 250,
    confidence: 0.99,
    state: "ai_proposed",
    evidence: [{ photoId: 91, kind: "visual", detail: "A photo cannot prove a billing rate" }],
    reviewRequirement: "foreman_review",
  });
  const result = validatePoleAnalysisProposal(invalid, context);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(" "), /unsupported analysis field/);
});

test("foreman confirmation requires accept, edit, or reject for every proposal", () => {
  assert.throws(() => confirmPoleAnalysis({
    proposal: proposal(),
    context,
    decisions: [{ fieldKey: "poleNumber", action: "accept" }],
    actorId: 15,
    expectedVersion: 1,
    idempotencyKey: "confirm:fixture-001",
    confirmedAt: "2026-08-07T13:00:00.000Z",
  }), /decision required for poleMaterial/);
});

test("confirmation requests require a bounded retry key and valid field decisions", () => {
  assert.deepEqual(parsePoleAnalysisConfirmationRequest({
    expectedVersion: 1,
    decisions: [
      { fieldKey: "poleNumber", action: "accept" },
      { fieldKey: "poleMaterial", action: "edit", editedValue: "steel" },
    ],
  }, "confirm:fixture-001"), {
    expectedVersion: 1,
    idempotencyKey: "confirm:fixture-001",
    decisions: [
      { fieldKey: "poleNumber", action: "accept" },
      { fieldKey: "poleMaterial", action: "edit", editedValue: "steel" },
    ],
  });
  assert.throws(() => parsePoleAnalysisConfirmationRequest({
    expectedVersion: 1,
    decisions: [{ fieldKey: "poleNumber", action: "accept" }],
  }, "short"), /Idempotency-Key/);
  assert.throws(() => parsePoleAnalysisConfirmationRequest({
    expectedVersion: 1,
    decisions: [
      { fieldKey: "poleNumber", action: "accept" },
      { fieldKey: "poleNumber", action: "reject" },
    ],
  }, "confirm:fixture-001"), /Duplicate decision/);
  assert.throws(() => parsePoleAnalysisConfirmationRequest({
    expectedVersion: 1,
    decisions: [{ fieldKey: "billingRate", action: "accept" }],
  }, "confirm:fixture-001"), /Unsupported decision field/);
});

test("confirmed output preserves the original proposal and foreman corrections immutably", () => {
  const result = confirmPoleAnalysis({
    proposal: proposal(),
    context,
    decisions: [
      { fieldKey: "poleNumber", action: "accept" },
      { fieldKey: "poleMaterial", action: "edit", editedValue: "steel", note: "Verified from brand" },
    ],
    actorId: 15,
    expectedVersion: 1,
    idempotencyKey: "confirm:fixture-001",
    confirmedAt: "2026-08-07T13:00:00.000Z",
  });

  assert.equal(result.status, "foreman_confirmed");
  assert.deepEqual(result.finalValues, { poleNumber: "RDL-1042", poleMaterial: "steel" });
  assert.equal(result.audit.originalProposal.fields[1].value, "wood");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.audit), true);
});

test("stale analysis versions cannot overwrite a newer proposal", () => {
  assert.throws(() => confirmPoleAnalysis({
    proposal: proposal(),
    context,
    decisions: [
      { fieldKey: "poleNumber", action: "accept" },
      { fieldKey: "poleMaterial", action: "reject" },
    ],
    actorId: 15,
    expectedVersion: 2,
    idempotencyKey: "confirm:fixture-001",
    confirmedAt: "2026-08-07T13:00:00.000Z",
  }), /version is stale/);
});

test("fictional fixture scoring reports field-level accuracy", () => {
  const score = scorePoleAnalysisFixture({
    poleNumber: "RDL-1042",
    poleMaterial: "steel",
  }, proposal());
  assert.equal(score.expectedFields, 2);
  assert.equal(score.matchedFields, 1);
  assert.equal(score.fieldAccuracy, 0.5);
  assert.deepEqual(score.fields, [
    { key: "poleNumber", matched: true },
    { key: "poleMaterial", matched: false },
  ]);
});
