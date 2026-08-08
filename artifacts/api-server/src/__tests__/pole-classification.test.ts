import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPoleClassificationProposals,
  type CompanyPoleTypeCatalogItem,
  type PoleClassificationEvidence,
  type RawPoleClassification,
} from "../lib/poleClassification";

const context = { companyId: 7, photoId: 91, reportStatus: "draft" };
const evidence = (kind: PoleClassificationEvidence["kind"], detail: string = kind): PoleClassificationEvidence => ({
  photoId: 91,
  kind,
  detail,
});
const catalog: CompanyPoleTypeCatalogItem[] = [
  { id: 1, companyId: 7, axis: "asset_purpose", name: "OH Distribution", genericValues: ["distribution"], active: true },
  { id: 2, companyId: 7, axis: "phase_configuration", name: "3Ø", genericValues: ["three phase", "three_phase"], active: true },
  { id: 3, companyId: 7, axis: "construction_role", name: "Tangent / Straight Line", genericValues: ["tangent"], active: true },
  { id: 4, companyId: 7, axis: "construction_role", name: "JCT", genericValues: ["junction"], active: true },
  { id: 5, companyId: 7, axis: "equipment_role", name: "Luminaire", genericValues: ["light"], active: true },
  { id: 6, companyId: 7, axis: "framing_configuration", name: "Vertical 3-Phase", genericValues: ["vertical"], active: true },
  { id: 7, companyId: 7, axis: "asset_purpose", name: "Light Only", genericValues: ["streetlight_only"], active: true },
  { id: 8, companyId: 7, axis: "phase_configuration", name: "No Primary", genericValues: ["no_primary"], active: true },
  { id: 9, companyId: 7, axis: "asset_purpose", name: "Joint Use", genericValues: ["joint_use"], active: true },
];

function raw(overrides: Partial<RawPoleClassification> = {}): RawPoleClassification {
  return {
    axis: "construction_role",
    genericValue: "tangent",
    confidence: 0.92,
    evidence: [evidence("conductor_geometry", "Conductors continue straight through")],
    ...overrides,
  };
}

test("three-phase tangent is represented as separate company-mapped axes", () => {
  const result = buildPoleClassificationProposals({
    context,
    catalog,
    classifications: [
      raw({ axis: "asset_purpose", genericValue: "distribution", evidence: [evidence("full_pole")] }),
      raw({ axis: "phase_configuration", genericValue: "three_phase", evidence: [evidence("insulator", "Three primary insulator positions")]}),
      raw(),
      raw({ axis: "framing_configuration", genericValue: "vertical", evidence: [evidence("pole_top", "Vertical primary stack")]}),
    ],
  });
  assert.deepEqual(result.map(item => item.companyCatalogMatch?.name), [
    "OH Distribution", "3Ø", "Tangent / Straight Line", "Vertical 3-Phase",
  ]);
  assert.equal(result.every(item => item.reviewRequirement === "foreman_review"), true);
});

test("streetlight-only is distinct from a distribution pole carrying a light", () => {
  assert.throws(() => buildPoleClassificationProposals({
    context,
    catalog,
    classifications: [
      raw({ axis: "asset_purpose", genericValue: "streetlight_only", evidence: [evidence("full_pole")] }),
      raw({ axis: "phase_configuration", genericValue: "three_phase", evidence: [evidence("insulator")] }),
    ],
  }), /streetlight-only/);
  const distributionLight = buildPoleClassificationProposals({
    context,
    catalog,
    classifications: [
      raw({ axis: "asset_purpose", genericValue: "distribution", evidence: [evidence("full_pole")] }),
      raw({ axis: "equipment_role", genericValue: "light", evidence: [evidence("equipment", "Luminaire mounted below primary")]}),
    ],
  });
  assert.deepEqual(distributionLight.map(item => item.genericValue), ["distribution", "light"]);
});

test("junction claims request a conductor-direction view when branch evidence is missing", () => {
  const [result] = buildPoleClassificationProposals({
    context,
    catalog,
    classifications: [raw({ genericValue: "junction", confidence: 0.9, evidence: [evidence("pole_top")] })],
  });
  assert.equal(result.reviewRequirement, "additional_photo");
  assert.match(result.additionalPhotoRequest ?? "", /every conductor direction/);
});

test("partial or obscured phase images request the complete pole top", () => {
  const [result] = buildPoleClassificationProposals({
    context,
    catalog,
    classifications: [raw({
      axis: "phase_configuration",
      genericValue: "three_phase",
      confidence: 0.55,
      evidence: [evidence("full_pole", "Tree obscures two conductor positions")],
    })],
  });
  assert.equal(result.reviewRequirement, "additional_photo");
  assert.match(result.additionalPhotoRequest ?? "", /every primary conductor/);
});

test("company naming maps generic visual facts without cross-company retrieval", () => {
  const foreign = { ...catalog[2], id: 99, companyId: 8, name: "Foreign Tangent" };
  const [result] = buildPoleClassificationProposals({ context, catalog: [foreign, ...catalog], classifications: [raw()] });
  assert.deepEqual(result.companyCatalogMatch, { id: 3, name: "Tangent / Straight Line" });
});

test("joint-use remains an independent purpose instead of flattening attachments into a pole type", () => {
  const result = buildPoleClassificationProposals({
    context,
    catalog,
    classifications: [
      raw({ axis: "asset_purpose", genericValue: "joint_use", evidence: [evidence("full_pole", "Primary and communications visible")] }),
      raw({ axis: "phase_configuration", genericValue: "three_phase", evidence: [evidence("conductor_geometry")] }),
    ],
  });
  assert.deepEqual(result.map(item => item.genericValue), ["joint_use", "three_phase"]);
});

test("unsupported labels, duplicate classifications, wrong photos, and locked reports fail closed", () => {
  assert.throws(() => buildPoleClassificationProposals({ context, catalog, classifications: [raw({ genericValue: "maybe_tangent" })] }), /Unsupported/);
  assert.throws(() => buildPoleClassificationProposals({ context, catalog, classifications: [raw(), raw()] }), /Duplicate/);
  assert.throws(() => buildPoleClassificationProposals({ context, catalog, classifications: [raw({ evidence: [{ ...evidence("pole_top"), photoId: 92 }] })] }), /attached photo/);
  assert.throws(() => buildPoleClassificationProposals({ context: { ...context, reportStatus: "complete" }, catalog, classifications: [raw()] }), /locked/);
});
