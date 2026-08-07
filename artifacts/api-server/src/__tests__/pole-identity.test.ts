import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePoleIdentity,
  type PoleIdentityObservation,
  type VerifiedPoleProfile,
} from "../lib/poleIdentity";

const hash = (value: string) => value.repeat(64).slice(0, 64);
const capturedAt = "2026-08-07T13:00:00.000Z";

function profile(overrides: Partial<VerifiedPoleProfile> = {}): VerifiedPoleProfile {
  return {
    companyId: 7,
    poleAssetId: 101,
    poleNumber: "RDL-1042",
    locationLabel: "North gate",
    coordinate: { latitude: 32.0001, longitude: -97.0001 },
    projectIds: [20],
    workOrderIds: [30],
    tags: ["TXU 1042"],
    visualAttributes: ["wood", "single-crossarm", "transformer", "red-barn"],
    referencePhotos: [{ photoId: 501, imageSha256: hash("b"), verifiedAt: "2026-07-01T00:00:00.000Z" }],
    ...overrides,
  };
}

function observation(overrides: Partial<PoleIdentityObservation> = {}): PoleIdentityObservation {
  return {
    companyId: 7,
    photoId: 900,
    imageSha256: hash("a"),
    capturedAt,
    tags: [{ value: "RDL 1042", confidence: 0.98, source: "ocr" }],
    gps: { latitude: 32.00011, longitude: -97.00011 },
    activeProjectIds: [20],
    activeWorkOrderIds: [30],
    visual: {
      attributes: ["wood", "single-crossarm", "transformer", "red-barn"],
      similarityByReferencePhotoId: { 501: 0.94 },
    },
    ...overrides,
  };
}

test("proposes an exact pole only when independent signals agree", () => {
  const result = resolvePoleIdentity(observation(), [profile()]);
  assert.equal(result.match, "exact_proposal");
  assert.equal(result.selected?.poleAssetId, 101);
  assert.deepEqual(result.selected?.strongSignals, ["tag", "gps", "visual"]);
  assert.equal(result.confirmationRequired, true);
});

test("adjacent lookalike poles remain ambiguous when the ranking margin is unsafe", () => {
  const second = profile({
    poleAssetId: 102,
    poleNumber: "RDL-1043",
    tags: ["RDL-1043"],
    coordinate: { latitude: 32.00012, longitude: -97.00012 },
    referencePhotos: [{ photoId: 502, imageSha256: hash("c"), verifiedAt: "2026-07-01T00:00:00.000Z" }],
  });
  const result = resolvePoleIdentity(observation({
    tags: [],
    visual: {
      attributes: ["wood", "single-crossarm", "transformer", "red-barn"],
      similarityByReferencePhotoId: { 501: 0.93, 502: 0.92 },
    },
  }), [profile(), second]);
  assert.equal(result.match, "ambiguous");
  assert.deepEqual(result.candidates.map(candidate => candidate.poleAssetId), [101, 102]);
  assert.match(result.additionalPhotoRequest ?? "", /pole number|tag|barcode/);
});

test("missing tags request a specific close-up instead of guessing", () => {
  const result = resolvePoleIdentity(observation({
    tags: [],
    visual: { attributes: ["wood"], similarityByReferencePhotoId: { 501: 0.7 } },
  }), [profile()]);
  assert.equal(result.match, "ambiguous");
  assert.match(result.additionalPhotoRequest ?? "", /close-up/);
});

test("inaccurate GPS can be outvoted by a verified tag and current visual reference", () => {
  const result = resolvePoleIdentity(observation({
    gps: { latitude: 33, longitude: -98 },
  }), [profile()]);
  assert.equal(result.match, "exact_proposal");
  assert.deepEqual(result.selected?.strongSignals, ["tag", "visual"]);
});

test("old reference photos are discounted and cannot create a strong visual signal", () => {
  const stale = profile({
    referencePhotos: [{ photoId: 501, imageSha256: hash("b"), verifiedAt: "2020-01-01T00:00:00.000Z" }],
  });
  const result = resolvePoleIdentity(observation({ tags: [] }), [stale]);
  assert.equal(result.match, "ambiguous");
  assert.equal(result.candidates[0].strongSignals.includes("visual"), false);
  assert.match(result.candidates[0].evidence.find(item => item.signal === "visual")?.detail ?? "", /stale-reference/);
});

test("cross-company profiles never enter retrieval or ranked suggestions", () => {
  const foreign = profile({ companyId: 8, poleAssetId: 999, poleNumber: "RDL-1042" });
  const result = resolvePoleIdentity(observation(), [foreign]);
  assert.equal(result.match, "no_match");
  assert.deepEqual(result.candidates, []);
});

test("duplicate uploads are identified against verified reference photos", () => {
  const duplicate = profile({
    referencePhotos: [{ photoId: 501, imageSha256: hash("a"), verifiedAt: "2026-07-01T00:00:00.000Z" }],
  });
  const result = resolvePoleIdentity(observation(), [duplicate]);
  assert.deepEqual(result.selected?.duplicateReferencePhotoIds, [501]);
});

test("ranked ambiguity returns no more than three company-scoped choices", () => {
  const profiles = [101, 102, 103, 104].map(poleAssetId => profile({
    poleAssetId,
    poleNumber: `RDL-${poleAssetId}`,
    tags: [],
  }));
  const result = resolvePoleIdentity(observation({ tags: [] }), profiles);
  assert.equal(result.match, "ambiguous");
  assert.equal(result.candidates.length, 3);
  assert.equal(result.selected, undefined);
});
